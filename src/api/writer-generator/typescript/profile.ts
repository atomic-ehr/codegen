import { pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    type ProfileTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsCamelCase,
    tsExtensionFlatTypeName,
    tsFieldName,
    tsModulePath,
    tsNameFromCanonical,
    tsPackageDir,
    tsProfileClassName,
    tsProfileModuleName,
    tsResourceName,
    tsSliceFlatAllTypeName,
    tsSliceFlatTypeName,
    tsSliceStaticName,
} from "./name";
import {
    collectSubExtensionSlices,
    collectTypesFromExtensions,
    collectTypesFromFlatInput,
    generateExtensionMethods,
    resolveExtensionProfile,
} from "./profile-extensions";
import {
    collectRequiredSliceNames,
    collectSliceDefs,
    collectTypesFromSlices,
    generateSliceGetters,
    generateSliceSetters,
    type SliceDef,
} from "./profile-slices";
import { generateValidateMethod } from "./profile-validation";
import { fieldTsType, tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    /** Array fields with required slices — optional param with auto-merge of required stubs */
    sliceAutoFields: { name: string; tsType: string; typeId: TypeIdentifier; sliceNames: string[] }[];
    params: { name: string; tsType: string; typeId: TypeIdentifier }[];
    accessors: { name: string; tsType: string; typeId: TypeIdentifier }[];
    /** Accessor names that come from valueConstraint fields — skip generating setters for these */
    fixedFields: Set<string>;
};

const collectChoiceAccessors = (
    flatProfile: ProfileTypeSchema,
    promotedChoices: Set<string>,
): ProfileFactoryInfo["accessors"] => {
    const accessors: ProfileFactoryInfo["accessors"] = [];
    for (const [name, field] of Object.entries(flatProfile.fields ?? {})) {
        if (field.excluded) continue;
        if (!isChoiceInstanceField(field)) continue;
        if (promotedChoices.has(name)) continue;
        const tsType = tsTypeFromIdentifier(field.type) + (field.array ? "[]" : "");
        accessors.push({ name, tsType, typeId: field.type });
    }
    return accessors;
};

/** Try to promote a required single-choice declaration to a direct param */
const tryPromoteChoice = (
    field: NonNullable<ProfileTypeSchema["fields"]>[string],
    fields: NonNullable<ProfileTypeSchema["fields"]>,
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
    const tsType = fieldTsType(choiceField, resolveRef, isFamilyType);
    params.push({ name: choiceName, tsType, typeId: choiceField.type });
    promotedChoices.add(choiceName);
};

export const mkIsFamilyType =
    (tsIndex: TypeSchemaIndex) =>
    (ref: TypeIdentifier): boolean => {
        const schema = tsIndex.resolveType(ref);
        if (!schema || !("typeFamily" in schema)) return false;
        return (schema.typeFamily?.resources?.length ?? 0) > 0;
    };

export const collectProfileFactoryInfo = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fixedFields = new Set<string>();
    const fields = flatProfile.fields ?? {};
    const promotedChoices = new Set<string>();
    const resolveRef = tsIndex.findLastSpecializationByIdentifier;
    const isFamilyType = mkIsFamilyType(tsIndex);

    if (isResourceIdentifier(flatProfile.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(flatProfile.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            tryPromoteChoice(field, fields, params, promotedChoices, resolveRef, isFamilyType);
            continue;
        }

        if (field.valueConstraint) {
            const value = JSON.stringify(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            fixedFields.add(name);
            if (isNotChoiceDeclarationField(field) && field.type) {
                const tsType = fieldTsType(field, resolveRef, isFamilyType);
                autoAccessors.push({ name, tsType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field);
            if (sliceNames) {
                if (field.type) {
                    const tsType = fieldTsType(field, resolveRef, isFamilyType);
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
            const tsType = fieldTsType(field, resolveRef, isFamilyType);
            params.push({ name, tsType, typeId: field.type });
        }
    }

    collectBaseRequiredParams(
        tsIndex,
        flatProfile,
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

    const accessors = [...autoAccessors, ...collectChoiceAccessors(flatProfile, promotedChoices)];
    return { autoFields, sliceAutoFields, params, accessors, fixedFields };
};

/** Include base-type required fields not already covered by profile constraints */
const collectBaseRequiredParams = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    params: ProfileFactoryInfo["params"],
    coveredNames: string[],
    isFamilyType?: (ref: TypeIdentifier) => boolean,
) => {
    const covered = new Set(coveredNames);
    const baseSchema = tsIndex.resolveType(flatProfile.base);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return;
    for (const [name, field] of Object.entries(baseSchema.fields)) {
        if (covered.has(name)) continue;
        if (!field.required) continue;
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) continue;
        if (isNotChoiceDeclarationField(field) && field.type) {
            const tsType = fieldTsType(field, resolveRef, isFamilyType);
            params.push({ name, tsType, typeId: field.type });
        }
    }
};

export const generateProfileIndexFile = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    initialProfiles: ProfileTypeSchema[],
) => {
    if (initialProfiles.length === 0) return;
    w.cd("profiles", () => {
        w.cat("index.ts", () => {
            const exports: Map<string, string> = new Map();
            for (const profile of initialProfiles) {
                const className = tsProfileClassName(profile);
                const moduleName = tsProfileModuleName(tsIndex, profile);
                if (!exports.has(className)) {
                    exports.set(className, `export { ${className} } from "./${moduleName}"`);
                }
            }
            for (const exp of [...exports.values()].sort()) {
                w.lineSM(exp);
            }
        });
    });
};

const generateProfileHelpersImport = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    sliceDefs: SliceDef[],
    factoryInfo: ProfileFactoryInfo,
) => {
    const extensions = flatProfile.extensions ?? [];
    const hasMeta = tsIndex.isWithMetaField(flatProfile);
    const canonicalUrl = flatProfile.identifier.url;

    const imports: string[] = [];
    if (flatProfile.base.name === "Extension" && !!canonicalUrl && collectSubExtensionSlices(flatProfile).length > 0)
        imports.push("isRawExtensionInput");
    if (canonicalUrl && hasMeta) imports.push("ensureProfile");
    if (sliceDefs.length > 0 || factoryInfo.sliceAutoFields.length > 0)
        imports.push("applySliceMatch", "matchesValue", "setArraySlice", "getArraySlice", "ensureSliceDefaults");
    const hasUnboundedSlice = sliceDefs.some((s) => s.array && (s.max === 0 || s.max === undefined));
    if (hasUnboundedSlice) imports.push("setArraySliceAll", "getArraySliceAll");
    if (extensions.some((ext) => ext.path.split(".").some((s) => s !== "extension"))) imports.push("ensurePath");
    if (extensions.some((ext) => ext.isComplex && ext.subExtensions)) imports.push("extractComplexExtension");
    if (sliceDefs.some((s) => s.constrainedChoice)) imports.push("wrapSliceChoice", "unwrapSliceChoice");
    if (extensions.some((ext) => ext.url)) {
        imports.push("isExtension", "getExtensionValue", "pushExtension");
        if (extensions.some((ext) => ext.url && ext.max === "1")) imports.push("upsertExtension");
    }
    if (Object.keys(flatProfile.fields ?? {}).length > 0)
        imports.push(
            "validateRequired",
            "validateExcluded",
            "validateFixedValue",
            "validateSliceCardinality",
            "validateSliceFields",
            "validateEnum",
            "validateReference",
            "validateChoiceRequired",
            "validateMustSupport",
        );
    if (imports.length > 0) {
        w.tsImport("../../profile-helpers", ...imports);
        w.line();
    }
};

export const generateProfileImports = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const usedTypes = new Map<string, { importPath: string; tsName: string }>();

    const getModulePath = (typeId: TypeIdentifier): string => {
        if (isNestedIdentifier(typeId)) {
            const path = tsNameFromCanonical(typeId.url, true);
            if (path) return `../../${tsPackageDir(typeId.package)}/${pascalCase(path)}`;
        }
        return `../../${tsModulePath(typeId)}`;
    };

    const addType = (typeId: TypeIdentifier) => {
        if (typeId.kind === "primitive-type") return;
        const tsName = tsResourceName(typeId);
        if (!usedTypes.has(tsName)) {
            usedTypes.set(tsName, { importPath: getModulePath(typeId), tsName });
        }
    };

    addType(flatProfile.base);
    collectTypesFromSlices(tsIndex, flatProfile, addType);
    const needsExtensionType = collectTypesFromExtensions(tsIndex, flatProfile, addType);
    collectTypesFromFlatInput(tsIndex, flatProfile, addType);

    const factoryInfo = collectProfileFactoryInfo(tsIndex, flatProfile);
    for (const param of factoryInfo.params) addType(param.typeId);
    for (const f of factoryInfo.sliceAutoFields) addType(f.typeId);
    for (const accessor of factoryInfo.accessors) addType(accessor.typeId);

    if (needsExtensionType) {
        const extensionUrl = "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl;
        const extensionSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, extensionUrl);
        if (extensionSchema) addType(extensionSchema.identifier);
    }

    const grouped = new Map<string, string[]>();
    for (const { importPath, tsName } of usedTypes.values()) {
        let names = grouped.get(importPath);
        if (!names) {
            names = [];
            grouped.set(importPath, names);
        }
        names.push(tsName);
    }
    const sortedModules = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
    for (const [importPath, names] of sortedModules) {
        w.tsImport(importPath, ...names.sort(), { typeOnly: true });
    }
    if (sortedModules.length > 0) w.line();

    // Import extension profile classes for delegation in setters
    const extProfileImports = new Map<string, { modulePath: string; hasFlatInput: boolean }>();
    for (const ext of flatProfile.extensions ?? []) {
        if (!ext.url) continue;
        const info = resolveExtensionProfile(tsIndex, flatProfile.identifier.package, ext.url);
        if (!info) continue;
        if (!extProfileImports.has(info.className)) {
            const hasFlatInput = collectSubExtensionSlices(info.flatProfile).length > 0;
            extProfileImports.set(info.className, { modulePath: info.modulePath, hasFlatInput });
        }
    }
    for (const [className, { modulePath, hasFlatInput }] of [...extProfileImports.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
    )) {
        const imports = [className, ...(hasFlatInput ? [`type ${className}Flat`] : [])];
        w.tsImport(modulePath, ...imports);
    }
    if (extProfileImports.size > 0) w.line();
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
    flatProfile: ProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
) => {
    const profileClassName = tsProfileClassName(flatProfile);
    const tsBaseResourceName = tsTypeFromIdentifier(flatProfile.base);
    const hasMeta = tsIndex.isWithMetaField(flatProfile);
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
    w.curlyBlock(["static", "apply", `(resource: ${tsBaseResourceName})`, `: ${profileClassName}`], () => {
        if (hasMeta) {
            w.lineSM(`ensureProfile(resource, ${profileClassName}.canonicalUrl)`);
        }
        if (flatProfile.base.name === "Extension" && flatProfile.identifier.url) {
            w.lineSM(`resource.url = ${profileClassName}.canonicalUrl`);
        }
        const applyAutoFields = factoryInfo.autoFields.filter((f) => f.name !== "resourceType");
        if (applyAutoFields.length > 0) {
            w.curlyBlock(["Object.assign(resource,"], () => {
                for (const f of applyAutoFields) {
                    w.line(`${f.name}: ${f.value},`);
                }
            }, [")"]);
        }
        for (const f of factoryInfo.sliceAutoFields) {
            const matchRefs = f.sliceNames.map((s) => `${profileClassName}.${tsSliceStaticName(s)}SliceMatch`);
            w.line(`resource.${f.name} = ensureSliceDefaults(`);
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
    const subSlicesForInput = flatProfile.base.name === "Extension" ? collectSubExtensionSlices(flatProfile) : [];
    const hasInputHelper = subSlicesForInput.length > 0;

    if (hasInputHelper) {
        const rawInputTypeName = `${profileClassName}Raw`;
        const inputTypeName = `${profileClassName}Flat`;

        // Private helper: converts Input to Extension[], passes through Raw.extension
        w.curlyBlock(
            ["private static", "resolveInput", `(args: ${rawInputTypeName} | ${inputTypeName})`, ": Extension[]"],
            () => {
                w.ifElseChain(
                    [
                        {
                            cond: `isRawExtensionInput<${rawInputTypeName}>(args)`,
                            body: () => w.lineSM("return args.extension ?? []"),
                        },
                    ],
                    () => {
                        w.lineSM("const result: Extension[] = []");
                        for (const sub of subSlicesForInput) {
                            if (sub.isArray) {
                                w.curlyBlock(["if", `(args.${sub.name})`], () => {
                                    w.curlyBlock(["for", `(const item of args.${sub.name})`], () => {
                                        w.lineSM(
                                            `result.push({ url: "${sub.url}", ${sub.valueField}: item } as Extension)`,
                                        );
                                    });
                                });
                            } else {
                                w.curlyBlock(["if", `(args.${sub.name} !== undefined)`], () => {
                                    w.lineSM(
                                        `result.push({ url: "${sub.url}", ${sub.valueField}: args.${sub.name} } as Extension)`,
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
        const createResourceSig = hasParams
            ? `args: ${rawInputTypeName} | ${inputTypeName}`
            : `args?: ${rawInputTypeName} | ${inputTypeName}`;
        w.curlyBlock(["static", "createResource", `(${createResourceSig})`, `: ${tsBaseResourceName}`], () => {
            w.lineSM(`const resolvedExtensions = ${profileClassName}.resolveInput(args ?? {})`);
            const extSliceField = factoryInfo.sliceAutoFields.find((f) => f.name === "extension");
            if (extSliceField) {
                const matchRefs = extSliceField.sliceNames.map(
                    (s) => `${profileClassName}.${tsSliceStaticName(s)}SliceMatch`,
                );
                w.line("const extensionWithDefaults = ensureSliceDefaults(");
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
        const createSig = hasParams
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
                w.line(`const ${f.name}WithDefaults = ensureSliceDefaults(`);
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
            if (isPrimitiveIdentifier(flatProfile.base)) {
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
                w.lineSM(`Object.assign(this.resource, { ${fieldAccess}: value })`);
                w.lineSM("return this");
            });
            w.line();
        }
    }
};

/** Generate inline extension input types only for complex extensions without a resolved FlatInput profile */
const generateInlineExtensionInputTypes = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const tsProfileName = tsResourceName(flatProfile.identifier);
    const complexExtensions = (flatProfile.extensions ?? []).filter((ext) => ext.isComplex && ext.subExtensions);
    for (const ext of complexExtensions) {
        if (!ext.url) continue;
        const extProfileInfo = resolveExtensionProfile(tsIndex, flatProfile.identifier.package, ext.url);
        const hasFlatInput = extProfileInfo ? collectSubExtensionSlices(extProfileInfo.flatProfile).length > 0 : false;
        if (hasFlatInput) continue;
        const typeName = tsExtensionFlatTypeName(tsProfileName, ext.name);
        w.curlyBlock(["export", "type", typeName, "="], () => {
            for (const sub of ext.subExtensions ?? []) {
                const tsType = sub.valueFieldType ? tsTypeFromIdentifier(sub.valueFieldType) : "unknown";
                const isArray = sub.max === "*";
                const isRequired = sub.min !== undefined && sub.min > 0;
                w.lineSM(`${sub.name}${isRequired ? "" : "?"}: ${tsType}${isArray ? "[]" : ""}`);
            }
        });
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

const generateSliceInputTypes = (w: TypeScript, flatProfile: ProfileTypeSchema, sliceDefs: SliceDef[]) => {
    if (sliceDefs.length === 0) return;
    const tsProfileName = tsResourceName(flatProfile.identifier);
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
            inputTypeExpr = `${inputTypeExpr} & ${tsTypeFromIdentifier(sliceDef.constrainedChoice.variantType)}`;
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

const generateRawType = (w: TypeScript, flatProfile: ProfileTypeSchema, factoryInfo: ProfileFactoryInfo) => {
    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;
    const subSlices = flatProfile.base.name === "Extension" ? collectSubExtensionSlices(flatProfile) : [];
    if (!hasParams && subSlices.length === 0) return;

    const createArgsTypeName = `${tsProfileClassName(flatProfile)}Raw`;
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
            w.lineSM("extension?: Extension[]");
        }
    });
    w.line();
};

const generateFlatInputType = (w: TypeScript, flatProfile: ProfileTypeSchema) => {
    const subSlices = flatProfile.base.name === "Extension" ? collectSubExtensionSlices(flatProfile) : [];
    if (subSlices.length === 0) return;

    const flatInputTypeName = `${tsProfileClassName(flatProfile)}Flat`;
    w.curlyBlock(["export", "type", flatInputTypeName, "="], () => {
        for (const sub of subSlices) {
            const opt = sub.isRequired ? "" : "?";
            const arr = sub.isArray ? "[]" : "";
            w.lineSM(`${sub.name}${opt}: ${sub.tsType}${arr}`);
        }
    });
    w.line();
};

export const generateProfileClass = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const tsBaseResourceName = tsTypeFromIdentifier(flatProfile.base);
    const profileClassName = tsProfileClassName(flatProfile);
    const sliceDefs = collectSliceDefs(tsIndex, flatProfile);
    const factoryInfo = collectProfileFactoryInfo(tsIndex, flatProfile);

    generateInlineExtensionInputTypes(w, tsIndex, flatProfile);
    generateSliceInputTypes(w, flatProfile, sliceDefs);

    generateProfileHelpersImport(w, tsIndex, flatProfile, sliceDefs, factoryInfo);

    generateRawType(w, flatProfile, factoryInfo);
    generateFlatInputType(w, flatProfile);

    const canonicalUrl = flatProfile.identifier.url;
    w.comment("CanonicalURL:", canonicalUrl, `(pkg: ${packageMetaToFhir(packageMeta(flatProfile))})`);

    w.curlyBlock(["export", "class", profileClassName], () => {
        w.lineSM(`static readonly canonicalUrl = ${JSON.stringify(canonicalUrl)}`);
        w.line();
        generateStaticSliceFields(w, sliceDefs);
        w.lineSM(`private resource: ${tsBaseResourceName}`);
        w.line();
        generateFactoryMethods(w, tsIndex, flatProfile, factoryInfo);
        generateFieldAccessors(w, factoryInfo);

        w.line("// Extensions");
        generateExtensionMethods(w, tsIndex, flatProfile);

        w.line("// Slices");
        generateSliceSetters(w, sliceDefs, flatProfile);
        generateSliceGetters(w, sliceDefs, flatProfile);

        w.line("// Validation");
        generateValidateMethod(w, tsIndex, flatProfile);
    });
    w.line();
};
