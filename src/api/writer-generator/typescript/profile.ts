import { pascalCase, typeSchemaInfo, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import {
    type CanonicalUrl,
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
    type TypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import {
    canonicalToName,
    safeCamelCase,
    tsExtensionInputTypeName,
    tsExtensionMethodFallback,
    tsExtensionMethodName,
    tsFhirPackageDir,
    tsFieldName,
    tsModulePath,
    tsProfileClassName,
    tsProfileModuleName,
    tsResourceName,
    tsSliceInputTypeName,
    tsSliceMethodFallback,
    tsSliceMethodName,
} from "./name";
import { resolveFieldTsType, resolvePrimitiveType, tsEnumType, tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    params: { name: string; tsType: string; typeId: Identifier }[];
};

const collectProfileFactoryInfo = (flatProfile: ProfileTypeSchema): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const fields = flatProfile.fields ?? {};

    if (isResourceIdentifier(flatProfile.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(flatProfile.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (isChoiceInstanceField(field)) continue;
        if (field.excluded) continue;

        // Required choice declaration with a single choice — promote that choice to a param
        if (isChoiceDeclarationField(field)) {
            if (field.required && field.choices.length === 1) {
                const choiceName = field.choices[0];
                if (choiceName) {
                    const choiceField = fields[choiceName];
                    if (choiceField && isChoiceInstanceField(choiceField)) {
                        const tsType = tsTypeFromIdentifier(choiceField.type) + (choiceField.array ? "[]" : "");
                        params.push({ name: choiceName, tsType, typeId: choiceField.type });
                    }
                }
            }
            continue;
        }

        if (field.valueConstraint) {
            const value = JSON.stringify(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            continue;
        }

        if (field.required) {
            const tsType = resolveFieldTsType("", "", field) + (field.array ? "[]" : "");
            params.push({ name, tsType, typeId: field.type });
        }
    }

    return { autoFields, params };
};

export const generateProfileIndexFile = (
    writer: TypeScript,
    tsIndex: TypeSchemaIndex,
    initialProfiles: ProfileTypeSchema[],
) => {
    if (initialProfiles.length === 0) return;
    writer.cd("profiles", () => {
        writer.cat("index.ts", () => {
            const profiles: [ProfileTypeSchema, string, string | undefined][] = initialProfiles.map((profile) => {
                const className = tsProfileClassName(profile);
                const resourceName = tsResourceName(profile.identifier);
                const overrides = detectFieldOverrides(writer, tsIndex, profile);
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
                writer.lineSM(exp);
            }
        });
    });
};

const tsTypeForProfileField = (
    _writer: TypeScript,
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

export const generateProfileHelpersModule = (writer: TypeScript) => {
    writer.cat("profile-helpers.ts", () => {
        writer.generateDisclaimer();
        writer.curlyBlock(
            ["export const", "isRecord", "=", "(value: unknown): value is Record<string, unknown>", "=>"],
            () => {
                writer.lineSM('return value !== null && typeof value === "object" && !Array.isArray(value)');
            },
        );
        writer.line();
        writer.curlyBlock(
            [
                "export const",
                "getOrCreateObjectAtPath",
                "=",
                "(root: Record<string, unknown>, path: string[]): Record<string, unknown>",
                "=>",
            ],
            () => {
                writer.lineSM("let current: Record<string, unknown> = root");
                writer.curlyBlock(["for (const", "segment", "of", "path)"], () => {
                    writer.curlyBlock(["if", "(Array.isArray(current[segment]))"], () => {
                        writer.lineSM("const list = current[segment] as unknown[]");
                        writer.curlyBlock(["if", "(list.length === 0)"], () => {
                            writer.lineSM("list.push({})");
                        });
                        writer.lineSM("current = list[0] as Record<string, unknown>");
                    });
                    writer.curlyBlock(["else"], () => {
                        writer.curlyBlock(["if", "(!isRecord(current[segment]))"], () => {
                            writer.lineSM("current[segment] = {}");
                        });
                        writer.lineSM("current = current[segment] as Record<string, unknown>");
                    });
                });
                writer.lineSM("return current");
            },
        );
        writer.line();
        writer.curlyBlock(
            [
                "export const",
                "mergeMatch",
                "=",
                "(target: Record<string, unknown>, match: Record<string, unknown>): void",
                "=>",
            ],
            () => {
                writer.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                    writer.curlyBlock(
                        ["if", '(key === "__proto__" || key === "constructor" || key === "prototype")'],
                        () => {
                            writer.lineSM("continue");
                        },
                    );
                    writer.curlyBlock(["if", "(isRecord(matchValue))"], () => {
                        writer.curlyBlock(["if", "(isRecord(target[key]))"], () => {
                            writer.lineSM("mergeMatch(target[key] as Record<string, unknown>, matchValue)");
                        });
                        writer.curlyBlock(["else"], () => {
                            writer.lineSM("target[key] = { ...matchValue }");
                        });
                    });
                    writer.curlyBlock(["else"], () => {
                        writer.lineSM("target[key] = matchValue");
                    });
                });
            },
        );
        writer.line();
        writer.curlyBlock(
            [
                "export const",
                "applySliceMatch",
                "=",
                "<T extends Record<string, unknown>>(input: T, match: Record<string, unknown>): T",
                "=>",
            ],
            () => {
                writer.lineSM("const result = { ...input } as Record<string, unknown>");
                writer.lineSM("mergeMatch(result, match)");
                writer.lineSM("return result as T");
            },
        );
        writer.line();
        writer.curlyBlock(
            ["export const", "matchesValue", "=", "(value: unknown, match: unknown): boolean", "=>"],
            () => {
                writer.curlyBlock(["if", "(Array.isArray(match))"], () => {
                    writer.curlyBlock(["if", "(!Array.isArray(value))"], () => writer.lineSM("return false"));
                    writer.lineSM(
                        "return match.every((matchItem) => value.some((item) => matchesValue(item, matchItem)))",
                    );
                });
                writer.curlyBlock(["if", "(isRecord(match))"], () => {
                    writer.curlyBlock(["if", "(!isRecord(value))"], () => writer.lineSM("return false"));
                    writer.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                        writer.curlyBlock(
                            ["if", "(!matchesValue((value as Record<string, unknown>)[key], matchValue))"],
                            () => {
                                writer.lineSM("return false");
                            },
                        );
                    });
                    writer.lineSM("return true");
                });
                writer.lineSM("return value === match");
            },
        );
        writer.line();
        writer.curlyBlock(
            ["export const", "matchesSlice", "=", "(value: unknown, match: Record<string, unknown>): boolean", "=>"],
            () => {
                writer.lineSM("return matchesValue(value, match)");
            },
        );
        writer.line();
        // extractComplexExtension - extract sub-extension values from complex extension
        writer.curlyBlock(
            [
                "export const",
                "extractComplexExtension",
                "=",
                "(extension: { extension?: Array<{ url?: string; [key: string]: unknown }> } | undefined, config: Array<{ name: string; valueField: string; isArray: boolean }>): Record<string, unknown> | undefined",
                "=>",
            ],
            () => {
                writer.lineSM("if (!extension?.extension) return undefined");
                writer.lineSM("const result: Record<string, unknown> = {}");
                writer.curlyBlock(["for (const", "{ name, valueField, isArray }", "of", "config)"], () => {
                    writer.lineSM("const subExts = extension.extension.filter(e => e.url === name)");
                    writer.curlyBlock(["if", "(isArray)"], () => {
                        writer.lineSM("result[name] = subExts.map(e => (e as Record<string, unknown>)[valueField])");
                    });
                    writer.curlyBlock(["else if", "(subExts[0])"], () => {
                        writer.lineSM("result[name] = (subExts[0] as Record<string, unknown>)[valueField]");
                    });
                });
                writer.lineSM("return result");
            },
        );
        writer.line();
        // extractSliceSimplified - remove match keys from slice (reverse of applySliceMatch)
        writer.curlyBlock(
            [
                "export const",
                "extractSliceSimplified",
                "=",
                "<T extends Record<string, unknown>>(slice: T, matchKeys: string[]): Partial<T>",
                "=>",
            ],
            () => {
                writer.lineSM("const result = { ...slice } as Record<string, unknown>");
                writer.curlyBlock(["for (const", "key", "of", "matchKeys)"], () => {
                    writer.lineSM("delete result[key]");
                });
                writer.lineSM("return result as Partial<T>");
            },
        );
    });
};

const generateProfileHelpersImport = (
    writer: TypeScript,
    options: {
        needsGetOrCreateObjectAtPath: boolean;
        needsSliceHelpers: boolean;
        needsExtensionExtraction: boolean;
        needsSliceExtraction: boolean;
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
    if (imports.length > 0) {
        writer.lineSM(`import { ${imports.join(", ")} } from "../../profile-helpers"`);
    }
};

const collectTypesFromSlices = (flatProfile: ProfileTypeSchema, addType: (typeId: Identifier) => void) => {
    for (const field of Object.values(flatProfile.fields ?? {})) {
        if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) continue;
        for (const slice of Object.values(field.slicing.slices)) {
            if (Object.keys(slice.match ?? {}).length > 0) {
                addType(field.type);
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

export const generateProfileImports = (
    writer: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
) => {
    const usedTypes = new Map<string, { importPath: string; tsName: string }>();

    const getModulePath = (typeId: Identifier): string => {
        if (isNestedIdentifier(typeId)) {
            const path = canonicalToName(typeId.url, true);
            if (path) return `../../${tsFhirPackageDir(typeId.package)}/${pascalCase(path)}`;
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
    collectTypesFromSlices(flatProfile, addType);
    const needsExtensionType = collectTypesFromExtensions(tsIndex, flatProfile, addType);
    collectTypesFromFieldOverrides(tsIndex, flatProfile, addType);

    const factoryInfo = collectProfileFactoryInfo(flatProfile);
    for (const param of factoryInfo.params) addType(param.typeId);

    if (needsExtensionType) {
        const extensionUrl = "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl;
        const extensionSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, extensionUrl);
        if (extensionSchema) addType(extensionSchema.identifier);
    }

    const sortedImports = Array.from(usedTypes.values()).sort((a, b) => a.tsName.localeCompare(b.tsName));
    for (const { importPath, tsName } of sortedImports) {
        writer.tsImportType(importPath, tsName);
    }
    if (sortedImports.length > 0) writer.line();
};

export const generateProfileClass = (
    writer: TypeScript,
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
                    };
                });
        });

    const extensions = flatProfile.extensions ?? [];
    const complexExtensions = extensions.filter((ext) => ext.isComplex && ext.subExtensions);

    for (const ext of complexExtensions) {
        const typeName = tsExtensionInputTypeName(tsProfileName, ext.name);
        writer.curlyBlock(["export", "type", typeName, "="], () => {
            for (const sub of ext.subExtensions ?? []) {
                const tsType = sub.valueType ? tsTypeFromIdentifier(sub.valueType) : "unknown";
                const isArray = sub.max === "*";
                const isRequired = sub.min !== undefined && sub.min > 0;
                writer.lineSM(`${sub.name}${isRequired ? "" : "?"}: ${tsType}${isArray ? "[]" : ""}`);
            }
        });
        writer.line();
    }

    if (sliceDefs.length > 0) {
        for (const sliceDef of sliceDefs) {
            const typeName = tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
            const matchFields = Object.keys(sliceDef.match);
            const allExcluded = [...new Set([...sliceDef.excluded, ...matchFields])];
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
            writer.lineSM(`export type ${typeName} = ${typeExpr}`);
        }
        writer.line();
    }

    // Determine which helpers are actually needed
    const needsSliceHelpers = sliceDefs.length > 0;
    const extensionsWithNestedPath = extensions.filter((ext) => {
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
        return targetPath.length > 0;
    });
    const needsGetOrCreateObjectAtPath = extensionsWithNestedPath.length > 0;
    const needsExtensionExtraction = complexExtensions.length > 0;
    const needsSliceExtraction = sliceDefs.length > 0;

    if (needsSliceHelpers || needsGetOrCreateObjectAtPath || needsExtensionExtraction || needsSliceExtraction) {
        generateProfileHelpersImport(writer, {
            needsGetOrCreateObjectAtPath,
            needsSliceHelpers,
            needsExtensionExtraction,
            needsSliceExtraction,
        });
        writer.line();
    }

    // Check if we have an override interface (narrowed types)
    const hasOverrideInterface = detectFieldOverrides(writer, tsIndex, flatProfile).size > 0;
    const factoryInfo = collectProfileFactoryInfo(flatProfile);

    const hasParams = factoryInfo.params.length > 0;
    const createArgsTypeName = `${profileClassName}Params`;
    const paramSignature = hasParams ? `args: ${createArgsTypeName}` : "";
    const allFields = [
        ...factoryInfo.autoFields.map((f) => ({ name: f.name, value: f.value })),
        ...factoryInfo.params.map((p) => ({ name: p.name, value: `args.${p.name}` })),
    ];

    if (hasParams) {
        writer.curlyBlock(["export", "type", createArgsTypeName, "="], () => {
            for (const p of factoryInfo.params) {
                writer.lineSM(`${p.name}: ${p.tsType}`);
            }
        });
        writer.line();
    }

    if (schema) {
        writer.comment("CanonicalURL:", schema.identifier.url, `(pkg: ${packageMetaToFhir(packageMeta(schema))})`);
    }
    writer.curlyBlock(["export", "class", profileClassName], () => {
        writer.line(`private resource: ${tsBaseResourceName}`);
        writer.line();
        writer.curlyBlock(["constructor", `(resource: ${tsBaseResourceName})`], () => {
            writer.line("this.resource = resource");
        });
        writer.line();
        writer.curlyBlock(["static", "from", `(resource: ${tsBaseResourceName})`, `: ${profileClassName}`], () => {
            writer.line(`return new ${profileClassName}(resource)`);
        });
        writer.line();
        writer.curlyBlock(["static", "createResource", `(${paramSignature})`, `: ${tsBaseResourceName}`], () => {
            writer.curlyBlock([`const resource: ${tsBaseResourceName} =`], () => {
                for (const f of allFields) {
                    writer.line(`${f.name}: ${f.value},`);
                }
            }, [` as unknown as ${tsBaseResourceName}`]);
            writer.line("return resource");
        });
        writer.line();
        writer.curlyBlock(["static", "create", `(${paramSignature})`, `: ${profileClassName}`], () => {
            writer.line(
                `return ${profileClassName}.from(${profileClassName}.createResource(${hasParams ? "args" : ""}))`,
            );
        });
        writer.line();
        // toResource() returns base type (e.g., Patient)
        writer.curlyBlock(["toResource", "()", `: ${tsBaseResourceName}`], () => {
            writer.line("return this.resource");
        });
        writer.line();
        // Getter and setter methods for required profile fields
        for (const p of factoryInfo.params) {
            const methodSuffix = uppercaseFirstLetter(p.name);
            writer.curlyBlock([`get${methodSuffix}`, "()", `: ${p.tsType} | undefined`], () => {
                writer.line(`return this.resource.${p.name} as ${p.tsType} | undefined`);
            });
            writer.line();
            writer.curlyBlock([`set${methodSuffix}`, `(value: ${p.tsType})`, ": this"], () => {
                writer.line(`(this.resource as any).${p.name} = value`);
                writer.line("return this");
            });
            writer.line();
        }
        // toProfile() returns casted profile type if override interface exists
        if (hasOverrideInterface) {
            writer.curlyBlock(["toProfile", "()", `: ${tsProfileName}`], () => {
                writer.line(`return this.resource as ${tsProfileName}`);
            });
            writer.line();
        }

        const extensionMethods = extensions
            .filter((ext) => ext.url)
            .map((ext) => ({
                ext,
                baseName: tsExtensionMethodName(ext.name),
                fallbackName: tsExtensionMethodFallback(ext.name, ext.path),
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
                const fallback = tsSliceMethodFallback(slice.fieldName, slice.sliceName);
                return [slice, needsFallback ? fallback : baseName];
            }),
        );

        generateExtensionSetterMethods(writer, extensions, extensionMethodNames, tsProfileName);

        for (const sliceDef of sliceDefs) {
            const methodName =
                sliceMethodNames.get(sliceDef) ?? tsSliceMethodFallback(sliceDef.fieldName, sliceDef.sliceName);
            const typeName = tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
            const matchLiteral = JSON.stringify(sliceDef.match);
            const tsField = tsFieldName(sliceDef.fieldName);
            const fieldAccess = tsGet("this.resource", tsField);
            // Make input optional when there are no required fields (input can be empty object)
            const paramSignature = sliceDef.inputOptional
                ? `(input?: ${typeName}): this`
                : `(input: ${typeName}): this`;
            writer.curlyBlock(["public", methodName, paramSignature], () => {
                writer.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                // Use empty object as default when input is optional
                const inputExpr = sliceDef.inputOptional
                    ? "(input ?? {}) as Record<string, unknown>"
                    : "input as Record<string, unknown>";
                writer.line(`const value = applySliceMatch(${inputExpr}, match) as unknown as ${sliceDef.baseType}`);
                if (sliceDef.array) {
                    writer.line(`const list = (${fieldAccess} ??= [])`);
                    writer.line("const index = list.findIndex((item) => matchesSlice(item, match))");
                    writer.line("if (index === -1) {");
                    writer.indentBlock(() => {
                        writer.line("list.push(value)");
                    });
                    writer.line("} else {");
                    writer.indentBlock(() => {
                        writer.line("list[index] = value");
                    });
                    writer.line("}");
                } else {
                    writer.line(`${fieldAccess} = value`);
                }
                writer.line("return this");
            });
            writer.line();
        }

        // Generate extension getters - two methods per extension:
        // 1. get{Name}() - returns flat API (simplified)
        // 2. get{Name}Extension() - returns raw FHIR Extension
        const generatedGetMethods = new Set<string>();

        for (const ext of extensions) {
            if (!ext.url) continue;
            const baseName = uppercaseFirstLetter(safeCamelCase(ext.name));
            const getMethodName = `get${baseName}`;
            const getExtensionMethodName = `get${baseName}Extension`;
            if (generatedGetMethods.has(getMethodName)) continue;
            generatedGetMethods.add(getMethodName);
            const valueTypes = ext.valueTypes ?? [];
            const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

            // Helper to generate the extension lookup code
            const generateExtLookup = () => {
                if (targetPath.length === 0) {
                    writer.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
                } else {
                    writer.line(
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                    );
                    writer.line(
                        `const ext = (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`,
                    );
                }
            };

            if (ext.isComplex && ext.subExtensions) {
                const inputTypeName = tsExtensionInputTypeName(tsProfileName, ext.name);
                // Flat API getter
                writer.curlyBlock(["public", getMethodName, `(): ${inputTypeName} | undefined`], () => {
                    generateExtLookup();
                    writer.line("if (!ext) return undefined");
                    // Build extraction config
                    const configItems = (ext.subExtensions ?? []).map((sub) => {
                        const valueField = sub.valueType ? `value${uppercaseFirstLetter(sub.valueType.name)}` : "value";
                        const isArray = sub.max === "*";
                        return `{ name: "${sub.url}", valueField: "${valueField}", isArray: ${isArray} }`;
                    });
                    writer.line(`const config = [${configItems.join(", ")}]`);
                    writer.line(
                        `return extractComplexExtension(ext as unknown as { extension?: Array<{ url?: string; [key: string]: unknown }> }, config) as ${inputTypeName}`,
                    );
                });
                writer.line();
                // Raw Extension getter
                writer.curlyBlock(["public", getExtensionMethodName, "(): Extension | undefined"], () => {
                    generateExtLookup();
                    writer.line("return ext");
                });
            } else if (valueTypes.length === 1 && valueTypes[0]) {
                const firstValueType = valueTypes[0];
                const valueType = tsTypeFromIdentifier(firstValueType);
                const valueField = `value${uppercaseFirstLetter(firstValueType.name)}`;
                // Flat API getter (cast needed: value field may not exist on Extension in this FHIR version)
                writer.curlyBlock(["public", getMethodName, `(): ${valueType} | undefined`], () => {
                    generateExtLookup();
                    writer.line(
                        `return (ext as Record<string, unknown> | undefined)?.${valueField} as ${valueType} | undefined`,
                    );
                });
                writer.line();
                // Raw Extension getter
                writer.curlyBlock(["public", getExtensionMethodName, "(): Extension | undefined"], () => {
                    generateExtLookup();
                    writer.line("return ext");
                });
            } else {
                // Generic extension - only raw getter makes sense
                writer.curlyBlock(["public", getMethodName, "(): Extension | undefined"], () => {
                    if (targetPath.length === 0) {
                        writer.line(`return this.resource.extension?.find(e => e.url === "${ext.url}")`);
                    } else {
                        writer.line(
                            `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                        );
                        writer.line(
                            `return (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`,
                        );
                    }
                });
            }
            writer.line();
        }

        // Generate slice getters - two methods per slice:
        // 1. get{SliceName}() - returns simplified (without discriminator fields)
        // 2. get{SliceName}Raw() - returns full FHIR type with all fields
        for (const sliceDef of sliceDefs) {
            const baseName = uppercaseFirstLetter(safeCamelCase(sliceDef.sliceName));
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
                writer.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                if (sliceDef.array) {
                    writer.line(`const list = ${fieldAccess}`);
                    writer.line("if (!list) return undefined");
                    writer.line("const item = list.find((item) => matchesSlice(item, match))");
                } else {
                    writer.line(`const item = ${fieldAccess}`);
                    writer.line("if (!item || !matchesSlice(item, match)) return undefined");
                }
            };

            // Flat API getter (simplified)
            writer.curlyBlock(["public", getMethodName, `(): ${typeName} | undefined`], () => {
                generateSliceLookup();
                if (sliceDef.array) {
                    writer.line("if (!item) return undefined");
                }
                writer.line(
                    `return extractSliceSimplified(item as unknown as Record<string, unknown>, ${matchKeys}) as ${typeName}`,
                );
            });
            writer.line();

            // Raw getter (full FHIR type)
            writer.curlyBlock(["public", getRawMethodName, `(): ${baseType} | undefined`], () => {
                generateSliceLookup();
                if (sliceDef.array) {
                    writer.line("return item");
                } else {
                    writer.line("return item");
                }
            });
            writer.line();
        }
    });
    writer.line();
};

const generateExtensionSetterMethods = (
    writer: TypeScript,
    extensions: ProfileExtension[],
    extensionMethodNames: Map<ProfileExtension, string>,
    tsProfileName: string,
) => {
    for (const ext of extensions) {
        if (!ext.url) continue;
        const methodName = extensionMethodNames.get(ext) ?? tsExtensionMethodFallback(ext.name, ext.path);
        const valueTypes = ext.valueTypes ?? [];
        const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

        if (ext.isComplex && ext.subExtensions) {
            const inputTypeName = tsExtensionInputTypeName(tsProfileName, ext.name);
            writer.curlyBlock(["public", methodName, `(input: ${inputTypeName}): this`], () => {
                writer.line("const subExtensions: Extension[] = []");
                for (const sub of ext.subExtensions ?? []) {
                    const valueField = sub.valueType ? `value${uppercaseFirstLetter(sub.valueType.name)}` : "value";
                    // When value type is unknown, cast to Extension to avoid TS error
                    const needsCast = !sub.valueType;
                    const pushSuffix = needsCast ? " as Extension" : "";
                    if (sub.max === "*") {
                        writer.curlyBlock(["if", `(input.${sub.name})`], () => {
                            writer.curlyBlock(["for", `(const item of input.${sub.name})`], () => {
                                writer.line(
                                    `subExtensions.push({ url: "${sub.url}", ${valueField}: item }${pushSuffix})`,
                                );
                            });
                        });
                    } else {
                        writer.curlyBlock(["if", `(input.${sub.name} !== undefined)`], () => {
                            writer.line(
                                `subExtensions.push({ url: "${sub.url}", ${valueField}: input.${sub.name} }${pushSuffix})`,
                            );
                        });
                    }
                }
                if (targetPath.length === 0) {
                    writer.line("const list = (this.resource.extension ??= [])");
                    writer.line(`list.push({ url: "${ext.url}", extension: subExtensions })`);
                } else {
                    writer.line(
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                    );
                    writer.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                    writer.line(
                        `(target.extension as Extension[]).push({ url: "${ext.url}", extension: subExtensions })`,
                    );
                }
                writer.line("return this");
            });
        } else if (valueTypes.length === 1 && valueTypes[0]) {
            const firstValueType = valueTypes[0];
            const valueType = tsTypeFromIdentifier(firstValueType);
            const valueField = `value${uppercaseFirstLetter(firstValueType.name)}`;
            writer.curlyBlock(["public", methodName, `(value: ${valueType}): this`], () => {
                // Cast needed: value field may not exist on Extension in this FHIR version
                const extLiteral = `{ url: "${ext.url}", ${valueField}: value } as Extension`;
                if (targetPath.length === 0) {
                    writer.line("const list = (this.resource.extension ??= [])");
                    writer.line(`list.push(${extLiteral})`);
                } else {
                    writer.line(
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
                            targetPath,
                        )})`,
                    );
                    writer.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                    writer.line(`(target.extension as Extension[]).push(${extLiteral})`);
                }
                writer.line("return this");
            });
        } else {
            writer.curlyBlock(["public", methodName, `(value: Omit<Extension, "url">): this`], () => {
                if (targetPath.length === 0) {
                    writer.line("const list = (this.resource.extension ??= [])");
                    writer.line(`list.push({ url: "${ext.url}", ...value })`);
                } else {
                    writer.line(
                        `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
                            targetPath,
                        )})`,
                    );
                    writer.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                    writer.line(`(target.extension as Extension[]).push({ url: "${ext.url}", ...value })`);
                }
                writer.line("return this");
            });
        }
        writer.line();
    }
};

const detectFieldOverrides = (
    writer: TypeScript,
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
            const tsType = tsTypeForProfileField(writer, tsIndex, flatProfile, fieldName, pField);
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
    writer: TypeScript,
    tsIndex: TypeSchemaIndex,
    flatProfile: ProfileTypeSchema,
) => {
    const overrides = detectFieldOverrides(writer, tsIndex, flatProfile);
    if (overrides.size === 0) return;

    const tsProfileName = tsResourceName(flatProfile.identifier);
    const tsBaseResourceName = tsResourceName(flatProfile.base);

    writer.curlyBlock(["export", "interface", tsProfileName, "extends", tsBaseResourceName], () => {
        for (const [fieldName, override] of overrides) {
            const tsField = tsFieldName(fieldName);
            const optionalSymbol = override.required ? "" : "?";
            const arraySymbol = override.array ? "[]" : "";
            writer.lineSM(`${tsField}${optionalSymbol}: ${override.profileType}${arraySymbol}`);
        }
    });
    writer.line();
};
