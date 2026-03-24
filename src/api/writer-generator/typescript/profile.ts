import { pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    type ProfileExtension,
    type ProfileTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    tsCamelCase,
    tsExtensionFlatTypeName,
    tsExtensionMethodBaseName,
    tsFieldName,
    tsModulePath,
    tsNameFromCanonical,
    tsPackageDir,
    tsProfileClassName,
    tsProfileModuleName,
    tsQualifiedExtensionMethodBaseName,
    tsQualifiedSliceMethodBaseName,
    tsResourceName,
    tsSliceFlatTypeName,
    tsSliceMethodBaseName,
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
): void => {
    if (!isChoiceDeclarationField(field) || !field.required || field.choices.length !== 1) return;
    const choiceName = field.choices[0];
    if (!choiceName) return;
    const choiceField = fields[choiceName];
    if (!choiceField || !isChoiceInstanceField(choiceField)) return;
    const tsType = tsTypeFromIdentifier(choiceField.type) + (choiceField.array ? "[]" : "");
    params.push({ name: choiceName, tsType, typeId: choiceField.type });
    promotedChoices.add(choiceName);
};

export const collectProfileFactoryInfo = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fields = flatProfile.fields ?? {};
    const promotedChoices = new Set<string>();
    const resolveRef = tsIndex.findLastSpecializationByIdentifier;

    if (isResourceIdentifier(flatProfile.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(flatProfile.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            tryPromoteChoice(field, fields, params, promotedChoices);
            continue;
        }

        if (field.valueConstraint) {
            const value = JSON.stringify(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            if (isNotChoiceDeclarationField(field) && field.type) {
                const tsType = fieldTsType(field, resolveRef);
                autoAccessors.push({ name, tsType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field);
            if (sliceNames) {
                if (field.type) {
                    const tsType = fieldTsType(field, resolveRef);
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
            const tsType = fieldTsType(field, resolveRef);
            params.push({ name, tsType, typeId: field.type });
        }
    }

    collectBaseRequiredParams(tsIndex, flatProfile, resolveRef, params, [
        ...autoFields.map((f) => f.name),
        ...sliceAutoFields.map((f) => f.name),
        ...params.map((f) => f.name),
        ...promotedChoices,
    ]);

    const accessors = [...autoAccessors, ...collectChoiceAccessors(flatProfile, promotedChoices)];
    return { autoFields, sliceAutoFields, params, accessors };
};

/** Include base-type required fields not already covered by profile constraints */
const collectBaseRequiredParams = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    params: ProfileFactoryInfo["params"],
    coveredNames: string[],
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
            const tsType = fieldTsType(field, resolveRef);
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
    if (!isPrimitiveIdentifier(flatProfile.base)) imports.push("buildResource");
    if (flatProfile.base.name === "Extension" && !!canonicalUrl && collectSubExtensionSlices(flatProfile).length > 0)
        imports.push("isRawExtensionInput");
    if (canonicalUrl && hasMeta) imports.push("ensureProfile");
    if (sliceDefs.length > 0 || factoryInfo.sliceAutoFields.length > 0)
        imports.push("applySliceMatch", "matchesValue", "setArraySlice", "getArraySlice", "ensureSliceDefaults");
    if (extensions.some((ext) => ext.path.split(".").some((s) => s !== "extension"))) imports.push("ensurePath");
    if (extensions.some((ext) => ext.isComplex && ext.subExtensions)) imports.push("extractComplexExtension");
    if (sliceDefs.some((s) => !s.typeDiscriminator)) imports.push("stripMatchKeys");
    if (sliceDefs.some((s) => s.constrainedChoice)) imports.push("wrapSliceChoice", "unwrapSliceChoice");
    if (extensions.some((ext) => ext.url)) imports.push("isExtension", "getExtensionValue", "pushExtension");
    if (Object.keys(flatProfile.fields ?? {}).length > 0)
        imports.push(
            "validateRequired",
            "validateExcluded",
            "validateFixedValue",
            "validateSliceCardinality",
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
        w.lineSM(`private static readonly ${staticName}: Record<string, unknown> = ${JSON.stringify(sliceDef.match)}`);
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
            w.curlyBlock([`const resource = buildResource<${tsBaseResourceName}>(`], () => {
                for (const f of allFields) {
                    if (f.name === "extension") continue;
                    w.line(`${f.name}: ${f.value},`);
                }
                w.line(`extension: ${extensionVar},`);
                if (hasMeta) {
                    w.line(`meta: { profile: [${profileClassName}.canonicalUrl] },`);
                }
            }, [")"]);

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
                w.curlyBlock([`const resource = buildResource<${tsBaseResourceName}>(`], () => {
                    for (const f of allFields) {
                        w.line(`${f.name}: ${f.value},`);
                    }
                    if (hasMeta) {
                        w.line(`meta: { profile: [${profileClassName}.canonicalUrl] },`);
                    }
                }, [")"]);
            }
            w.lineSM("return resource");
        });
        w.line();
        w.curlyBlock(["static", "create", `(${paramSignature})`, `: ${profileClassName}`], () => {
            w.lineSM(
                `return ${profileClassName}.apply(${profileClassName}.createResource(${hasParams ? "args" : ""}))`,
            );
        });
    }
    w.line();
    // toResource() returns base type (e.g., Patient)
    w.curlyBlock(["toResource", "()", `: ${tsBaseResourceName}`], () => {
        w.lineSM("return this.resource");
    });
    w.line();
};

const generateFieldAccessors = (
    w: TypeScript,
    factoryInfo: ProfileFactoryInfo,
    extSliceMethodBaseNames: Set<string>,
) => {
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

    // Getter and setter methods for choice instance fields (skip if extension/slice has same name)
    for (const a of factoryInfo.accessors) {
        const methodBaseName = uppercaseFirstLetter(tsCamelCase(a.name));
        if (extSliceMethodBaseNames.has(methodBaseName)) continue;
        const fieldAccess = tsFieldName(a.name);
        w.curlyBlock([`get${methodBaseName}`, "()", `: ${a.tsType} | undefined`], () => {
            w.lineSM(`return ${tsGet("this.resource", fieldAccess)} as ${a.tsType} | undefined`);
        });
        w.line();
        w.curlyBlock([`set${methodBaseName}`, `(value: ${a.tsType})`, ": this"], () => {
            w.lineSM(`Object.assign(this.resource, { ${fieldAccess}: value })`);
            w.lineSM("return this");
        });
        w.line();
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

const generateSliceInputTypes = (w: TypeScript, flatProfile: ProfileTypeSchema, sliceDefs: SliceDef[]) => {
    if (sliceDefs.length === 0) return;
    const tsProfileName = tsResourceName(flatProfile.identifier);
    for (const sliceDef of sliceDefs) {
        const typeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
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
        let typeExpr = baseType;
        if (excludedNames.length > 0) {
            typeExpr = `Omit<${typeExpr}, ${excludedNames.join(" | ")}>`;
        }
        if (requiredNames.length > 0) {
            typeExpr = `${typeExpr} & Required<Pick<${baseType}, ${requiredNames.join(" | ")}>>`;
        }
        if (sliceDef.constrainedChoice) {
            typeExpr = `${typeExpr} & ${tsTypeFromIdentifier(sliceDef.constrainedChoice.variantType)}`;
        }
        w.lineSM(`export type ${typeName} = ${typeExpr}`);
    }
    w.line();
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

type ResolvedProfileMethods = {
    /** "url:path" → method base name (e.g., "Race" or "PathRace") */
    extensions: Record<string, string>;
    /** "fieldName:sliceName" → method base name */
    slices: Record<string, string>;
    /** All resolved base names (extensions + slices) for field accessor dedup */
    allBaseNames: Set<string>;
};

type NameEntry = { key: string; candidates: string[] };

const countBy = (entries: NameEntry[], level: number): Record<string, number> =>
    entries.reduce(
        (counts, e) => {
            const name = e.candidates[level] ?? "";
            counts[name] = (counts[name] ?? 0) + 1;
            return counts;
        },
        {} as Record<string, number>,
    );

/** Resolve naming collisions across multiple levels of candidates.
 *  Each entry provides candidate names in priority order (e.g. base → qualified → discriminated). */
const resolveNameCollisions = (entries: NameEntry[]): Record<string, string> => {
    const levels = entries[0]?.candidates.length ?? 0;

    const resolve = (unresolved: NameEntry[], level: number): Record<string, string> => {
        if (unresolved.length === 0 || level >= levels) return {};
        const counts = countBy(unresolved, level);
        const isLastLevel = level >= levels - 1;
        const [resolved, colliding] = unresolved.reduce(
            ([res, col], e) => {
                const name = e.candidates[level] ?? "";
                return (counts[name] ?? 0) > 1 && !isLastLevel ? [res, [...col, e]] : [{ ...res, [e.key]: name }, col];
            },
            [{} as Record<string, string>, [] as NameEntry[]],
        );
        return { ...resolved, ...resolve(colliding, level + 1) };
    };

    return resolve(entries, 0);
};

const toRecord = (entries: NameEntry[], resolved: Record<string, string>): Record<string, string> =>
    Object.fromEntries(entries.map((e) => [e.key, resolved[e.key] ?? e.candidates[0] ?? ""]));

const resolveProfileMethodBaseNames = (
    extensions: ProfileExtension[],
    sliceDefs: SliceDef[],
): ResolvedProfileMethods => {
    const extensionEntries: NameEntry[] = extensions
        .filter((ext) => ext.url)
        .map((ext) => {
            const base = tsExtensionMethodBaseName(ext.name);
            const qualified = tsQualifiedExtensionMethodBaseName(ext.name, ext.path);
            return { key: `${ext.url}:${ext.path}`, candidates: [base, qualified, `${qualified}Extension`] };
        });

    const sliceEntries: NameEntry[] = sliceDefs.map((slice) => {
        const base = tsSliceMethodBaseName(slice.sliceName);
        const qualified = tsQualifiedSliceMethodBaseName(slice.fieldName, slice.sliceName);
        return { key: `${slice.fieldName}:${slice.sliceName}`, candidates: [base, qualified, `${qualified}Slice`] };
    });

    const resolved = resolveNameCollisions([...extensionEntries, ...sliceEntries]);
    const extensionsRecords = toRecord(extensionEntries, resolved);
    const slicesRecords = toRecord(sliceEntries, resolved);
    const allBaseNames = new Set([...Object.values(extensionsRecords), ...Object.values(slicesRecords)]);

    return { extensions: extensionsRecords, slices: slicesRecords, allBaseNames };
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

    const resolvedMethodNames = resolveProfileMethodBaseNames(flatProfile.extensions ?? [], sliceDefs);

    w.curlyBlock(["export", "class", profileClassName], () => {
        w.lineSM(`static readonly canonicalUrl = ${JSON.stringify(canonicalUrl)}`);
        w.line();
        generateStaticSliceFields(w, sliceDefs);
        w.lineSM(`private resource: ${tsBaseResourceName}`);
        w.line();
        generateFactoryMethods(w, tsIndex, flatProfile, factoryInfo);
        generateFieldAccessors(w, factoryInfo, resolvedMethodNames.allBaseNames);

        w.line("// Extensions");
        generateExtensionMethods(w, tsIndex, flatProfile, resolvedMethodNames.extensions);

        w.line("// Slices");
        generateSliceSetters(w, sliceDefs, flatProfile, resolvedMethodNames.slices);
        generateSliceGetters(w, sliceDefs, flatProfile, resolvedMethodNames.slices);

        w.line("// Validation");
        generateValidateMethod(w, tsIndex, flatProfile);
    });
    w.line();
};
