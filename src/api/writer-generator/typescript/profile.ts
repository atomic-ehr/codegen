import { uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import {
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isProfileIdentifier,
    isResourceIdentifier,
    isSnapshotProfileIdentifier,
    packageMeta,
    packageMetaToFhir,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsCamelCase,
    tsExtensionExtractedTypeName,
    tsExtensionFlatTypeName,
    tsExtensionVFlatTypeName,
    tsFieldName,
    tsProfileClassName,
    tsProfileModuleName,
    tsResourceName,
    tsSliceFlatAllTypeName,
    tsSliceFlatTypeName,
    tsSliceStaticName,
} from "./name";
import {
    collectSubExtensionSlices,
    extensionExtractedTypes,
    extensionTypeRef,
    generateExtensionMethods,
    resolveExtensionProfile,
    subExtensionTsType,
} from "./profile-extensions";
import {
    collectRequiredSliceNames,
    collectSliceDefs,
    generateSliceGetters,
    generateSliceSetters,
    type SliceDef,
} from "./profile-slices";
import { generateValidateMethod } from "./profile-validation";
import { fieldTsType, profileHelper, type TsImports, tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    /** Array fields with required slices — optional param with auto-merge of required stubs */
    sliceAutoFields: { name: string; tsType: string; typeId: TypeIdentifier; sliceNames: string[] }[];
    params: { name: string; tsType: string; typeId: TypeIdentifier }[];
    /** `choiceClearMethod` names the helper a choice setter calls to clear its sibling variants. */
    accessors: { name: string; tsType: string; typeId: TypeIdentifier; choiceClearMethod?: string }[];
    /** One helper per multi-variant choice group: clears every variant of that choice. */
    choiceClearMethods: { method: string; variants: string[] }[];
    /** Accessor names that come from valueConstraint fields — skip generating setters for these */
    fixedFields: Set<string>;
};

/** Public helper name that clears all variants of a choice group, e.g. `clearValue`. */
const choiceClearMethodName = (choiceOf: string): string => `clear${uppercaseFirstLetter(tsCamelCase(choiceOf))}`;

const collectChoiceAccessors = (
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    promotedChoices: Set<string>,
): Pick<ProfileFactoryInfo, "accessors" | "choiceClearMethods"> => {
    // Group every choice-instance field by its declaration (choiceOf). A profile
    // that constrains value[x] narrows the declaration's `choices` list, but the
    // base variants still exist as instance fields with generated setters — so
    // siblings must come from the instances, not the (possibly narrowed) `choices`.
    const variantsByChoice: Record<string, string[]> = {};
    for (const [name, field] of Object.entries(snapshot.fields)) {
        if (field.excluded) continue;
        if (!isChoiceInstanceField(field)) continue;
        (variantsByChoice[field.choiceOf] ??= []).push(name);
    }

    const accessors: ProfileFactoryInfo["accessors"] = [];
    for (const [name, field] of Object.entries(snapshot.fields)) {
        if (field.excluded) continue;
        if (!isChoiceInstanceField(field)) continue;
        if (promotedChoices.has(name)) continue;
        const tsType = tsTypeFromIdentifier(imports, field.type) + (field.array ? "[]" : "");
        // value[x] variants are mutually exclusive — a single-variant group has
        // nothing to clear, so only multi-variant groups get a clear helper.
        const hasSiblings = (variantsByChoice[field.choiceOf]?.length ?? 0) > 1;
        const choiceClearMethod = hasSiblings ? choiceClearMethodName(field.choiceOf) : undefined;
        accessors.push({ name, tsType, typeId: field.type, choiceClearMethod });
    }

    const choiceClearMethods = Object.entries(variantsByChoice)
        .filter(([, variants]) => variants.length > 1)
        .map(([choiceOf, variants]) => ({
            method: choiceClearMethodName(choiceOf),
            variants: variants.map(tsFieldName),
        }));

    return { accessors, choiceClearMethods };
};

/** Try to promote a required single-choice declaration to a direct param */
const tryPromoteChoice = (
    imports: TsImports,
    field: SnapshotProfileTypeSchema["fields"][string],
    fields: SnapshotProfileTypeSchema["fields"],
    params: ProfileFactoryInfo["params"],
    promotedChoices: Set<string>,
    resolveRef?: (ref: TypeIdentifier) => TypeIdentifier,
    isFamilyType?: (ref: TypeIdentifier) => boolean,
): void => {
    if (!isChoiceDeclarationField(field) || !field.required || field.choices.length !== 1) return;
    const choiceName = field.choices[0];
    if (!choiceName) return;
    const choiceField = fields[choiceName];
    if (!choiceField || !isChoiceInstanceField(choiceField)) return;
    const tsType = fieldTsType(imports, choiceField, resolveRef, isFamilyType);
    params.push({ name: choiceName, tsType, typeId: choiceField.type });
    promotedChoices.add(choiceName);
};

/** Field types in the result are written with `imports`: use them only in the module that owns it. */
export const collectProfileFactoryInfo = (
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fixedFields = new Set<string>();
    const fields = snapshot.fields;
    const promotedChoices = new Set<string>();
    const resolveRef = tsIndex.findLastSpecializationByIdentifier;
    const isFamilyType = tsIndex.isFamilyType;

    if (isResourceIdentifier(snapshot.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(snapshot.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            tryPromoteChoice(imports, field, fields, params, promotedChoices, resolveRef, isFamilyType);
            continue;
        }

        if (field.valueConstraint && !field.valueConstraint.validateOnly) {
            // A fixed value equal to the profile's own canonical URL is already a static on the
            // class, so reference it instead of repeating the literal.
            const value =
                field.valueConstraint.value === snapshot.identifier.url
                    ? `${tsProfileClassName(snapshot)}.canonicalUrl`
                    : JSON.stringify(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            fixedFields.add(name);
            if (isNotChoiceDeclarationField(field) && field.type) {
                const tsType = fieldTsType(imports, field, resolveRef, isFamilyType);
                autoAccessors.push({ name, tsType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field, snapshot.slicing?.[name]);
            if (sliceNames) {
                if (field.type) {
                    const tsType = fieldTsType(imports, field, resolveRef, isFamilyType);
                    sliceAutoFields.push({
                        name,
                        tsType,
                        typeId: field.type,
                        sliceNames,
                    });
                    autoAccessors.push({ name, tsType, typeId: field.type });
                }
                continue;
            }
        }

        if (field.required) {
            const tsType = fieldTsType(imports, field, resolveRef, isFamilyType);
            params.push({ name, tsType, typeId: field.type });
        }
    }

    collectBaseRequiredParams(
        tsIndex,
        imports,
        snapshot,
        resolveRef,
        params,
        [
            ...autoFields.map((f) => f.name),
            ...sliceAutoFields.map((f) => f.name),
            ...params.map((f) => f.name),
            ...promotedChoices,
        ],
        isFamilyType,
    );

    const { accessors: choiceAccessors, choiceClearMethods } = collectChoiceAccessors(
        imports,
        snapshot,
        promotedChoices,
    );
    const accessors = [...autoAccessors, ...choiceAccessors];
    return { autoFields, sliceAutoFields, params, accessors, choiceClearMethods, fixedFields };
};

/** Include base-type required fields not already covered by profile constraints */
const collectBaseRequiredParams = (
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    params: ProfileFactoryInfo["params"],
    coveredNames: string[],
    isFamilyType?: (ref: TypeIdentifier) => boolean,
) => {
    const covered = new Set(coveredNames);
    const baseSchema = tsIndex.resolveType(snapshot.base);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return;
    for (const [name, field] of Object.entries(baseSchema.fields)) {
        if (covered.has(name)) continue;
        if (!field.required) continue;
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) continue;
        if (isNotChoiceDeclarationField(field) && field.type) {
            const tsType = fieldTsType(imports, field, resolveRef, isFamilyType);
            params.push({ name, tsType, typeId: field.type });
        }
    }
};

export const generateProfileIndexFile = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    snapshots: SnapshotProfileTypeSchema[],
) => {
    if (snapshots.length === 0) return;
    w.cd("profiles", () => {
        w.cat("index.ts", () => {
            const exports: Map<string, string> = new Map();
            for (const snapshot of snapshots) {
                const className = tsProfileClassName(snapshot);
                if (!exports.has(className)) {
                    exports.set(className, tsProfileModuleName(tsIndex, snapshot));
                }
            }
            for (const className of [...exports.keys()].sort()) {
                w.tsExport(`./${exports.get(className)}`, className);
            }
        });
    });
};

const generateStaticSliceFields = (w: TypeScript, sliceDefs: SliceDef[]) => {
    for (const sliceDef of sliceDefs) {
        const staticName = `${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
        const json = JSON.stringify(sliceDef.match);
        const prefix = `private static readonly ${staticName}: Record<string, unknown> = `;
        if (prefix.length + json.length <= (w.opts.lineWidth ?? 120)) {
            w.lineSM(`${prefix}${json}`);
        } else {
            w.curlyBlock([prefix.trimEnd()], () => {
                for (const [key, value] of Object.entries(sliceDef.match)) {
                    w.line(`${JSON.stringify(key)}: ${JSON.stringify(value)},`);
                }
            });
        }
    }
    if (sliceDefs.length > 0) w.line();
};

const generateFactoryMethods = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
) => {
    const profileClassName = tsProfileClassName(snapshot);
    const tsBaseResourceName = tsTypeFromIdentifier(imports, snapshot.base);
    const hasMeta = tsIndex.isWithMetaField(snapshot);
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;
    const createArgsTypeName = `${profileClassName}Raw`;
    const paramSignature = hasParams ? `args: ${createArgsTypeName}` : "";
    const allFields = [
        ...factoryInfo.autoFields.map((f) => ({ name: f.name, value: f.value })),
        ...factoryInfo.sliceAutoFields.map((f) => ({ name: f.name, value: `${f.name}WithDefaults` })),
        ...factoryInfo.params.map((p) => ({ name: p.name, value: `args.${p.name}` })),
    ];
    w.curlyBlock(["constructor", `(resource: ${tsBaseResourceName})`], () => {
        w.lineSM("this.resource = resource");
    });
    w.line();
    w.curlyBlock(["static", "from", `(resource: ${tsBaseResourceName})`, `: ${profileClassName}`], () => {
        if (hasMeta) {
            w.curlyBlock(["if", `(!resource.meta?.profile?.includes(${profileClassName}.canonicalUrl))`], () => {
                w.line(
                    `throw new Error(\`${profileClassName}: meta.profile must include \${${profileClassName}.canonicalUrl}\`)`,
                );
            });
        }
        w.lineSM(`const profile = new ${profileClassName}(resource)`);
        w.lineSM("const { errors } = profile.validate()");
        w.line(`if (errors.length > 0) throw new Error(errors.join("; "))`);
        w.lineSM("return profile");
    });
    w.line();
    const canEmitIs = (hasMeta && isResourceIdentifier(snapshot.base)) || snapshot.base.name === "Extension";
    if (canEmitIs) {
        w.curlyBlock(["static", "is", "(resource: unknown)", `: resource is ${tsBaseResourceName}`], () => {
            w.line(`if (typeof resource !== "object" || resource === null) return false;`);
            if (hasMeta && isResourceIdentifier(snapshot.base)) {
                w.line(`const r = resource as { resourceType?: string; meta?: { profile?: string[] } };`);
                w.line(`if (r.resourceType !== ${JSON.stringify(snapshot.base.name)}) return false;`);
                w.lineSM(`return (r.meta?.profile ?? []).includes(${profileClassName}.canonicalUrl)`);
            } else {
                w.lineSM(`return (resource as { url?: string }).url === ${profileClassName}.canonicalUrl`);
            }
        });
        w.line();
    }
    w.curlyBlock(["static", "apply", `(resource: ${tsBaseResourceName})`, `: ${profileClassName}`], () => {
        if (hasMeta) {
            w.lineSM(`${profileHelper(imports, "ensureProfile")}(resource, ${profileClassName}.canonicalUrl)`);
        }
        if (snapshot.base.name === "Extension" && snapshot.identifier.url) {
            w.lineSM(`resource.url = ${profileClassName}.canonicalUrl`);
        }
        const applyAutoFields = factoryInfo.autoFields.filter((f) => f.name !== "resourceType");
        if (applyAutoFields.length > 0) {
            for (const f of applyAutoFields) {
                w.lineSM(
                    `${profileHelper(imports, "applyFixedValue")}(resource, ${JSON.stringify(f.name)}, ${f.value})`,
                );
            }
        }
        for (const f of factoryInfo.sliceAutoFields) {
            const matchRefs = f.sliceNames.map((s) => `${profileClassName}.${tsSliceStaticName(s)}SliceMatch`);
            w.line(`resource.${f.name} = ${profileHelper(imports, "ensureSliceDefaults")}(`);
            w.indentBlock(() => {
                w.line(`[...(resource.${f.name} ?? [])],`);
                for (const ref of matchRefs) {
                    w.line(`${ref},`);
                }
            });
            w.lineSM(")");
        }
        w.lineSM(`return new ${profileClassName}(resource)`);
    });
    w.line();
    // For extension profiles with sub-extension slices: generate resolveInput helper,
    // widen createResource and create to accept Input | Raw
    const subSlicesForInput = snapshot.base.name === "Extension" ? collectSubExtensionSlices(snapshot) : [];
    const hasInputHelper = subSlicesForInput.length > 0;
    const requiresFactoryInput = hasParams || subSlicesForInput.some((sub) => sub.isRequired);

    if (hasInputHelper) {
        const rawInputTypeName = `${profileClassName}Raw`;
        const inputTypeName = `${profileClassName}Flat`;
        const extensionType = extensionTypeRef(tsIndex, imports, snapshot);

        // Private helper: converts Input to Extension[], passes through Raw.extension
        w.curlyBlock(
            [
                "private static",
                "resolveInput",
                `(args: ${rawInputTypeName} | ${inputTypeName})`,
                `: ${extensionType}[]`,
            ],
            () => {
                w.ifElseChain(
                    [
                        {
                            cond: `${profileHelper(imports, "isRawExtensionInput")}<${rawInputTypeName}>(args)`,
                            body: () => w.lineSM("return args.extension ?? []"),
                        },
                    ],
                    () => {
                        w.lineSM(`const result: ${extensionType}[] = []`);
                        for (const sub of subSlicesForInput) {
                            if (sub.isArray) {
                                w.curlyBlock(["if", `(args.${sub.name})`], () => {
                                    w.curlyBlock(["for", `(const item of args.${sub.name})`], () => {
                                        w.lineSM(
                                            `result.push({ url: "${sub.url}", ${sub.valueField}: item } as ${extensionType})`,
                                        );
                                    });
                                });
                            } else {
                                w.curlyBlock(["if", `(args.${sub.name} !== undefined)`], () => {
                                    w.lineSM(
                                        `result.push({ url: "${sub.url}", ${sub.valueField}: args.${sub.name} } as ${extensionType})`,
                                    );
                                });
                            }
                        }
                        w.lineSM("return result");
                    },
                );
            },
        );
        w.line();

        // createResource — accepts Input | Raw
        const createResourceSig = requiresFactoryInput
            ? `args: ${rawInputTypeName} | ${inputTypeName}`
            : `args?: ${rawInputTypeName} | ${inputTypeName}`;
        w.curlyBlock(["static", "createResource", `(${createResourceSig})`, `: ${tsBaseResourceName}`], () => {
            const inputExpression = requiresFactoryInput ? "args" : "args ?? {}";
            w.lineSM(`const resolvedExtensions = ${profileClassName}.resolveInput(${inputExpression})`);
            for (const field of factoryInfo.sliceAutoFields) {
                if (field.name === "extension") continue;
                const matchRefs = field.sliceNames.map(
                    (sliceName) => `${profileClassName}.${tsSliceStaticName(sliceName)}SliceMatch`,
                );
                w.line(`const ${field.name}WithDefaults = ${profileHelper(imports, "ensureSliceDefaults")}(`);
                w.indentBlock(() => {
                    w.line(`[...(args.${field.name} ?? [])],`);
                    for (const ref of matchRefs) {
                        w.line(`${ref},`);
                    }
                });
                w.lineSM(")");
            }
            const extSliceField = factoryInfo.sliceAutoFields.find((f) => f.name === "extension");
            if (extSliceField) {
                const matchRefs = extSliceField.sliceNames.map(
                    (s) => `${profileClassName}.${tsSliceStaticName(s)}SliceMatch`,
                );
                w.line(`const extensionWithDefaults = ${profileHelper(imports, "ensureSliceDefaults")}(`);
                w.indentBlock(() => {
                    w.line("resolvedExtensions,");
                    for (const ref of matchRefs) {
                        w.line(`${ref},`);
                    }
                });
                w.lineSM(")");
            }
            w.line();
            const extensionVar = extSliceField ? "extensionWithDefaults" : "resolvedExtensions";
            const hasMetaParam = allFields.some((f) => f.name === "meta");
            w.curlyBlock([`const resource: ${tsBaseResourceName} =`], () => {
                for (const f of allFields) {
                    if (f.name === "extension") continue;
                    if (f.name === "meta" && hasMeta) continue;
                    w.line(`${f.name}: ${f.value},`);
                }
                w.line(`extension: ${extensionVar},`);
                if (hasMeta) {
                    if (hasMetaParam) {
                        w.line(
                            `meta: { ...args.meta, profile: [...(args.meta?.profile ?? []), ${profileClassName}.canonicalUrl] },`,
                        );
                    } else {
                        w.line(`meta: { profile: [${profileClassName}.canonicalUrl] },`);
                    }
                }
            });

            w.lineSM("return resource");
        });
        w.line();

        // create — accepts Input | Raw, delegates to createResource
        const createSig = requiresFactoryInput
            ? `args: ${rawInputTypeName} | ${inputTypeName}`
            : `args?: ${rawInputTypeName} | ${inputTypeName}`;
        w.curlyBlock(["static", "create", `(${createSig})`, `: ${profileClassName}`], () => {
            w.lineSM(`return ${profileClassName}.apply(${profileClassName}.createResource(args))`);
        });
    } else {
        // Standard createResource / create (no Input helper)
        w.curlyBlock(["static", "createResource", `(${paramSignature})`, `: ${tsBaseResourceName}`], () => {
            for (const f of factoryInfo.sliceAutoFields) {
                const matchRefs = f.sliceNames.map((s) => `${profileClassName}.${tsSliceStaticName(s)}SliceMatch`);
                w.line(`const ${f.name}WithDefaults = ${profileHelper(imports, "ensureSliceDefaults")}(`);
                w.indentBlock(() => {
                    w.line(`[...(args.${f.name} ?? [])],`);
                    for (const ref of matchRefs) {
                        w.line(`${ref},`);
                    }
                });
                w.lineSM(")");
            }
            if (factoryInfo.sliceAutoFields.length > 0) {
                w.line();
            }
            if (isPrimitiveIdentifier(snapshot.base)) {
                w.lineSM(`const resource = undefined as unknown as ${tsBaseResourceName}`);
            } else {
                const hasMetaParam = allFields.some((f) => f.name === "meta");
                w.curlyBlock([`const resource: ${tsBaseResourceName} =`], () => {
                    for (const f of allFields) {
                        if (f.name === "meta" && hasMeta) continue;
                        w.line(`${f.name}: ${f.value},`);
                    }
                    if (hasMeta) {
                        if (hasMetaParam) {
                            w.line(
                                `meta: { ...args.meta, profile: [...(args.meta?.profile ?? []), ${profileClassName}.canonicalUrl] },`,
                            );
                        } else {
                            w.line(`meta: { profile: [${profileClassName}.canonicalUrl] },`);
                        }
                    }
                });
            }
            w.lineSM("return resource");
        });
        w.line();
        w.curlyBlock(["static", "create", `(${paramSignature})`, `: ${profileClassName}`], () => {
            w.lineSM(`const resource = ${profileClassName}.createResource(${hasParams ? "args" : ""})`);
            w.lineSM(`return ${profileClassName}.apply(resource)`);
        });
    }
    w.line();
    // toResource() returns base type (e.g., Patient)
    w.curlyBlock(["toResource", "()", `: ${tsBaseResourceName}`], () => {
        w.lineSM("return this.resource");
    });
    w.line();
};

const generateFieldAccessors = (w: TypeScript, factoryInfo: ProfileFactoryInfo) => {
    w.line("// Field accessors");
    for (const p of factoryInfo.params) {
        const methodBaseName = uppercaseFirstLetter(p.name);
        w.curlyBlock([`get${methodBaseName}`, "()", `: ${p.tsType} | undefined`], () => {
            w.lineSM(`return this.resource.${p.name} as ${p.tsType} | undefined`);
        });
        w.line();
        w.curlyBlock([`set${methodBaseName}`, `(value: ${p.tsType})`, ": this"], () => {
            w.lineSM(`Object.assign(this.resource, { ${p.name}: value })`);
            w.lineSM("return this");
        });
        w.line();
    }

    for (const a of factoryInfo.accessors) {
        const methodBaseName = uppercaseFirstLetter(tsCamelCase(a.name));
        const fieldAccess = tsFieldName(a.name);
        w.curlyBlock([`get${methodBaseName}`, "()", `: ${a.tsType} | undefined`], () => {
            w.lineSM(`return ${tsGet("this.resource", fieldAccess)} as ${a.tsType} | undefined`);
        });
        w.line();
        if (!factoryInfo.fixedFields.has(a.name)) {
            w.curlyBlock([`set${methodBaseName}`, `(value: ${a.tsType})`, ": this"], () => {
                if (a.choiceClearMethod) w.lineSM(`this.${a.choiceClearMethod}()`);
                w.lineSM(`Object.assign(this.resource, { ${fieldAccess}: value })`);
                w.lineSM("return this");
            });
            w.line();
        }
    }

    for (const { method, variants } of factoryInfo.choiceClearMethods) {
        w.curlyBlock([method, "()", ": void"], () => {
            for (const variant of variants) w.lineSM(`delete ${tsGet("this.resource", variant)}`);
        });
        w.line();
    }
};

/** Generate inline extension input types only for complex extensions without a resolved FlatInput profile */
const generateInlineExtensionInputTypes = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
) => {
    const tsProfileName = tsResourceName(snapshot.identifier);
    const complexExtensions = (snapshot.extensions ?? []).filter((ext) => ext.isComplex && ext.subExtensions);
    for (const ext of complexExtensions) {
        if (!ext.url) continue;
        const extProfileInfo = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext.url);
        const hasFlatInput = extProfileInfo ? collectSubExtensionSlices(extProfileInfo.snapshot).length > 0 : false;
        if (hasFlatInput) continue;
        const typeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
        w.curlyBlock(["export", "type", typeName, "="], () => {
            for (const sub of ext.subExtensions ?? []) {
                const tsType = sub.valueFieldType ? tsTypeFromIdentifier(imports, sub.valueFieldType) : "unknown";
                const isArray = sub.max === "*";
                const isRequired = sub.min !== undefined && sub.min > 0;
                w.lineSM(`${sub.name}${isRequired ? "" : "?"}: ${tsType}${isArray ? "[]" : ""}`);
            }
        });
        w.line();
    }
};

/** Name what the complex extension getters return, so the overloads, the implementation
 *  signature and the extractComplexExtension calls refer to a type instead of repeating it —
 *  and so a consumer has a name for the shape it receives. */
const generateExtensionExtractedTypes = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
) => {
    const tsProfileName = tsResourceName(snapshot.identifier);
    const complexExtensions = (snapshot.extensions ?? []).filter((ext) => ext.isComplex && ext.subExtensions);
    for (const ext of complexExtensions) {
        if (!ext.url) continue;
        const extProfileInfo = resolveExtensionProfile(tsIndex, snapshot.identifier.package, ext.url);
        const { flat, vFlat } = extensionExtractedTypes(imports, tsProfileName, ext, extProfileInfo);
        // Name from the collision-resolved base name, the same source the getters use: two
        // entries for one extension at two paths share `ext.name` and would declare twice.
        const baseName = ext.nameCandidates.recommended;
        w.lineSM(`export type ${tsExtensionExtractedTypeName(tsProfileName, baseName)} = ${flat}`);
        if (vFlat) {
            w.lineSM(`export type ${tsExtensionVFlatTypeName(tsProfileName, baseName)} = ${vFlat}`);
        }
        w.line();
    }
};

/** Convert a JS value to a TypeScript type literal string (e.g. `{ code: "vital-signs"; system: "http://..." }`). */
const valueToTypeLiteral = (value: unknown): string => {
    if (value === null || value === undefined) return "undefined";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `[${value.map(valueToTypeLiteral).join(", ")}]`;
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${valueToTypeLiteral(v)}`)
            .join("; ");
        return `{ ${entries} }`;
    }
    return "unknown";
};

const generateSliceInputTypes = (
    w: TypeScript,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
) => {
    if (sliceDefs.length === 0) return;
    const tsProfileName = tsResourceName(snapshot.identifier);
    for (const sliceDef of sliceDefs) {
        const inputTypeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const flatTypeName = tsSliceFlatAllTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchFields = sliceDef.typeDiscriminator ? [] : Object.keys(sliceDef.match);
        const allExcluded = [...new Set([...sliceDef.excluded, ...matchFields])];
        if (sliceDef.constrainedChoice) {
            const cc = sliceDef.constrainedChoice;
            allExcluded.push(cc.choiceBase);
            for (const name of cc.allChoiceNames) {
                if (!allExcluded.includes(name)) allExcluded.push(name);
            }
        }
        const excludedNames = allExcluded.map((name) => JSON.stringify(name));
        const requiredNames = sliceDef.required.map((name) => JSON.stringify(name));
        const baseType = sliceDef.typedBaseType;
        let inputTypeExpr = baseType;
        if (excludedNames.length > 0) {
            inputTypeExpr = `Omit<${inputTypeExpr}, ${excludedNames.join(" | ")}>`;
        }
        if (requiredNames.length > 0) {
            inputTypeExpr = `${inputTypeExpr} & Required<Pick<${baseType}, ${requiredNames.join(" | ")}>>`;
        }
        if (sliceDef.constrainedChoice) {
            inputTypeExpr = `${inputTypeExpr} & ${tsTypeFromIdentifier(imports, sliceDef.constrainedChoice.variantType)}`;
        }
        // Input type — setter parameter, no discriminator fields
        w.lineSM(`export type ${inputTypeName} = ${inputTypeExpr}`);
        // Flat type — getter return, includes readonly discriminator values as literal types
        const safeMatchEntries =
            matchFields.length > 0 && !sliceDef.constrainedChoice
                ? matchFields
                      .filter((key) => {
                          const v = sliceDef.match[key];
                          return Array.isArray(v) || typeof v !== "object" || v === null;
                      })
                      .map((key) => ({ key, typeLiteral: valueToTypeLiteral(sliceDef.match[key]) }))
                : [];
        if (safeMatchEntries.length > 0) {
            w.curlyBlock([`export type ${flatTypeName} = ${inputTypeName} &`], () => {
                for (const entry of safeMatchEntries) {
                    w.lineSM(`readonly ${entry.key}: ${entry.typeLiteral}`);
                }
            });
        } else {
            w.lineSM(`export type ${flatTypeName} = ${inputTypeName}`);
        }
        w.line();
    }
};

const generateRawType = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
) => {
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;
    const subSlices = snapshot.base.name === "Extension" ? collectSubExtensionSlices(snapshot) : [];
    if (!hasParams && subSlices.length === 0) return;

    const createArgsTypeName = `${tsProfileClassName(snapshot)}Raw`;
    w.curlyBlock(["export", "type", createArgsTypeName, "="], () => {
        for (const p of factoryInfo.params) {
            w.lineSM(`${p.name}: ${p.tsType}`);
        }
        for (const f of factoryInfo.sliceAutoFields) {
            w.lineSM(`${f.name}?: ${f.tsType}`);
        }
        const extensionCovered =
            factoryInfo.params.some((p) => p.name === "extension") ||
            factoryInfo.sliceAutoFields.some((f) => f.name === "extension");
        if (subSlices.length > 0 && !extensionCovered) {
            w.lineSM(`extension?: ${extensionTypeRef(tsIndex, imports, snapshot)}[]`);
        }
    });
    w.line();
};

const generateFlatInputType = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    imports: TsImports,
    snapshot: SnapshotProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
) => {
    const subSlices = snapshot.base.name === "Extension" ? collectSubExtensionSlices(snapshot) : [];
    if (subSlices.length === 0) return;

    const flatInputTypeName = `${tsProfileClassName(snapshot)}Flat`;
    const flatFields = [
        ...factoryInfo.params
            .filter((param) => param.name !== "extension")
            .map((param) => ({ name: param.name, optional: false, tsType: param.tsType })),
        ...factoryInfo.sliceAutoFields
            .filter((field) => field.name !== "extension")
            .map((field) => ({ name: field.name, optional: true, tsType: field.tsType })),
        ...subSlices.map((sub) => ({
            name: sub.name,
            optional: !sub.isRequired,
            tsType: `${subExtensionTsType(tsIndex, imports, snapshot, sub)}${sub.isArray ? "[]" : ""}`,
        })),
    ];
    const seen = new Set<string>();
    for (const field of flatFields) {
        if (seen.has(field.name)) {
            throw new Error(`Flat input field collision for ${flatInputTypeName}: ${field.name}`);
        }
        seen.add(field.name);
    }
    w.curlyBlock(["export", "type", flatInputTypeName, "="], () => {
        for (const field of flatFields) {
            w.lineSM(`${field.name}${field.optional ? "?" : ""}: ${field.tsType}`);
        }
    });
    w.line();
};

/** `imports` is the profile module's import section. */
export const generateProfileClass = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    imports: TsImports,
) => {
    const tsBaseResourceName = tsTypeFromIdentifier(imports, snapshot.base);
    const profileClassName = tsProfileClassName(snapshot);
    const sliceDefs = collectSliceDefs(tsIndex, imports, snapshot);
    const factoryInfo = collectProfileFactoryInfo(tsIndex, imports, snapshot);

    generateInlineExtensionInputTypes(w, tsIndex, imports, snapshot);
    generateExtensionExtractedTypes(w, tsIndex, imports, snapshot);
    generateSliceInputTypes(w, imports, snapshot, sliceDefs);

    generateRawType(w, tsIndex, imports, snapshot, factoryInfo);
    generateFlatInputType(w, tsIndex, imports, snapshot, factoryInfo);

    const canonicalUrl = snapshot.identifier.url;
    w.comment("CanonicalURL:", canonicalUrl, `(pkg: ${packageMetaToFhir(packageMeta(snapshot))})`);

    w.curlyBlock(["export", "class", profileClassName], () => {
        const specializationBase = tsIndex.findLastSpecializationByIdentifier(snapshot.base);
        if (isResourceIdentifier(specializationBase)) {
            w.lineSM(`static readonly resourceType = ${JSON.stringify(specializationBase.name)}`);
        } else if (isProfileIdentifier(specializationBase) || isSnapshotProfileIdentifier(specializationBase)) {
            w.logger()?.error(
                `Cannot emit static resourceType for profile '${profileClassName}': base '${snapshot.base.url}' does not resolve to a specialization`,
            );
        }
        w.lineSM(`static readonly canonicalUrl = ${JSON.stringify(canonicalUrl)}`);
        w.line();
        generateStaticSliceFields(w, sliceDefs);
        w.lineSM(`private resource: ${tsBaseResourceName}`);
        w.line();
        generateFactoryMethods(w, tsIndex, imports, snapshot, factoryInfo);
        generateFieldAccessors(w, factoryInfo);

        w.line("// Extensions");
        generateExtensionMethods(w, tsIndex, imports, snapshot);

        w.line("// Slices");
        generateSliceSetters(w, imports, sliceDefs, snapshot);
        generateSliceGetters(w, imports, sliceDefs, snapshot);

        w.line("// Validation");
        generateValidateMethod(w, tsIndex, imports, snapshot);
    });
    w.line();
};
