import { pascalCase, typeSchemaInfo, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
    type ChoiceFieldInstance,
    type Identifier,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    isSpecializationTypeSchema,
    type ProfileExtension,
    type ProfileTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type RegularField,
    type TypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    normalizeTsName,
    tsCamelCase,
    tsExtensionInputTypeName,
    tsExtensionMethodName,
    tsFieldName,
    tsModulePath,
    tsNameFromCanonical,
    tsPackageDir,
    tsProfileClassName,
    tsProfileModuleName,
    tsQualifiedExtensionMethodName,
    tsQualifiedSliceMethodName,
    tsResourceName,
    tsSliceInputTypeName,
    tsSliceMethodName,
    tsSliceStaticName,
} from "./name";
import { resolveFieldTsType, resolvePrimitiveType, tsEnumType, tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    /** Array fields with required slices — optional param with auto-merge of required stubs */
    sliceAutoFields: { name: string; tsType: string; typeId: Identifier; sliceNames: string[] }[];
    params: { name: string; tsType: string; typeId: Identifier }[];
    accessors: { name: string; tsType: string; typeId: Identifier }[];
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

const collectRequiredSliceNames = (field: RegularField): string[] | undefined => {
    if (!field.array || !field.slicing?.slices) return undefined;
    const names = Object.entries(field.slicing.slices)
        .filter(([_, s]) => s.min !== undefined && s.min >= 1 && s.match && Object.keys(s.match).length > 0)
        .map(([name]) => name);
    return names.length > 0 ? names : undefined;
};

const collectProfileFactoryInfo = (tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema): ProfileFactoryInfo => {
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
                const tsType = resolveFieldTsType("", "", field, resolveRef) + (field.array ? "[]" : "");
                autoAccessors.push({ name, tsType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field);
            if (sliceNames) {
                if (field.type) {
                    const tsType = resolveFieldTsType("", "", field, resolveRef) + (field.array ? "[]" : "");
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
            const tsType = resolveFieldTsType("", "", field, resolveRef) + (field.array ? "[]" : "");
            params.push({ name, tsType, typeId: field.type });
        }
    }

    // Include base-type required fields not already covered by profile constraints
    const coveredFields = new Set([
        ...autoFields.map((f) => f.name),
        ...sliceAutoFields.map((f) => f.name),
        ...params.map((f) => f.name),
        ...promotedChoices,
    ]);
    const baseSchema = tsIndex.resolve(flatProfile.base);
    if (baseSchema && "fields" in baseSchema && baseSchema.fields) {
        for (const [name, field] of Object.entries(baseSchema.fields)) {
            if (coveredFields.has(name)) continue;
            if (!field.required) continue;
            if (isChoiceInstanceField(field)) continue;
            if (isChoiceDeclarationField(field)) continue;
            if (isNotChoiceDeclarationField(field) && field.type) {
                const tsType = resolveFieldTsType("", "", field, resolveRef) + (field.array ? "[]" : "");
                params.push({ name, tsType, typeId: field.type });
            }
        }
    }

    const accessors = [...autoAccessors, ...collectChoiceAccessors(flatProfile, promotedChoices)];
    return { autoFields, sliceAutoFields, params, accessors };
};

export const generateProfileIndexFile = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    initialProfiles: ProfileTypeSchema[],
) => {
    if (initialProfiles.length === 0) return;
    w.cd("profiles", () => {
        w.cat("index.ts", () => {
            const profiles: [ProfileTypeSchema, string, string | undefined][] = initialProfiles.map((profile) => {
                const className = tsProfileClassName(profile);
                const resourceName = tsResourceName(profile.identifier);
                const overrides = detectFieldOverrides(w, tsIndex, profile);
                let typeExport;
                if (overrides.size > 0) typeExport = resourceName;
                return [profile, className, typeExport];
            });
            if (profiles.length === 0) return;
            const classExports: Map<string, string> = new Map();
            const typeExports: Map<string, string> = new Map();
            for (const [profile, className, typeName] of profiles) {
                const moduleName = tsProfileModuleName(tsIndex, profile);
                if (!classExports.has(className)) {
                    classExports.set(className, `export { ${className} } from "./${moduleName}"`);
                }
                if (typeName && !typeExports.has(typeName)) {
                    typeExports.set(typeName, `export type { ${typeName} } from "./${moduleName}"`);
                }
            }
            const allExports = [...classExports.values(), ...typeExports.values()].sort();
            for (const exp of allExports) {
                w.lineSM(exp);
            }
        });
    });
};

const tsTypeForProfileField = (
    _w: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    fieldName: string,
    field: NonNullable<ProfileTypeSchema["fields"]>[string],
): string => {
    if (!isNotChoiceDeclarationField(field)) {
        throw new Error(`Choice declaration fields not supported for '${fieldName}'`);
    }

    let tsType: string;
    if (field.enum) {
        if (field.type?.name === "Coding") {
            tsType = `Coding<${tsEnumType(field.enum)}>`;
        } else if (field.type?.name === "CodeableConcept") {
            tsType = `CodeableConcept<${tsEnumType(field.enum)}>`;
        } else {
            tsType = tsEnumType(field.enum);
        }
    } else if (field.reference && field.reference.length > 0) {
        const specialization = tsIndex.findLastSpecialization(flatProfile);
        if (!isSpecializationTypeSchema(specialization))
            throw new Error(`Invalid specialization for ${flatProfile.identifier}`);

        const sField = specialization.fields?.[fieldName];
        if (sField === undefined || isChoiceDeclarationField(sField) || sField.reference === undefined)
            throw new Error(`Invalid field declaration for ${fieldName}`);

        const sRefs = sField.reference.map((e) => e.name);
        const references = field.reference
            .map((ref) => {
                const resRef = tsIndex.findLastSpecializationByIdentifier(ref);
                if (resRef.name !== ref.name) {
                    return `"${resRef.name}" /*${ref.name}*/`;
                }
                return `'${ref.name}'`;
            })
            .join(" | ");
        if (sRefs.length === 1 && sRefs[0] === "Resource" && references !== '"Resource"') {
            // FIXME: should be generilized to type families
            // Strip inner comments to avoid nested /* */ which is invalid
            const cleanRefs = references.replace(/\/\*[^*]*\*\//g, "").trim();
            tsType = `Reference<"Resource" /* ${cleanRefs} */ >`;
        } else {
            tsType = `Reference<${references}>`;
        }
    } else if (isPrimitiveIdentifier(field.type)) {
        tsType = resolvePrimitiveType(field.type.name);
    } else if (isNestedIdentifier(field.type)) {
        tsType = tsResourceName(field.type);
    } else if (field.type === undefined) {
        throw new Error(`Undefined type for '${fieldName}' field at ${typeSchemaInfo(flatProfile)}`);
    } else {
        tsType = field.type.name;
    }

    return tsType;
};

const generateProfileHelpersImport = (
    w: TypeScript,
    options: {
        needsGetOrCreateObjectAtPath: boolean;
        needsSliceHelpers: boolean;
        needsExtensionExtraction: boolean;
        needsSliceExtraction: boolean;
        needsSliceChoiceHelpers: boolean;
        needsValidation: boolean;
        needsRegisterProfile: boolean;
    },
) => {
    const imports: string[] = [];
    if (options.needsRegisterProfile) imports.push("ensureProfile");
    if (options.needsSliceHelpers)
        imports.push("applySliceMatch", "matchesValue", "setArraySlice", "getArraySlice", "ensureSliceDefaults");
    if (options.needsGetOrCreateObjectAtPath) imports.push("ensurePath");
    if (options.needsExtensionExtraction) imports.push("extractComplexExtension");
    if (options.needsSliceExtraction) imports.push("stripMatchKeys");
    if (options.needsSliceChoiceHelpers) imports.push("wrapSliceChoice", "unwrapSliceChoice");
    if (options.needsValidation)
        imports.push(
            "validateRequired",
            "validateExcluded",
            "validateFixedValue",
            "validateSliceCardinality",
            "validateEnum",
            "validateReference",
            "validateChoiceRequired",
        );
    if (imports.length > 0) w.lineSM(`import { ${imports.join(", ")} } from "../../profile-helpers"`);
};

const collectTypesFromSlices = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: Identifier) => void,
) => {
    for (const field of Object.values(flatProfile.fields ?? {})) {
        if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) continue;
        for (const slice of Object.values(field.slicing.slices)) {
            if (Object.keys(slice.match ?? {}).length > 0) {
                addType(field.type);
                // Also add constrained choice variant types for flattened API
                const cc = detectConstrainedChoice(tsIndex, flatProfile, field.type, slice.elements);
                if (cc) addType(cc.variantTypeId);
            }
        }
    }
};

const collectTypesFromExtensions = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: Identifier) => void,
): boolean => {
    let needsExtensionType = false;

    for (const ext of flatProfile.extensions ?? []) {
        if (ext.isComplex && ext.subExtensions) {
            needsExtensionType = true;
            for (const sub of ext.subExtensions) {
                if (!sub.valueType) continue;
                const resolvedType = tsIndex.resolveByUrl(
                    flatProfile.identifier.package,
                    sub.valueType.url as CanonicalUrl,
                );
                addType(resolvedType?.identifier ?? sub.valueType);
            }
        } else if (ext.valueTypes && ext.valueTypes.length === 1) {
            needsExtensionType = true;
            if (ext.valueTypes[0]) {
                const resolvedType = tsIndex.resolveByUrl(
                    flatProfile.identifier.package,
                    ext.valueTypes[0].url as CanonicalUrl,
                );
                addType(resolvedType?.identifier ?? ext.valueTypes[0]);
            }
        } else {
            needsExtensionType = true;
        }
    }

    return needsExtensionType;
};

const collectTypesFromFieldOverrides = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    addType: (typeId: Identifier) => void,
) => {
    const referenceUrl = "http://hl7.org/fhir/StructureDefinition/Reference" as CanonicalUrl;
    const referenceSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, referenceUrl);
    const specialization = tsIndex.findLastSpecialization(flatProfile);

    if (!isSpecializationTypeSchema(specialization)) return;

    for (const [fieldName, pField] of Object.entries(flatProfile.fields ?? {})) {
        if (!isNotChoiceDeclarationField(pField)) continue;
        const sField = specialization.fields?.[fieldName];
        if (!sField || isChoiceDeclarationField(sField)) continue;

        if (pField.reference && sField.reference && pField.reference.length < sField.reference.length) {
            if (referenceSchema) addType(referenceSchema.identifier);
        } else if (pField.required && !sField.required && pField.type) {
            addType(pField.type);
        }
    }
};

export const generateProfileImports = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const usedTypes = new Map<string, { importPath: string; tsName: string }>();

    const getModulePath = (typeId: Identifier): string => {
        if (isNestedIdentifier(typeId)) {
            const path = tsNameFromCanonical(typeId.url, true);
            if (path) return `../../${tsPackageDir(typeId.package)}/${pascalCase(path)}`;
        }
        return `../../${tsModulePath(typeId)}`;
    };

    const addType = (typeId: Identifier) => {
        if (typeId.kind === "primitive-type") return;
        const tsName = tsResourceName(typeId);
        if (!usedTypes.has(tsName)) {
            usedTypes.set(tsName, { importPath: getModulePath(typeId), tsName });
        }
    };

    addType(flatProfile.base);
    collectTypesFromSlices(tsIndex, flatProfile, addType);
    const needsExtensionType = collectTypesFromExtensions(tsIndex, flatProfile, addType);
    collectTypesFromFieldOverrides(tsIndex, flatProfile, addType);

    const factoryInfo = collectProfileFactoryInfo(tsIndex, flatProfile);
    for (const param of factoryInfo.params) addType(param.typeId);
    for (const f of factoryInfo.sliceAutoFields) addType(f.typeId);
    for (const accessor of factoryInfo.accessors) addType(accessor.typeId);

    if (needsExtensionType) {
        const extensionUrl = "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl;
        const extensionSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, extensionUrl);
        if (extensionSchema) addType(extensionSchema.identifier);
    }

    const sortedImports = Array.from(usedTypes.values()).sort((a, b) => a.tsName.localeCompare(b.tsName));
    for (const { importPath, tsName } of sortedImports) {
        w.tsImportType(importPath, tsName);
    }
    if (sortedImports.length > 0) w.line();
};

/** Collect method suffixes that extension/slice accessors will generate, to avoid duplicates */
const collectExtSliceMethodSuffixes = (
    extensions: ProfileExtension[],
    extensionMethodNames: Map<ProfileExtension, string>,
): Set<string> => {
    const suffixes = new Set<string>();
    for (const name of extensionMethodNames.values()) {
        suffixes.add(name.replace(/^set/, ""));
    }
    for (const ext of extensions) {
        if (ext.url) suffixes.add(uppercaseFirstLetter(tsCamelCase(ext.name)));
    }
    return suffixes;
};

type ConstrainedChoice = {
    choiceBase: string;
    variant: string;
    variantType: string;
    variantTypeId: Identifier;
    allChoiceNames: string[];
};

/**
 * Detect if a slice constrains a polymorphic field to exactly one variant.
 * E.g., BP systolic slice constrains value[x] (11 variants) to only valueQuantity.
 */
const detectConstrainedChoice = (
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    sliceBaseTypeId: Identifier,
    sliceElements: string[] | undefined,
): ConstrainedChoice | undefined => {
    if (!sliceElements) return undefined;

    // Resolve the base type's TypeSchema to find choice declarations
    const baseSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, sliceBaseTypeId.url as CanonicalUrl);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return undefined;

    for (const [fieldName, field] of Object.entries(baseSchema.fields)) {
        if (!isChoiceDeclarationField(field)) continue;

        // Find which choice instances are in the slice elements
        const matchingVariants = field.choices.filter((c) => sliceElements.includes(c));
        if (matchingVariants.length !== 1) continue;

        const variantName = matchingVariants[0] as string;
        const variantField = baseSchema.fields[variantName];
        if (!variantField || !isChoiceInstanceField(variantField)) continue;

        // Skip flattening for primitive types — can't intersect object with boolean/string/etc.
        if (isPrimitiveIdentifier(variantField.type)) continue;

        return {
            choiceBase: fieldName,
            variant: variantName,
            variantType: tsTypeFromIdentifier(variantField.type),
            variantTypeId: variantField.type,
            allChoiceNames: field.choices,
        };
    }
    return undefined;
};

export const generateProfileClass = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
    schema?: TypeSchema,
) => {
    const tsBaseResourceName = tsTypeFromIdentifier(flatProfile.base);
    const tsProfileName = tsResourceName(flatProfile.identifier);
    const profileClassName = tsProfileClassName(flatProfile);

    // Known polymorphic field base names in FHIR (value[x], effective[x], etc.)
    // These don't exist as direct properties on TypeScript types
    const polymorphicBaseNames = new Set([
        "value",
        "effective",
        "onset",
        "abatement",
        "occurrence",
        "timing",
        "deceased",
        "born",
        "age",
        "medication",
        "performed",
        "serviced",
        "collected",
        "item",
        "subject",
        "bounds",
        "amount",
        "content",
        "product",
        "rate",
        "dose",
        "asNeeded",
    ]);

    const sliceDefs = Object.entries(flatProfile.fields ?? {})
        .filter(([_fieldName, field]) => isNotChoiceDeclarationField(field) && field.slicing?.slices)
        .flatMap(([fieldName, field]) => {
            if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) return [];
            const baseType = tsTypeFromIdentifier(field.type);
            return Object.entries(field.slicing.slices)
                .filter(([_sliceName, slice]) => {
                    const match = slice.match ?? {};
                    return Object.keys(match).length > 0;
                })
                .map(([sliceName, slice]) => {
                    const matchFields = Object.keys(slice.match ?? {});
                    const required = slice.required ?? [];
                    // Filter out fields that are in match or polymorphic base names
                    const filteredRequired = required.filter(
                        (name) => !matchFields.includes(name) && !polymorphicBaseNames.has(name),
                    );
                    const constrainedChoice = detectConstrainedChoice(tsIndex, flatProfile, field.type, slice.elements);
                    return {
                        fieldName,
                        baseType,
                        sliceName,
                        match: slice.match ?? {},
                        required,
                        excluded: slice.excluded ?? [],
                        array: Boolean(field.array),
                        // Input is optional when there are no required fields after filtering
                        inputOptional: filteredRequired.length === 0,
                        constrainedChoice,
                    };
                });
        });

    const extensions = flatProfile.extensions ?? [];
    const complexExtensions = extensions.filter((ext) => ext.isComplex && ext.subExtensions);

    for (const ext of complexExtensions) {
        const typeName = tsExtensionInputTypeName(tsProfileName, ext.name);
        w.curlyBlock(["export", "type", typeName, "="], () => {
            for (const sub of ext.subExtensions ?? []) {
                const tsType = sub.valueType ? tsTypeFromIdentifier(sub.valueType) : "unknown";
                const isArray = sub.max === "*";
                const isRequired = sub.min !== undefined && sub.min > 0;
                w.lineSM(`${sub.name}${isRequired ? "" : "?"}: ${tsType}${isArray ? "[]" : ""}`);
            }
        });
        w.line();
    }

    if (sliceDefs.length > 0) {
        for (const sliceDef of sliceDefs) {
            const typeName = tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
            const matchFields = Object.keys(sliceDef.match);
            const allExcluded = [...new Set([...sliceDef.excluded, ...matchFields])];
            // When a choice is constrained to a single variant, also omit the choice base + all instances
            if (sliceDef.constrainedChoice) {
                const cc = sliceDef.constrainedChoice;
                allExcluded.push(cc.choiceBase);
                for (const name of cc.allChoiceNames) {
                    if (!allExcluded.includes(name)) allExcluded.push(name);
                }
            }
            const excludedNames = allExcluded.map((name) => JSON.stringify(name));
            // Filter out polymorphic base names that don't exist as direct TS properties
            const filteredRequired = sliceDef.required.filter(
                (name) => !matchFields.includes(name) && !polymorphicBaseNames.has(name),
            );
            const requiredNames = filteredRequired.map((name) => JSON.stringify(name));
            let typeExpr = sliceDef.baseType;
            if (excludedNames.length > 0) {
                typeExpr = `Omit<${typeExpr}, ${excludedNames.join(" | ")}>`;
            }
            if (requiredNames.length > 0) {
                typeExpr = `${typeExpr} & Required<Pick<${sliceDef.baseType}, ${requiredNames.join(" | ")}>>`;
            }
            // Intersect with the single variant's type for flattened API
            if (sliceDef.constrainedChoice) {
                typeExpr = `${typeExpr} & ${sliceDef.constrainedChoice.variantType}`;
            }
            w.lineSM(`export type ${typeName} = ${typeExpr}`);
        }
        w.line();
    }

    // Check if we have an override interface (narrowed types)
    const hasOverrideInterface = detectFieldOverrides(w, tsIndex, flatProfile).size > 0;
    const factoryInfo = collectProfileFactoryInfo(tsIndex, flatProfile);

    // Determine which helpers are actually needed
    const needsSliceHelpers = sliceDefs.length > 0 || factoryInfo.sliceAutoFields.length > 0;
    const extensionsWithNestedPath = extensions.filter((ext) => {
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        return targetPath.length > 0;
    });
    const needsGetOrCreateObjectAtPath = extensionsWithNestedPath.length > 0;
    const needsExtensionExtraction = complexExtensions.length > 0;
    const needsSliceExtraction = sliceDefs.length > 0;
    const needsSliceChoiceHelpers = sliceDefs.some((s) => s.constrainedChoice);

    const needsValidation = Object.keys(flatProfile.fields ?? {}).length > 0;
    const hasMeta = tsIndex.isWithMetaField(flatProfile);
    const needsRegisterProfile = !!schema?.identifier.url && hasMeta;

    if (
        needsSliceHelpers ||
        needsGetOrCreateObjectAtPath ||
        needsExtensionExtraction ||
        needsSliceExtraction ||
        needsSliceChoiceHelpers ||
        needsValidation ||
        needsRegisterProfile
    ) {
        generateProfileHelpersImport(w, {
            needsGetOrCreateObjectAtPath,
            needsSliceHelpers,
            needsExtensionExtraction,
            needsSliceExtraction,
            needsSliceChoiceHelpers,
            needsValidation,
            needsRegisterProfile,
        });
        w.line();
    }

    const hasParams = factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0;
    const createArgsTypeName = `${profileClassName}Params`;
    const paramSignature = hasParams ? `args: ${createArgsTypeName}` : "";
    const allFields = [
        ...factoryInfo.autoFields.map((f) => ({ name: f.name, value: f.value })),
        ...factoryInfo.sliceAutoFields.map((f) => ({ name: f.name, value: `${f.name}WithDefaults` })),
        ...factoryInfo.params.map((p) => ({ name: p.name, value: `args.${p.name}` })),
    ];

    if (hasParams) {
        w.curlyBlock(["export", "type", createArgsTypeName, "="], () => {
            for (const p of factoryInfo.params) {
                w.lineSM(`${p.name}: ${p.tsType}`);
            }
            for (const f of factoryInfo.sliceAutoFields) {
                w.lineSM(`${f.name}?: ${f.tsType}`);
            }
        });
        w.line();
    }

    const canonicalUrl = schema?.identifier.url;

    if (schema) {
        w.comment("CanonicalURL:", schema.identifier.url, `(pkg: ${packageMetaToFhir(packageMeta(schema))})`);
    }
    w.curlyBlock(["export", "class", profileClassName], () => {
        if (canonicalUrl) {
            w.line(`static readonly canonicalUrl = ${JSON.stringify(canonicalUrl)}`);
            w.line();
        }
        for (const sliceDef of sliceDefs) {
            const staticName = `${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
            w.line(
                `private static readonly ${staticName}: Record<string, unknown> = ${JSON.stringify(sliceDef.match)}`,
            );
        }
        if (sliceDefs.length > 0) w.line();
        w.line(`private resource: ${tsBaseResourceName}`);
        w.line();
        w.curlyBlock(["constructor", `(resource: ${tsBaseResourceName})`], () => {
            w.line("this.resource = resource");
            if (canonicalUrl && hasMeta) {
                w.line(`ensureProfile(resource, ${JSON.stringify(canonicalUrl)})`);
            }
        });
        w.line();
        w.curlyBlock(["static", "from", `(resource: ${tsBaseResourceName})`, `: ${profileClassName}`], () => {
            w.line(`return new ${profileClassName}(resource)`);
        });
        w.line();
        w.curlyBlock(["static", "createResource", `(${paramSignature})`, `: ${tsBaseResourceName}`], () => {
            // Generate merge logic for slice auto-fields
            for (const f of factoryInfo.sliceAutoFields) {
                const matchRefs = f.sliceNames.map((s) => `${profileClassName}.${tsSliceStaticName(s)}SliceMatch`);
                w.line(`const ${f.name}WithDefaults = ensureSliceDefaults(`);
                w.indentBlock(() => {
                    w.line(`[...(args.${f.name} ?? [])],`);
                    for (const ref of matchRefs) {
                        w.line(`${ref},`);
                    }
                });
                w.line(")");
            }
            if (factoryInfo.sliceAutoFields.length > 0) {
                w.line();
            }
            if (isPrimitiveIdentifier(flatProfile.base)) {
                w.line(`const resource = undefined as unknown as ${tsBaseResourceName}`);
            } else {
                w.curlyBlock(["const resource ="], () => {
                    for (const f of allFields) {
                        w.line(`${f.name}: ${f.value},`);
                    }
                    if (canonicalUrl && hasMeta) {
                        w.line(`meta: { profile: [${profileClassName}.canonicalUrl] },`);
                    }
                }, [` as unknown as ${tsBaseResourceName}`]);
            }
            w.line("return resource");
        });
        w.line();
        w.curlyBlock(["static", "create", `(${paramSignature})`, `: ${profileClassName}`], () => {
            w.line(`return ${profileClassName}.from(${profileClassName}.createResource(${hasParams ? "args" : ""}))`);
        });
        w.line();
        // toResource() returns base type (e.g., Patient)
        w.curlyBlock(["toResource", "()", `: ${tsBaseResourceName}`], () => {
            w.line("return this.resource");
        });
        w.line();
        // -- Field accessors section --
        const hasFieldAccessors = factoryInfo.params.length > 0 || factoryInfo.accessors.length > 0;
        if (hasFieldAccessors) {
            w.line("// Field accessors");
            w.line();
        }
        for (const p of factoryInfo.params) {
            const methodSuffix = uppercaseFirstLetter(p.name);
            w.curlyBlock([`get${methodSuffix}`, "()", `: ${p.tsType} | undefined`], () => {
                w.line(`return this.resource.${p.name} as ${p.tsType} | undefined`);
            });
            w.line();
            w.curlyBlock([`set${methodSuffix}`, `(value: ${p.tsType})`, ": this"], () => {
                w.line(`Object.assign(this.resource, { ${p.name}: value })`);
                w.line("return this");
            });
            w.line();
        }
        // Compute extension and slice method names first to detect collisions with accessors
        const extensionMethods = extensions
            .filter((ext) => ext.url)
            .map((ext) => ({
                ext,
                baseName: tsExtensionMethodName(ext.name),
                fallbackName: tsQualifiedExtensionMethodName(ext.name, ext.path),
            }));
        const sliceMethodBases = sliceDefs.map((slice) => tsSliceMethodName(slice.sliceName));
        const methodCounts = new Map<string, number>();
        for (const name of [...sliceMethodBases, ...extensionMethods.map((m) => m.baseName)]) {
            methodCounts.set(name, (methodCounts.get(name) ?? 0) + 1);
        }
        const extensionMethodNames = new Map(
            extensionMethods.map((entry) => [
                entry.ext,
                (methodCounts.get(entry.baseName) ?? 0) > 1 ? entry.fallbackName : entry.baseName,
            ]),
        );
        const sliceMethodNames = new Map(
            sliceDefs.map((slice) => {
                const baseName = tsSliceMethodName(slice.sliceName);
                const needsFallback = (methodCounts.get(baseName) ?? 0) > 1;
                const fallback = tsQualifiedSliceMethodName(slice.fieldName, slice.sliceName);
                return [slice, needsFallback ? fallback : baseName];
            }),
        );

        const extSliceMethodSuffixes = collectExtSliceMethodSuffixes(extensions, extensionMethodNames);

        // Getter and setter methods for choice instance fields (skip if extension/slice has same name)
        for (const a of factoryInfo.accessors) {
            const methodSuffix = uppercaseFirstLetter(tsCamelCase(a.name));
            if (extSliceMethodSuffixes.has(methodSuffix)) continue;
            const fieldAccess = tsFieldName(a.name);
            w.curlyBlock([`get${methodSuffix}`, "()", `: ${a.tsType} | undefined`], () => {
                w.line(`return ${tsGet("this.resource", fieldAccess)} as ${a.tsType} | undefined`);
            });
            w.line();
            w.curlyBlock([`set${methodSuffix}`, `(value: ${a.tsType})`, ": this"], () => {
                w.line(`Object.assign(this.resource, { ${fieldAccess}: value })`);
                w.line("return this");
            });
            w.line();
        }
        // toProfile() returns casted profile type if override interface exists
        if (hasOverrideInterface) {
            w.curlyBlock(["toProfile", "()", `: ${tsProfileName}`], () => {
                w.line(`return this.resource as ${tsProfileName}`);
            });
            w.line();
        }

        // -- Slices and extensions section --
        const hasSlicesOrExtensions = extensions.length > 0 || sliceDefs.length > 0;
        if (hasSlicesOrExtensions) {
            w.line("// Slices and extensions");
            w.line();
        }

        generateExtensionSetterMethods(w, extensions, extensionMethodNames, tsProfileName);

        for (const sliceDef of sliceDefs) {
            const methodName =
                sliceMethodNames.get(sliceDef) ?? tsQualifiedSliceMethodName(sliceDef.fieldName, sliceDef.sliceName);
            const typeName = tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
            const matchRef = `${profileClassName}.${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
            const tsField = tsFieldName(sliceDef.fieldName);
            const fieldAccess = tsGet("this.resource", tsField);
            // Make input optional when there are no required fields (input can be empty object)
            const paramSignature = sliceDef.inputOptional
                ? `(input?: ${typeName}): this`
                : `(input: ${typeName}): this`;
            w.curlyBlock(["public", methodName, paramSignature], () => {
                w.line(`const match = ${matchRef}`);
                const inputExpr = sliceDef.inputOptional ? "input ?? {}" : "input";
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(
                        `const wrapped = wrapSliceChoice<${sliceDef.baseType}>(${inputExpr}, ${JSON.stringify(cc.variant)})`,
                    );
                    w.line(`const value = applySliceMatch<${sliceDef.baseType}>(wrapped, match)`);
                } else {
                    w.line(`const value = applySliceMatch<${sliceDef.baseType}>(${inputExpr}, match)`);
                }
                if (sliceDef.array) {
                    w.line(`setArraySlice(${fieldAccess} ??= [], match, value)`);
                } else {
                    w.line(`${fieldAccess} = value`);
                }
                w.line("return this");
            });
            w.line();
        }

        // Generate extension getters - two methods per extension:
        // 1. get{Name}() - returns flat API (simplified)
        // 2. get{Name}Extension() - returns raw FHIR Extension
        const generatedGetMethods = new Set<string>();

        for (const ext of extensions) {
            if (!ext.url) continue;
            const baseName = uppercaseFirstLetter(tsCamelCase(ext.name));
            const getMethodName = `get${baseName}`;
            const getExtensionMethodName = `get${baseName}Extension`;
            if (generatedGetMethods.has(getMethodName)) continue;
            generatedGetMethods.add(getMethodName);
            const valueTypes = ext.valueTypes ?? [];
            const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

            // Helper to generate the extension lookup code
            const generateExtLookup = () => {
                if (targetPath.length === 0) {
                    w.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
                } else {
                    w.line(
                        `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                    );
                    w.line(
                        `const ext = (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`,
                    );
                }
            };

            if (ext.isComplex && ext.subExtensions) {
                const inputTypeName = tsExtensionInputTypeName(tsProfileName, ext.name);
                // Flat API getter
                w.curlyBlock(["public", getMethodName, `(): ${inputTypeName} | undefined`], () => {
                    generateExtLookup();
                    w.line("if (!ext) return undefined");
                    // Build extraction config
                    const configItems = (ext.subExtensions ?? []).map((sub) => {
                        const valueField = sub.valueType ? `value${uppercaseFirstLetter(sub.valueType.name)}` : "value";
                        const isArray = sub.max === "*";
                        return `{ name: "${sub.url}", valueField: "${valueField}", isArray: ${isArray} }`;
                    });
                    w.line(`const config = [${configItems.join(", ")}]`);
                    w.line(
                        `return extractComplexExtension(ext as unknown as { extension?: Array<{ url?: string; [key: string]: unknown }> }, config) as ${inputTypeName}`,
                    );
                });
                w.line();
                // Raw Extension getter
                w.curlyBlock(["public", getExtensionMethodName, "(): Extension | undefined"], () => {
                    generateExtLookup();
                    w.line("return ext");
                });
            } else if (valueTypes.length === 1 && valueTypes[0]) {
                const firstValueType = valueTypes[0];
                const valueType = tsTypeFromIdentifier(firstValueType);
                const valueField = `value${uppercaseFirstLetter(firstValueType.name)}`;
                // Flat API getter (cast needed: value field may not exist on Extension in this FHIR version)
                w.curlyBlock(["public", getMethodName, `(): ${valueType} | undefined`], () => {
                    generateExtLookup();
                    w.line(
                        `return (ext as Record<string, unknown> | undefined)?.${valueField} as ${valueType} | undefined`,
                    );
                });
                w.line();
                // Raw Extension getter
                w.curlyBlock(["public", getExtensionMethodName, "(): Extension | undefined"], () => {
                    generateExtLookup();
                    w.line("return ext");
                });
            } else {
                // Generic extension - only raw getter makes sense
                w.curlyBlock(["public", getMethodName, "(): Extension | undefined"], () => {
                    if (targetPath.length === 0) {
                        w.line(`return this.resource.extension?.find(e => e.url === "${ext.url}")`);
                    } else {
                        w.line(
                            `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                        );
                        w.line(
                            `return (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`,
                        );
                    }
                });
            }
            w.line();
        }

        // Generate slice getters - two methods per slice:
        // 1. get{SliceName}() - returns simplified (without discriminator fields)
        // 2. get{SliceName}Raw() - returns full FHIR type with all fields
        for (const sliceDef of sliceDefs) {
            const baseName = uppercaseFirstLetter(normalizeTsName(sliceDef.sliceName));
            const getMethodName = `get${baseName}`;
            const getRawMethodName = `get${baseName}Raw`;
            if (generatedGetMethods.has(getMethodName)) continue;
            generatedGetMethods.add(getMethodName);
            const typeName = tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
            const matchRef = `${profileClassName}.${tsSliceStaticName(sliceDef.sliceName)}SliceMatch`;
            const matchKeys = JSON.stringify(Object.keys(sliceDef.match));
            const tsField = tsFieldName(sliceDef.fieldName);
            const fieldAccess = tsGet("this.resource", tsField);
            const baseType = sliceDef.baseType;

            // Helper to find the slice item
            const generateSliceLookup = () => {
                w.line(`const match = ${matchRef}`);
                if (sliceDef.array) {
                    w.line(`const item = getArraySlice(${fieldAccess}, match)`);
                } else {
                    w.line(`const item = ${fieldAccess}`);
                    w.line("if (!item || !matchesValue(item, match)) return undefined");
                }
            };

            // Flat API getter (simplified)
            w.curlyBlock(["public", getMethodName, `(): ${typeName} | undefined`], () => {
                generateSliceLookup();
                if (sliceDef.array) {
                    w.line("if (!item) return undefined");
                }
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(`return unwrapSliceChoice<${typeName}>(item, ${matchKeys}, ${JSON.stringify(cc.variant)})`);
                } else {
                    w.line(`return stripMatchKeys<${typeName}>(item, ${matchKeys})`);
                }
            });
            w.line();

            // Raw getter (full FHIR type)
            w.curlyBlock(["public", getRawMethodName, `(): ${baseType} | undefined`], () => {
                generateSliceLookup();
                w.line("return item");
            });
            w.line();
        }

        // -- Validation section --
        if (needsValidation) {
            w.line("// Validation");
            w.line();
        }
        generateValidateMethod(w, tsIndex, flatProfile);
    });
    w.line();
};

const collectRegularFieldValidation = (
    exprs: string[],
    name: string,
    field: RegularField | ChoiceFieldInstance,
    resolveRef: (ref: Identifier) => Identifier,
) => {
    if (field.excluded) {
        exprs.push(`...validateExcluded(res, profileName, ${JSON.stringify(name)})`);
        return;
    }

    if (field.required) exprs.push(`...validateRequired(res, profileName, ${JSON.stringify(name)})`);

    if (field.valueConstraint)
        exprs.push(
            `...validateFixedValue(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.valueConstraint.value)})`,
        );

    if (field.enum && !field.enum.isOpen)
        exprs.push(`...validateEnum(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.enum.values)})`);

    if (field.reference && field.reference.length > 0)
        exprs.push(
            `...validateReference(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.reference.map((ref) => resolveRef(ref).name))})`,
        );

    if (field.slicing?.slices) {
        for (const [sliceName, slice] of Object.entries(field.slicing.slices)) {
            if (slice.min === undefined && slice.max === undefined) continue;
            const match = slice.match ?? {};
            if (Object.keys(match).length === 0) continue;
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;
            exprs.push(
                `...validateSliceCardinality(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
            );
        }
    }
};

const generateValidateMethod = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const fields = flatProfile.fields ?? {};
    const profileName = flatProfile.identifier.name;
    w.curlyBlock(["validate(): string[]"], () => {
        w.line(`const profileName = "${profileName}"`);
        w.line("const res = this.resource as unknown as Record<string, unknown>");

        const exprs: string[] = [];
        for (const [name, field] of Object.entries(fields)) {
            if (isChoiceInstanceField(field)) continue;

            if (isChoiceDeclarationField(field)) {
                if (field.required)
                    exprs.push(`...validateChoiceRequired(res, profileName, ${JSON.stringify(field.choices)})`);
                continue;
            }

            collectRegularFieldValidation(exprs, name, field, tsIndex.findLastSpecializationByIdentifier);
        }

        if (exprs.length === 0) {
            w.line("return []");
        } else {
            w.squareBlock(["return"], () => {
                for (const expr of exprs) w.line(`${expr},`);
            });
        }
    });
    w.line();
};

const generateExtensionSetterMethods = (
    w: TypeScript,
    extensions: ProfileExtension[],
    extensionMethodNames: Map<ProfileExtension, string>,
    tsProfileName: string,
) => {
    for (const ext of extensions) {
        if (!ext.url) continue;
        const methodName = extensionMethodNames.get(ext) ?? tsQualifiedExtensionMethodName(ext.name, ext.path);
        const valueTypes = ext.valueTypes ?? [];
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

        if (ext.isComplex && ext.subExtensions) {
            const inputTypeName = tsExtensionInputTypeName(tsProfileName, ext.name);
            w.curlyBlock(["public", methodName, `(input: ${inputTypeName}): this`], () => {
                w.line("const subExtensions: Extension[] = []");
                for (const sub of ext.subExtensions ?? []) {
                    const valueField = sub.valueType ? `value${uppercaseFirstLetter(sub.valueType.name)}` : "value";
                    // When value type is unknown, cast to Extension to avoid TS error
                    const needsCast = !sub.valueType;
                    const pushSuffix = needsCast ? " as Extension" : "";
                    if (sub.max === "*") {
                        w.curlyBlock(["if", `(input.${sub.name})`], () => {
                            w.curlyBlock(["for", `(const item of input.${sub.name})`], () => {
                                w.line(`subExtensions.push({ url: "${sub.url}", ${valueField}: item }${pushSuffix})`);
                            });
                        });
                    } else {
                        w.curlyBlock(["if", `(input.${sub.name} !== undefined)`], () => {
                            w.line(
                                `subExtensions.push({ url: "${sub.url}", ${valueField}: input.${sub.name} }${pushSuffix})`,
                            );
                        });
                    }
                }
                if (targetPath.length === 0) {
                    w.line("const list = (this.resource.extension ??= [])");
                    w.line(`list.push({ url: "${ext.url}", extension: subExtensions })`);
                } else {
                    w.line(
                        `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                    );
                    w.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                    w.line(`(target.extension as Extension[]).push({ url: "${ext.url}", extension: subExtensions })`);
                }
                w.line("return this");
            });
        } else if (valueTypes.length === 1 && valueTypes[0]) {
            const firstValueType = valueTypes[0];
            const valueType = tsTypeFromIdentifier(firstValueType);
            const valueField = `value${uppercaseFirstLetter(firstValueType.name)}`;
            w.curlyBlock(["public", methodName, `(value: ${valueType}): this`], () => {
                // Cast needed: value field may not exist on Extension in this FHIR version
                const extLiteral = `{ url: "${ext.url}", ${valueField}: value } as Extension`;
                if (targetPath.length === 0) {
                    w.line("const list = (this.resource.extension ??= [])");
                    w.line(`list.push(${extLiteral})`);
                } else {
                    w.line(
                        `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
                            targetPath,
                        )})`,
                    );
                    w.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                    w.line(`(target.extension as Extension[]).push(${extLiteral})`);
                }
                w.line("return this");
            });
        } else {
            w.curlyBlock(["public", methodName, `(value: Omit<Extension, "url">): this`], () => {
                if (targetPath.length === 0) {
                    w.line("const list = (this.resource.extension ??= [])");
                    w.line(`list.push({ url: "${ext.url}", ...value })`);
                } else {
                    w.line(
                        `const target = ensurePath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
                            targetPath,
                        )})`,
                    );
                    w.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                    w.line(`(target.extension as Extension[]).push({ url: "${ext.url}", ...value })`);
                }
                w.line("return this");
            });
        }
        w.line();
    }
};

const detectFieldOverrides = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
): Map<string, { profileType: string; required: boolean; array: boolean }> => {
    const overrides = new Map<string, { profileType: string; required: boolean; array: boolean }>();
    const specialization = tsIndex.findLastSpecialization(flatProfile);
    if (!isSpecializationTypeSchema(specialization)) return overrides;

    for (const [fieldName, pField] of Object.entries(flatProfile.fields ?? {})) {
        if (!isNotChoiceDeclarationField(pField)) continue;
        const sField = specialization.fields?.[fieldName];
        if (!sField || isChoiceDeclarationField(sField)) continue;

        // Check for Reference narrowing
        if (pField.reference && sField.reference && pField.reference.length < sField.reference.length) {
            const references = pField.reference
                .map((ref) => {
                    const resRef = tsIndex.findLastSpecializationByIdentifier(ref);
                    if (resRef.name !== ref.name) {
                        return `"${resRef.name}"`;
                    }
                    return `"${ref.name}"`;
                })
                .join(" | ");
            overrides.set(fieldName, {
                profileType: `Reference<${references}>`,
                required: pField.required ?? false,
                array: pField.array ?? false,
            });
        }
        // Check for cardinality change (optional -> required)
        else if (pField.required && !sField.required) {
            const tsType = tsTypeForProfileField(w, tsIndex, flatProfile, fieldName, pField);
            overrides.set(fieldName, {
                profileType: tsType,
                required: true,
                array: pField.array ?? false,
            });
        }
    }
    return overrides;
};

export const generateProfileOverrideInterface = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
) => {
    const overrides = detectFieldOverrides(w, tsIndex, flatProfile);
    if (overrides.size === 0) return;

    const tsProfileName = tsResourceName(flatProfile.identifier);
    const tsBaseResourceName = tsResourceName(flatProfile.base);

    w.curlyBlock(["export", "interface", tsProfileName, "extends", tsBaseResourceName], () => {
        for (const [fieldName, override] of overrides) {
            const tsField = tsFieldName(fieldName);
            const optionalSymbol = override.required ? "" : "?";
            const arraySymbol = override.array ? "[]" : "";
            w.lineSM(`${tsField}${optionalSymbol}: ${override.profileType}${arraySymbol}`);
        }
    });
    w.line();
};
