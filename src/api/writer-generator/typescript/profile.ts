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
} from "./name";
import { resolveFieldTsType, resolvePrimitiveType, tsEnumType, tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    /** Array fields with required slices — optional param with auto-merge of required stubs */
    sliceAutoFields: { name: string; tsType: string; typeId: Identifier; defaultValue: string; matches: string[] }[];
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

const collectRequiredSliceMatches = (field: RegularField): Record<string, unknown>[] | undefined => {
    if (!field.array || !field.slicing?.slices) return undefined;
    const matches = Object.values(field.slicing.slices)
        .filter((s) => s.min !== undefined && s.min >= 1 && s.match && Object.keys(s.match).length > 0)
        .map((s) => s.match as Record<string, unknown>);
    return matches.length > 0 ? matches : undefined;
};

const collectProfileFactoryInfo = (flatProfile: ProfileTypeSchema): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fields = flatProfile.fields ?? {};
    const promotedChoices = new Set<string>();

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
                const tsType = resolveFieldTsType("", "", field) + (field.array ? "[]" : "");
                autoAccessors.push({ name, tsType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const requiredMatches = collectRequiredSliceMatches(field);
            if (requiredMatches) {
                const defaultValue = `[${requiredMatches.map((m) => JSON.stringify(m)).join(",")}]`;
                if (field.type) {
                    const tsType = resolveFieldTsType("", "", field) + (field.array ? "[]" : "");
                    sliceAutoFields.push({
                        name,
                        tsType,
                        typeId: field.type,
                        defaultValue,
                        matches: requiredMatches.map((m) => JSON.stringify(m)),
                    });
                    autoAccessors.push({ name, tsType, typeId: field.type });
                }
                continue;
            }
        }

        if (field.required) {
            const tsType = resolveFieldTsType("", "", field) + (field.array ? "[]" : "");
            params.push({ name, tsType, typeId: field.type });
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

export const generateProfileHelpersModule = (w: TypeScript) => {
    w.cat("profile-helpers.ts", () => {
        w.generateDisclaimer();
        w.curlyBlock(
            ["export const", "isRecord", "=", "(value: unknown): value is Record<string, unknown>", "=>"],
            () => {
                w.lineSM('return value !== null && typeof value === "object" && !Array.isArray(value)');
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "getOrCreateObjectAtPath",
                "=",
                "(root: Record<string, unknown>, path: string[]): Record<string, unknown>",
                "=>",
            ],
            () => {
                w.lineSM("let current: Record<string, unknown> = root");
                w.curlyBlock(["for (const", "segment", "of", "path)"], () => {
                    w.curlyBlock(["if", "(Array.isArray(current[segment]))"], () => {
                        w.lineSM("const list = current[segment] as unknown[]");
                        w.curlyBlock(["if", "(list.length === 0)"], () => {
                            w.lineSM("list.push({})");
                        });
                        w.lineSM("current = list[0] as Record<string, unknown>");
                    });
                    w.curlyBlock(["else"], () => {
                        w.curlyBlock(["if", "(!isRecord(current[segment]))"], () => {
                            w.lineSM("current[segment] = {}");
                        });
                        w.lineSM("current = current[segment] as Record<string, unknown>");
                    });
                });
                w.lineSM("return current");
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "mergeMatch",
                "=",
                "(target: Record<string, unknown>, match: Record<string, unknown>): void",
                "=>",
            ],
            () => {
                w.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                    w.curlyBlock(
                        ["if", '(key === "__proto__" || key === "constructor" || key === "prototype")'],
                        () => {
                            w.lineSM("continue");
                        },
                    );
                    w.curlyBlock(["if", "(isRecord(matchValue))"], () => {
                        w.curlyBlock(["if", "(isRecord(target[key]))"], () => {
                            w.lineSM("mergeMatch(target[key] as Record<string, unknown>, matchValue)");
                        });
                        w.curlyBlock(["else"], () => {
                            w.lineSM("target[key] = { ...matchValue }");
                        });
                    });
                    w.curlyBlock(["else"], () => {
                        w.lineSM("target[key] = matchValue");
                    });
                });
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "applySliceMatch",
                "=",
                "<T extends Record<string, unknown>>(input: T, match: Record<string, unknown>): T",
                "=>",
            ],
            () => {
                w.lineSM("const result = { ...input } as Record<string, unknown>");
                w.lineSM("mergeMatch(result, match)");
                w.lineSM("return result as T");
            },
        );
        w.line();
        w.curlyBlock(["export const", "matchesValue", "=", "(value: unknown, match: unknown): boolean", "=>"], () => {
            w.curlyBlock(["if", "(Array.isArray(match))"], () => {
                w.curlyBlock(["if", "(!Array.isArray(value))"], () => w.lineSM("return false"));
                w.lineSM("return match.every((matchItem) => value.some((item) => matchesValue(item, matchItem)))");
            });
            w.curlyBlock(["if", "(isRecord(match))"], () => {
                w.curlyBlock(["if", "(!isRecord(value))"], () => w.lineSM("return false"));
                w.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                    w.curlyBlock(["if", "(!matchesValue((value as Record<string, unknown>)[key], matchValue))"], () => {
                        w.lineSM("return false");
                    });
                });
                w.lineSM("return true");
            });
            w.lineSM("return value === match");
        });
        w.line();
        w.curlyBlock(
            ["export const", "matchesSlice", "=", "(value: unknown, match: Record<string, unknown>): boolean", "=>"],
            () => {
                w.lineSM("return matchesValue(value, match)");
            },
        );
        w.line();
        // extractComplexExtension - extract sub-extension values from complex extension
        w.curlyBlock(
            [
                "export const",
                "extractComplexExtension",
                "=",
                "(extension: { extension?: Array<{ url?: string; [key: string]: unknown }> } | undefined, config: Array<{ name: string; valueField: string; isArray: boolean }>): Record<string, unknown> | undefined",
                "=>",
            ],
            () => {
                w.lineSM("if (!extension?.extension) return undefined");
                w.lineSM("const result: Record<string, unknown> = {}");
                w.curlyBlock(["for (const", "{ name, valueField, isArray }", "of", "config)"], () => {
                    w.lineSM("const subExts = extension.extension.filter(e => e.url === name)");
                    w.curlyBlock(["if", "(isArray)"], () => {
                        w.lineSM("result[name] = subExts.map(e => (e as Record<string, unknown>)[valueField])");
                    });
                    w.curlyBlock(["else if", "(subExts[0])"], () => {
                        w.lineSM("result[name] = (subExts[0] as Record<string, unknown>)[valueField]");
                    });
                });
                w.lineSM("return result");
            },
        );
        w.line();
        // extractSliceSimplified - remove match keys from slice (reverse of applySliceMatch)
        w.curlyBlock(
            [
                "export const",
                "extractSliceSimplified",
                "=",
                "<T extends Record<string, unknown>>(slice: T, matchKeys: string[]): Partial<T>",
                "=>",
            ],
            () => {
                w.lineSM("const result = { ...slice } as Record<string, unknown>");
                w.curlyBlock(["for (const", "key", "of", "matchKeys)"], () => {
                    w.lineSM("delete result[key]");
                });
                w.lineSM("return result as Partial<T>");
            },
        );
        w.line();
        // wrapSliceChoice - wrap flat input under the single choice variant key for setter
        w.curlyBlock(
            [
                "export const",
                "wrapSliceChoice",
                "=",
                "(input: Record<string, unknown>, choiceVariant: string): Record<string, unknown>",
                "=>",
            ],
            () => {
                w.lineSM("if (Object.keys(input).length === 0) return input");
                w.lineSM("return { [choiceVariant]: input }");
            },
        );
        w.line();
        // flattenSliceChoice - strip match keys and flatten choice variant into parent for getter
        w.curlyBlock(
            [
                "export const",
                "flattenSliceChoice",
                "=",
                "(slice: Record<string, unknown>, matchKeys: string[], choiceVariant: string): Record<string, unknown>",
                "=>",
            ],
            () => {
                w.lineSM("const result = { ...slice } as Record<string, unknown>");
                w.curlyBlock(["for (const", "key", "of", "matchKeys)"], () => {
                    w.lineSM("delete result[key]");
                });
                w.lineSM("const variantValue = result[choiceVariant]");
                w.lineSM("delete result[choiceVariant]");
                w.curlyBlock(["if", "(isRecord(variantValue))"], () => {
                    w.lineSM("Object.assign(result, variantValue)");
                });
                w.lineSM("return result");
            },
        );
        w.line();
        // --- Validation helpers ---
        w.curlyBlock(
            [
                "export const",
                "validateRequired",
                "=",
                "(r: Record<string, unknown>, field: string, path: string): string | undefined",
                "=>",
            ],
            () => {
                w.lineSM(
                    "return r[field] === undefined || r[field] === null ? `${path}: required field '${field}' is missing` : undefined",
                );
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "validateExcluded",
                "=",
                "(r: Record<string, unknown>, field: string, path: string): string | undefined",
                "=>",
            ],
            () => {
                w.lineSM("return r[field] !== undefined ? `${path}: field '${field}' must not be present` : undefined");
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "validateFixedValue",
                "=",
                "(r: Record<string, unknown>, field: string, expected: unknown, path: string): string | undefined",
                "=>",
            ],
            () => {
                w.lineSM(
                    "return matchesValue(r[field], expected) ? undefined : `${path}: field '${field}' does not match expected fixed value`",
                );
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "validateSliceCardinality",
                "=",
                "(items: unknown[] | undefined, match: Record<string, unknown>, sliceName: string, min: number, max: number, path: string): string[]",
                "=>",
            ],
            () => {
                w.lineSM("const count = (items ?? []).filter(item => matchesSlice(item, match)).length");
                w.lineSM("const errors: string[] = []");
                w.curlyBlock(["if", "(count < min)"], () => {
                    w.lineSM(
                        "errors.push(`${path}: slice '${sliceName}' requires at least ${min} item(s), found ${count}`)",
                    );
                });
                w.curlyBlock(["if", "(max > 0 && count > max)"], () => {
                    w.lineSM(
                        "errors.push(`${path}: slice '${sliceName}' allows at most ${max} item(s), found ${count}`)",
                    );
                });
                w.lineSM("return errors");
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "validateEnum",
                "=",
                "(value: unknown, allowed: string[], field: string, path: string): string | undefined",
                "=>",
            ],
            () => {
                w.lineSM("if (value === undefined || value === null) return undefined");
                w.curlyBlock(["if", "(typeof value === 'string')"], () => {
                    w.lineSM(
                        "return allowed.includes(value) ? undefined : `${path}: field '${field}' value '${value}' is not in allowed values`",
                    );
                });
                w.lineSM("const rec = value as Record<string, unknown>");
                w.comment("Coding");
                w.curlyBlock(["if", "(typeof rec.code === 'string' && rec.system !== undefined)"], () => {
                    w.lineSM(
                        "return allowed.includes(rec.code) ? undefined : `${path}: field '${field}' code '${rec.code}' is not in allowed values`",
                    );
                });
                w.comment("CodeableConcept");
                w.curlyBlock(["if", "(Array.isArray(rec.coding))"], () => {
                    w.lineSM(
                        "const codes = (rec.coding as Array<Record<string, unknown>>).map(c => c.code as string).filter(Boolean)",
                    );
                    w.lineSM("const hasValid = codes.some(c => allowed.includes(c))");
                    w.lineSM(
                        "return hasValid ? undefined : `${path}: field '${field}' has no coding with an allowed code`",
                    );
                });
                w.lineSM("return undefined");
            },
        );
        w.line();
        w.curlyBlock(
            [
                "export const",
                "validateReference",
                "=",
                "(value: unknown, allowed: string[], field: string, path: string): string | undefined",
                "=>",
            ],
            () => {
                w.lineSM("if (value === undefined || value === null) return undefined");
                w.lineSM("const ref = (value as Record<string, unknown>).reference as string | undefined");
                w.lineSM("if (!ref) return undefined");
                w.lineSM("const slashIdx = ref.indexOf('/')");
                w.lineSM("if (slashIdx === -1) return undefined");
                w.lineSM("const refType = ref.slice(0, slashIdx)");
                w.lineSM(
                    "return allowed.includes(refType) ? undefined : `${path}: field '${field}' references '${refType}' but only ${allowed.join(', ')} are allowed`",
                );
            },
        );
    });
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
    },
) => {
    const imports: string[] = [];
    if (options.needsSliceHelpers) {
        imports.push("applySliceMatch", "matchesSlice");
    }
    if (options.needsGetOrCreateObjectAtPath) {
        imports.push("getOrCreateObjectAtPath");
    }
    if (options.needsExtensionExtraction) {
        imports.push("extractComplexExtension");
    }
    if (options.needsSliceExtraction) {
        imports.push("extractSliceSimplified");
    }
    if (options.needsSliceChoiceHelpers) {
        imports.push("wrapSliceChoice", "flattenSliceChoice");
    }
    if (options.needsValidation) {
        imports.push(
            "validateRequired",
            "validateExcluded",
            "validateFixedValue",
            "validateSliceCardinality",
            "validateEnum",
            "validateReference",
        );
    }
    if (imports.length > 0) {
        w.lineSM(`import { ${imports.join(", ")} } from "../../profile-helpers"`);
    }
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

    const factoryInfo = collectProfileFactoryInfo(flatProfile);
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
    const factoryInfo = collectProfileFactoryInfo(flatProfile);

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

    if (
        needsSliceHelpers ||
        needsGetOrCreateObjectAtPath ||
        needsExtensionExtraction ||
        needsSliceExtraction ||
        needsSliceChoiceHelpers ||
        needsValidation
    ) {
        generateProfileHelpersImport(w, {
            needsGetOrCreateObjectAtPath,
            needsSliceHelpers,
            needsExtensionExtraction,
            needsSliceExtraction,
            needsSliceChoiceHelpers,
            needsValidation,
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
        w.line(`private resource: ${tsBaseResourceName}`);
        w.line();
        w.curlyBlock(["constructor", `(resource: ${tsBaseResourceName})`], () => {
            w.line("this.resource = resource");
            if (canonicalUrl && isResourceIdentifier(flatProfile.base)) {
                w.line(`const r = resource as unknown as Record<string, unknown>`);
                w.line(`const meta = (r.meta ??= {}) as Record<string, unknown>`);
                w.line(`const profiles = (meta.profile ??= []) as string[]`);
                w.line(
                    `if (!profiles.includes(${JSON.stringify(canonicalUrl)})) profiles.push(${JSON.stringify(canonicalUrl)})`,
                );
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
                const matchExprs = f.matches.map((m) => `${m} as Record<string, unknown>`);
                w.line(`const ${f.name}Defaults = ${f.defaultValue} as unknown[]`);
                w.line(`const ${f.name}WithDefaults = [...(args.${f.name} ?? [])] as unknown[]`);
                for (let i = 0; i < matchExprs.length; i++) {
                    w.line(
                        `if (!${f.name}WithDefaults.some(item => matchesSlice(item, ${matchExprs[i]}))) ${f.name}WithDefaults.push(${f.name}Defaults[${i}]!)`,
                    );
                }
            }
            w.curlyBlock([`const resource: ${tsBaseResourceName} =`], () => {
                for (const f of allFields) {
                    w.line(`${f.name}: ${f.value},`);
                }
                if (canonicalUrl && isResourceIdentifier(flatProfile.base)) {
                    w.line(`meta: { profile: [${JSON.stringify(canonicalUrl)}] },`);
                }
            }, [` as unknown as ${tsBaseResourceName}`]);
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
        // Getter and setter methods for required profile fields
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

        generateExtensionSetterMethods(w, extensions, extensionMethodNames, tsProfileName);

        for (const sliceDef of sliceDefs) {
            const methodName =
                sliceMethodNames.get(sliceDef) ?? tsQualifiedSliceMethodName(sliceDef.fieldName, sliceDef.sliceName);
            const typeName = tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
            const matchLiteral = JSON.stringify(sliceDef.match);
            const tsField = tsFieldName(sliceDef.fieldName);
            const fieldAccess = tsGet("this.resource", tsField);
            // Make input optional when there are no required fields (input can be empty object)
            const paramSignature = sliceDef.inputOptional
                ? `(input?: ${typeName}): this`
                : `(input: ${typeName}): this`;
            w.curlyBlock(["public", methodName, paramSignature], () => {
                w.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                // Use empty object as default when input is optional
                const inputExpr = sliceDef.inputOptional
                    ? "(input ?? {}) as Record<string, unknown>"
                    : "input as Record<string, unknown>";
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(
                        `const value = applySliceMatch(wrapSliceChoice(${inputExpr}, ${JSON.stringify(cc.variant)}), match) as unknown as ${sliceDef.baseType}`,
                    );
                } else {
                    w.line(`const value = applySliceMatch(${inputExpr}, match) as unknown as ${sliceDef.baseType}`);
                }
                if (sliceDef.array) {
                    w.line(`const list = (${fieldAccess} ??= [])`);
                    w.line("const index = list.findIndex((item) => matchesSlice(item, match))");
                    w.line("if (index === -1) {");
                    w.indentBlock(() => {
                        w.line("list.push(value)");
                    });
                    w.line("} else {");
                    w.indentBlock(() => {
                        w.line("list[index] = value");
                    });
                    w.line("}");
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
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
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
                            `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
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
            const matchLiteral = JSON.stringify(sliceDef.match);
            const matchKeys = JSON.stringify(Object.keys(sliceDef.match));
            const tsField = tsFieldName(sliceDef.fieldName);
            const fieldAccess = tsGet("this.resource", tsField);
            const baseType = sliceDef.baseType;

            // Helper to find the slice item
            const generateSliceLookup = () => {
                w.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                if (sliceDef.array) {
                    w.line(`const list = ${fieldAccess}`);
                    w.line("if (!list) return undefined");
                    w.line("const item = list.find((item) => matchesSlice(item, match))");
                } else {
                    w.line(`const item = ${fieldAccess}`);
                    w.line("if (!item || !matchesSlice(item, match)) return undefined");
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
                    w.line(
                        `return flattenSliceChoice(item as unknown as Record<string, unknown>, ${matchKeys}, ${JSON.stringify(cc.variant)}) as ${typeName}`,
                    );
                } else {
                    w.line(
                        `return extractSliceSimplified(item as unknown as Record<string, unknown>, ${matchKeys}) as ${typeName}`,
                    );
                }
            });
            w.line();

            // Raw getter (full FHIR type)
            w.curlyBlock(["public", getRawMethodName, `(): ${baseType} | undefined`], () => {
                generateSliceLookup();
                if (sliceDef.array) {
                    w.line("return item");
                } else {
                    w.line("return item");
                }
            });
            w.line();
        }

        generateValidateMethod(w, flatProfile);
    });
    w.line();
};

const emitRegularFieldValidation = (
    w: TypeScript,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    profileName: string,
) => {
    if (field.excluded) {
        w.line(`{ const e = validateExcluded(r, ${JSON.stringify(name)}, "${profileName}"); if (e) errors.push(e) }`);
        return;
    }

    if (field.required) {
        w.line(`{ const e = validateRequired(r, ${JSON.stringify(name)}, "${profileName}"); if (e) errors.push(e) }`);
    }

    if (field.valueConstraint) {
        const expected = JSON.stringify(field.valueConstraint.value);
        w.line(
            `{ const e = validateFixedValue(r, ${JSON.stringify(name)}, ${expected}, "${profileName}"); if (e) errors.push(e) }`,
        );
    }

    if (field.enum && !field.enum.isOpen) {
        const values = JSON.stringify(field.enum.values);
        w.line(
            `{ const e = validateEnum(r[${JSON.stringify(name)}], ${values}, ${JSON.stringify(name)}, "${profileName}"); if (e) errors.push(e) }`,
        );
    }

    if (field.reference && field.reference.length > 0) {
        const refNames = JSON.stringify(field.reference.map((ref) => ref.name));
        w.line(
            `{ const e = validateReference(r[${JSON.stringify(name)}], ${refNames}, ${JSON.stringify(name)}, "${profileName}"); if (e) errors.push(e) }`,
        );
    }

    if (field.slicing?.slices) {
        for (const [sliceName, slice] of Object.entries(field.slicing.slices)) {
            if (slice.min === undefined && slice.max === undefined) continue;
            const match = slice.match ?? {};
            if (Object.keys(match).length === 0) continue;
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;
            w.line(
                `errors.push(...validateSliceCardinality(r[${JSON.stringify(name)}] as unknown[] | undefined, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max}, "${profileName}.${name}"))`,
            );
        }
    }
};

const generateValidateMethod = (w: TypeScript, flatProfile: ProfileTypeSchema) => {
    const fields = flatProfile.fields ?? {};
    const profileName = flatProfile.identifier.name;
    w.curlyBlock(["validate", "()", ": string[]"], () => {
        w.line("const errors: string[] = []");
        w.line("const r = this.resource as unknown as Record<string, unknown>");
        for (const [name, field] of Object.entries(fields)) {
            if (isChoiceInstanceField(field)) continue;

            if (isChoiceDeclarationField(field)) {
                if (field.required) {
                    const choiceNames = field.choices;
                    const checks = choiceNames.map((c) => `r[${JSON.stringify(c)}] !== undefined`).join(" || ");
                    w.curlyBlock(["if", `(!(${checks}))`], () => {
                        w.line(`errors.push("${name}: at least one of ${choiceNames.join(", ")} is required")`);
                    });
                }
                continue;
            }

            emitRegularFieldValidation(w, name, field, profileName);
        }
        w.line("return errors");
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
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
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
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
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
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
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
