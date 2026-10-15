import { uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import {
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, type ProfileSections, resolveFhirType } from "./imports";
import { tsCamelCase, tsFieldName, tsProfileClassName, tsSliceStaticName } from "./name";
import { collectSubExtensionSlices, type SubExtensionSliceInfo } from "./profile-extensions";
import { collectRequiredSliceNames } from "./profile-slices";
import { fieldTsType, tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

export type ProfileFactoryInfo = {
    /** `value` builds the expression; the profile's own URL is written as the given `canonicalUrl` expression. */
    autoFields: { name: string; value: (canonicalUrl: string) => string }[];
    /** Array fields with required slices — optional param with auto-merge of required stubs */
    sliceAutoFields: { name: string; tsType: string; sliceNames: string[] }[];
    params: { name: string; tsType: string }[];
    /** `choiceClearMethod` names the helper a choice setter calls to clear its sibling variants. */
    accessors: { name: string; tsType: string; choiceClearMethod?: string }[];
    /** One helper per multi-variant choice group: clears every variant of that choice. */
    choiceClearMethods: { method: string; variants: string[] }[];
    /** Accessor names that come from valueConstraint fields — skip generating setters for these */
    fixedFields: Set<string>;
};

/** Public helper name that clears all variants of a choice group, e.g. `clearValue`. */
const choiceClearMethodName = (choiceOf: string): string => `clear${uppercaseFirstLetter(tsCamelCase(choiceOf))}`;

/** Try to promote a required single-choice declaration to a direct param */
const tryPromoteChoice = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    field: SnapshotProfileTypeSchema["fields"][string],
    fields: SnapshotProfileTypeSchema["fields"],
): ProfileFactoryInfo["params"][number] | undefined => {
    if (!isChoiceDeclarationField(field) || !field.required || field.choices.length !== 1) return;
    const choiceName = field.choices[0];
    if (!choiceName) return;
    const choiceField = fields[choiceName];
    if (!choiceField || !isChoiceInstanceField(choiceField)) return;
    const tsType = fieldTsType(
        imports.types,
        choiceField,
        tsIndex.findLastSpecializationByIdentifier,
        tsIndex.isFamilyType,
    );
    return { name: choiceName, tsType };
};

const collectChoiceAccessors = (
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    promotedChoices: ReadonlySet<string>,
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
        const tsType = tsTypeFromIdentifier(imports.types, field.type) + (field.array ? "[]" : "");
        // value[x] variants are mutually exclusive — a single-variant group has
        // nothing to clear, so only multi-variant groups get a clear helper.
        const hasSiblings = (variantsByChoice[field.choiceOf]?.length ?? 0) > 1;
        const choiceClearMethod = hasSiblings ? choiceClearMethodName(field.choiceOf) : undefined;
        accessors.push({ name, tsType, choiceClearMethod });
    }

    const choiceClearMethods = Object.entries(variantsByChoice)
        .filter(([, variants]) => variants.length > 1)
        .map(([choiceOf, variants]) => ({
            method: choiceClearMethodName(choiceOf),
            variants: variants.map(tsFieldName),
        }));

    return { accessors, choiceClearMethods };
};

/** Include base-type required fields not already covered by profile constraints */
const collectBaseRequiredParams = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    coveredNames: string[],
): ProfileFactoryInfo["params"] => {
    const params: ProfileFactoryInfo["params"] = [];
    const covered = new Set(coveredNames);
    const baseSchema = tsIndex.resolveType(snapshot.base);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return params;
    for (const [name, field] of Object.entries(baseSchema.fields)) {
        if (covered.has(name)) continue;
        if (!field.required) continue;
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) continue;
        if (isNotChoiceDeclarationField(field) && field.type) {
            const tsType = fieldTsType(
                imports.types,
                field,
                tsIndex.findLastSpecializationByIdentifier,
                tsIndex.isFamilyType,
            );
            params.push({ name, tsType });
        }
    }
    return params;
};

export const collectProfileFactoryInfo = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fixedFields = new Set<string>();
    const fields = snapshot.fields;
    const promotedChoices = new Set<string>();

    if (isResourceIdentifier(snapshot.base)) {
        autoFields.push({ name: "resourceType", value: () => JSON.stringify(snapshot.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            const promoted = tryPromoteChoice(imports, tsIndex, field, fields);
            if (promoted) {
                params.push(promoted);
                promotedChoices.add(promoted.name);
            }
            continue;
        }

        if (field.valueConstraint && !field.valueConstraint.validateOnly) {
            // A fixed value equal to the profile's own canonical URL references the module
            // constant instead of repeating the literal.
            const fixed = field.valueConstraint.value;
            const isOwnUrl = fixed === snapshot.identifier.url;
            const array = field.array;
            autoFields.push({
                name,
                value: (canonicalUrl) => {
                    const value = isOwnUrl ? canonicalUrl : JSON.stringify(fixed);
                    return array ? `[${value}]` : value;
                },
            });
            fixedFields.add(name);
            if (isNotChoiceDeclarationField(field) && field.type) {
                const tsType = fieldTsType(
                    imports.types,
                    field,
                    tsIndex.findLastSpecializationByIdentifier,
                    tsIndex.isFamilyType,
                );
                autoAccessors.push({ name, tsType });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field, snapshot.slicing?.[name]);
            if (sliceNames) {
                if (field.type) {
                    const tsType = fieldTsType(
                        imports.types,
                        field,
                        tsIndex.findLastSpecializationByIdentifier,
                        tsIndex.isFamilyType,
                    );
                    sliceAutoFields.push({ name, tsType, sliceNames });
                    autoAccessors.push({ name, tsType });
                }
                continue;
            }
        }

        if (field.required) {
            const tsType = fieldTsType(
                imports.types,
                field,
                tsIndex.findLastSpecializationByIdentifier,
                tsIndex.isFamilyType,
            );
            params.push({ name, tsType });
        }
    }

    params.push(
        ...collectBaseRequiredParams(imports, tsIndex, snapshot, [
            ...autoFields.map((f) => f.name),
            ...sliceAutoFields.map((f) => f.name),
            ...params.map((f) => f.name),
            ...promotedChoices,
        ]),
    );

    const { accessors: choiceAccessors, choiceClearMethods } = collectChoiceAccessors(
        imports,
        snapshot,
        promotedChoices,
    );
    const accessors = [...autoAccessors, ...choiceAccessors];
    return { autoFields, sliceAutoFields, params, accessors, choiceClearMethods, fixedFields };
};

export const generateRawType = (
    w: TypeScript,
    imports: ProfileImports,
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
            w.lineSM(`extension?: ${tsTypeFromIdentifier(imports.types, snapshot.base)}[]`);
        }
    });
    w.line();
};

export const generateFlatInputType = (
    w: TypeScript,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
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
            tsType: `${
                ["string", "boolean", "number"].includes(sub.tsType)
                    ? sub.tsType
                    : imports.types.use(resolveFhirType(tsIndex, snapshot, sub.tsType))
            }${sub.isArray ? "[]" : ""}`,
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

type FactoryMethodContext = {
    snapshot: SnapshotProfileTypeSchema;
    factoryInfo: ProfileFactoryInfo;
    className: string;
    baseTypeName: string;
    /** Marker of the module-level `canonicalUrl` constant, not the URL itself. */
    canonicalUrl: string;
    hasMeta: boolean;
    hasParams: boolean;
    subExtensionSlices: SubExtensionSliceInfo[];
    requiresFactoryInput: boolean;
};

const generateConstructor = (w: TypeScript, ctx: FactoryMethodContext) => {
    w.lineSM(`private resource: ${ctx.baseTypeName}`);
    w.line();
    w.curlyBlock(["constructor", `(resource: ${ctx.baseTypeName})`], () => {
        w.lineSM("this.resource = resource");
    });
    w.line();
};

const generateFromResourceMethod = (w: TypeScript, ctx: FactoryMethodContext) => {
    const { className, baseTypeName, canonicalUrl, hasMeta } = ctx;
    w.curlyBlock(["static", "from", `(resource: ${baseTypeName})`, `: ${className}`], () => {
        if (hasMeta) {
            w.curlyBlock(["if", `(!resource.meta?.profile?.some((p) => p === ${canonicalUrl}))`], () => {
                w.line(`throw new Error(\`${className}: meta.profile must include \${${canonicalUrl}}\`)`);
            });
        }
        w.lineSM(`const profile = new ${className}(resource)`);
        w.lineSM("const { errors } = profile.validate()");
        w.line(`if (errors.length > 0) throw new Error(errors.join("; "))`);
        w.lineSM("return profile");
    });
    w.line();
};

const generateIsMethod = (w: TypeScript, ctx: FactoryMethodContext) => {
    const { snapshot, baseTypeName, canonicalUrl, hasMeta } = ctx;
    const canEmitIs = (hasMeta && isResourceIdentifier(snapshot.base)) || snapshot.base.name === "Extension";
    if (!canEmitIs) return;
    w.curlyBlock(["static", "is", "(resource: unknown)", `: resource is ${baseTypeName}`], () => {
        w.line(`if (typeof resource !== "object" || resource === null) return false;`);
        if (hasMeta && isResourceIdentifier(snapshot.base)) {
            w.line(`const r = resource as { resourceType?: string; meta?: { profile?: string[] } };`);
            w.line(`if (r.resourceType !== ${JSON.stringify(snapshot.base.name)}) return false;`);
            w.lineSM(`return (r.meta?.profile ?? []).some((p) => p === ${canonicalUrl})`);
        } else {
            w.lineSM(`return (resource as { url?: string }).url === ${canonicalUrl}`);
        }
    });
    w.line();
};

const generateApplyMethod = (w: TypeScript, imports: ProfileImports, ctx: FactoryMethodContext) => {
    const { snapshot, factoryInfo, className, baseTypeName, canonicalUrl, hasMeta } = ctx;
    w.curlyBlock(["static", "apply", `(resource: ${baseTypeName})`, `: ${className}`], () => {
        if (hasMeta) {
            w.lineSM(`${imports.helpers.use("ensureProfile")}(resource, ${canonicalUrl})`);
        }
        if (snapshot.base.name === "Extension" && snapshot.identifier.url) {
            w.lineSM(`resource.url = ${canonicalUrl}`);
        }
        const applyAutoFields = factoryInfo.autoFields.filter((f) => f.name !== "resourceType");
        if (applyAutoFields.length > 0) {
            for (const f of applyAutoFields) {
                w.lineSM(
                    `${imports.helpers.use("applyFixedValue")}(resource, ${JSON.stringify(f.name)}, ${f.value(canonicalUrl)})`,
                );
            }
        }
        for (const f of factoryInfo.sliceAutoFields) {
            const matchRefs = f.sliceNames.map((s) => `${className}.${tsSliceStaticName(s)}`);
            w.line(`resource.${f.name} = ${imports.helpers.use("ensureSliceDefaults")}(`);
            w.indentBlock(() => {
                w.line(`[...(resource.${f.name} ?? [])],`);
                for (const ref of matchRefs) {
                    w.line(`${ref},`);
                }
            });
            w.lineSM(")");
        }
        w.lineSM(`return new ${className}(resource)`);
    });
    w.line();
};

const generateResolveInputMethod = (w: TypeScript, imports: ProfileImports, ctx: FactoryMethodContext) => {
    const { className, baseTypeName, subExtensionSlices } = ctx;
    if (subExtensionSlices.length === 0) return;
    const rawInputTypeName = `${className}Raw`;
    const inputTypeName = `${className}Flat`;

    // Private helper: converts Input to Extension[], passes through Raw.extension
    w.curlyBlock(
        ["private static", "resolveInput", `(args: ${rawInputTypeName} | ${inputTypeName})`, `: ${baseTypeName}[]`],
        () => {
            w.ifElseChain(
                [
                    {
                        cond: `${imports.helpers.use("isRawExtensionInput")}<${rawInputTypeName}>(args)`,
                        body: () => w.lineSM("return args.extension ?? []"),
                    },
                ],
                () => {
                    w.lineSM(`const result: ${baseTypeName}[] = []`);
                    for (const sub of subExtensionSlices) {
                        if (sub.isArray) {
                            w.curlyBlock(["if", `(args.${sub.name})`], () => {
                                w.curlyBlock(["for", `(const item of args.${sub.name})`], () => {
                                    w.lineSM(
                                        `result.push({ url: "${sub.url}", ${sub.valueField}: item } as ${baseTypeName})`,
                                    );
                                });
                            });
                        } else {
                            w.curlyBlock(["if", `(args.${sub.name} !== undefined)`], () => {
                                w.lineSM(
                                    `result.push({ url: "${sub.url}", ${sub.valueField}: args.${sub.name} } as ${baseTypeName})`,
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
};

const generateCreateResourceMethod = (w: TypeScript, imports: ProfileImports, ctx: FactoryMethodContext) => {
    const {
        snapshot,
        factoryInfo,
        className,
        baseTypeName,
        canonicalUrl,
        hasMeta,
        hasParams,
        subExtensionSlices,
        requiresFactoryInput,
    } = ctx;
    const allFields = [
        ...factoryInfo.autoFields.map((f) => ({ name: f.name, value: f.value(canonicalUrl) })),
        ...factoryInfo.sliceAutoFields.map((f) => ({ name: f.name, value: `${f.name}WithDefaults` })),
        ...factoryInfo.params.map((p) => ({ name: p.name, value: `args.${p.name}` })),
    ];
    if (subExtensionSlices.length > 0) {
        const rawInputTypeName = `${className}Raw`;
        const inputTypeName = `${className}Flat`;

        // createResource — accepts Input | Raw
        const createResourceSig = requiresFactoryInput
            ? `args: ${rawInputTypeName} | ${inputTypeName}`
            : `args?: ${rawInputTypeName} | ${inputTypeName}`;
        w.curlyBlock(["static", "createResource", `(${createResourceSig})`, `: ${baseTypeName}`], () => {
            const inputExpression = requiresFactoryInput ? "args" : "args ?? {}";
            w.lineSM(`const resolvedExtensions = ${className}.resolveInput(${inputExpression})`);
            for (const field of factoryInfo.sliceAutoFields) {
                if (field.name === "extension") continue;
                const matchRefs = field.sliceNames.map((sliceName) => `${className}.${tsSliceStaticName(sliceName)}`);
                w.line(`const ${field.name}WithDefaults = ${imports.helpers.use("ensureSliceDefaults")}(`);
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
                const matchRefs = extSliceField.sliceNames.map((s) => `${className}.${tsSliceStaticName(s)}`);
                w.line(`const extensionWithDefaults = ${imports.helpers.use("ensureSliceDefaults")}(`);
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
            w.curlyBlock([`const resource: ${baseTypeName} =`], () => {
                for (const f of allFields) {
                    if (f.name === "extension") continue;
                    if (f.name === "meta" && hasMeta) continue;
                    w.line(`${f.name}: ${f.value},`);
                }
                w.line(`extension: ${extensionVar},`);
                if (hasMeta) {
                    if (hasMetaParam) {
                        w.line(`meta: { ...args.meta, profile: [...(args.meta?.profile ?? []), ${canonicalUrl}] },`);
                    } else {
                        w.line(`meta: { profile: [${canonicalUrl}] },`);
                    }
                }
            });

            w.lineSM("return resource");
        });
    } else {
        // Standard createResource (no Input helper)
        const createArgsTypeName = `${className}Raw`;
        const paramSignature = hasParams ? `args: ${createArgsTypeName}` : "";
        w.curlyBlock(["static", "createResource", `(${paramSignature})`, `: ${baseTypeName}`], () => {
            for (const f of factoryInfo.sliceAutoFields) {
                const matchRefs = f.sliceNames.map((s) => `${className}.${tsSliceStaticName(s)}`);
                w.line(`const ${f.name}WithDefaults = ${imports.helpers.use("ensureSliceDefaults")}(`);
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
                w.lineSM(`const resource = undefined as unknown as ${baseTypeName}`);
            } else {
                const hasMetaParam = allFields.some((f) => f.name === "meta");
                w.curlyBlock([`const resource: ${baseTypeName} =`], () => {
                    for (const f of allFields) {
                        if (f.name === "meta" && hasMeta) continue;
                        w.line(`${f.name}: ${f.value},`);
                    }
                    if (hasMeta) {
                        if (hasMetaParam) {
                            w.line(
                                `meta: { ...args.meta, profile: [...(args.meta?.profile ?? []), ${canonicalUrl}] },`,
                            );
                        } else {
                            w.line(`meta: { profile: [${canonicalUrl}] },`);
                        }
                    }
                });
            }
            w.lineSM("return resource");
        });
    }
    w.line();
};

const generateCreateMethod = (w: TypeScript, ctx: FactoryMethodContext) => {
    const { className, hasParams, subExtensionSlices, requiresFactoryInput } = ctx;
    if (subExtensionSlices.length > 0) {
        const rawInputTypeName = `${className}Raw`;
        const inputTypeName = `${className}Flat`;

        // create — accepts Input | Raw, delegates to createResource
        const createSig = requiresFactoryInput
            ? `args: ${rawInputTypeName} | ${inputTypeName}`
            : `args?: ${rawInputTypeName} | ${inputTypeName}`;
        w.curlyBlock(["static", "create", `(${createSig})`, `: ${className}`], () => {
            w.lineSM(`return ${className}.apply(${className}.createResource(args))`);
        });
    } else {
        // Standard create (no Input helper)
        const createArgsTypeName = `${className}Raw`;
        const paramSignature = hasParams ? `args: ${createArgsTypeName}` : "";
        w.curlyBlock(["static", "create", `(${paramSignature})`, `: ${className}`], () => {
            w.lineSM(`const resource = ${className}.createResource(${hasParams ? "args" : ""})`);
            w.lineSM(`return ${className}.apply(resource)`);
        });
    }
    w.line();
};

const generateToResourceMethod = (w: TypeScript, ctx: FactoryMethodContext) => {
    // toResource() returns base type (e.g., Patient)
    w.curlyBlock(["toResource", "()", `: ${ctx.baseTypeName}`], () => {
        w.lineSM("return this.resource");
    });
    w.line();
};

export const generateFactoryMethods = (
    w: TypeScript,
    imports: ProfileSections,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
) => {
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;
    // For extension profiles with sub-extension slices: generate resolveInput helper,
    // widen createResource and create to accept Input | Raw
    const subExtensionSlices = snapshot.base.name === "Extension" ? collectSubExtensionSlices(snapshot) : [];
    const ctx: FactoryMethodContext = {
        snapshot,
        factoryInfo,
        className: tsProfileClassName(snapshot),
        baseTypeName: tsTypeFromIdentifier(imports.types, snapshot.base),
        canonicalUrl: imports.const.use("canonicalUrl"),
        hasMeta: tsIndex.isWithMetaField(snapshot),
        hasParams,
        subExtensionSlices,
        requiresFactoryInput: hasParams || subExtensionSlices.some((sub) => sub.isRequired),
    };
    generateConstructor(w, ctx);
    generateFromResourceMethod(w, ctx);
    generateIsMethod(w, ctx);
    generateApplyMethod(w, imports, ctx);
    generateResolveInputMethod(w, imports, ctx);
    generateCreateResourceMethod(w, imports, ctx);
    generateCreateMethod(w, ctx);
    generateToResourceMethod(w, ctx);
};

export const generateFieldAccessors = (w: TypeScript, factoryInfo: ProfileFactoryInfo) => {
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
