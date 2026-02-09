import {
    camelCase,
    kebabCase,
    pascalCase,
    typeSchemaInfo,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import {
    type CanonicalUrl,
    extractNameFromCanonical,
    type Identifier,
    isChoiceDeclarationField,
    isComplexTypeIdentifier,
    isLogicalTypeSchema,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isProfileIdentifier,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type Name,
    type ProfileTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type RegularTypeSchema,
    type TypeSchema,
} from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";

const primitiveType2tsType: Record<string, string> = {
    boolean: "boolean",
    instant: "string",
    time: "string",
    date: "string",
    dateTime: "string",

    decimal: "number",
    integer: "number",
    unsignedInt: "number",
    positiveInt: "number",
    integer64: "number",
    base64Binary: "string",

    uri: "string",
    url: "string",
    canonical: "string",
    oid: "string",
    uuid: "string",

    string: "string",
    code: "string",
    markdown: "string",
    id: "string",
    xhtml: "string",
};

const resolvePrimitiveType = (name: string) => {
    const tsType = primitiveType2tsType[name];
    if (tsType === undefined) throw new Error(`Unknown primitive type ${name}`);
    return tsType;
};

const tsFhirPackageDir = (name: string): string => {
    return kebabCase(name);
};

const tsModuleName = (id: Identifier): string => {
    // NOTE: Why not pascal case?
    // In hl7-fhir-uv-xver-r5-r4 we have:
    // - http://hl7.org/fhir/5.0/StructureDefinition/extension-Subscription.topic (subscription_topic)
    // - http://hl7.org/fhir/5.0/StructureDefinition/extension-SubscriptionTopic (SubscriptionTopic)
    // And they should not clash the names.
    return uppercaseFirstLetter(normalizeTsName(id.name));
};

const tsModuleFileName = (id: Identifier): string => {
    return `${tsModuleName(id)}.ts`;
};

const tsModulePath = (id: Identifier): string => {
    if (isProfileIdentifier(id)) {
        return `${tsFhirPackageDir(id.package)}/profiles/${tsModuleName(id)}`;
    }
    return `${tsFhirPackageDir(id.package)}/${tsModuleName(id)}`;
};

const canonicalToName = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    const localName = extractNameFromCanonical(canonical as CanonicalUrl, dropFragment);
    if (!localName) return undefined;
    return normalizeTsName(localName);
};

const tsResourceName = (id: Identifier): string => {
    if (id.kind === "nested") {
        const url = id.url;
        const path = canonicalToName(url, false);
        if (!path) return "";
        const [resourceName, fragment] = path.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return normalizeTsName([resourceName, name].join(""));
    }
    return normalizeTsName(id.name);
};

// biome-ignore format: too long
const tsKeywords = new Set([ "class", "function", "return", "if", "for", "while", "const", "let", "var", "import", "export", "interface" ]);

const tsFieldName = (n: string): string => {
    if (tsKeywords.has(n)) return `"${n}"`;
    if (n.includes(" ") || n.includes("-")) return `"${n}"`;
    return n;
};

const normalizeTsName = (n: string): string => {
    if (tsKeywords.has(n)) n = `${n}_`;
    return n.replace(/\[x\]/g, "_x_").replace(/[- :]/g, "_");
};

const tsGet = (object: string, tsFieldName: string) => {
    if (tsFieldName.startsWith('"')) return `${object}[${tsFieldName}]`;
    return `${object}.${tsFieldName}`;
};

const tsEnumType = (enumValues: string[]) => {
    return `(${enumValues.map((e) => `"${e}"`).join(" | ")})`;
};

const tsTypeFromIdentifier = (id: Identifier): string => {
    if (isNestedIdentifier(id)) return tsResourceName(id);
    if (isPrimitiveIdentifier(id)) return resolvePrimitiveType(id.name);
    // Fallback: check if id.name is a known primitive type even if kind isn't set
    const primitiveType = primitiveType2tsType[id.name];
    if (primitiveType !== undefined) return primitiveType;
    return id.name;
};

const tsProfileClassName = (id: Identifier): string => {
    return `${uppercaseFirstLetter(normalizeTsName(id.name))}Profile`;
};

const tsSliceInputTypeName = (profileName: string, fieldName: string, sliceName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(fieldName))}_${uppercaseFirstLetter(normalizeTsName(sliceName))}SliceInput`;
};

const tsExtensionInputTypeName = (profileName: string, extensionName: string): string => {
    return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}Input`;
};

const safeCamelCase = (name: string): string => {
    if (!name) return "";
    // Remove [x] suffix and normalize special characters before camelCase
    const normalized = name.replace(/\[x\]/g, "").replace(/:/g, "_");
    return camelCase(normalized);
};

const tsSliceMethodName = (sliceName: string): string => {
    const normalized = safeCamelCase(sliceName);
    return `set${uppercaseFirstLetter(normalized || "Slice")}`;
};

const tsExtensionMethodName = (name: string): string => {
    const normalized = safeCamelCase(name);
    return `set${uppercaseFirstLetter(normalized || "Extension")}`;
};

const tsExtensionMethodFallback = (name: string, path?: string): string => {
    const rawPath =
        path
            ?.split(".")
            .filter((p) => p && p !== "extension")
            .join("_") ?? "";
    const pathPart = rawPath ? uppercaseFirstLetter(safeCamelCase(rawPath)) : "";
    const normalized = safeCamelCase(name);
    return `setExtension${pathPart}${uppercaseFirstLetter(normalized || "Extension")}`;
};

const tsSliceMethodFallback = (fieldName: string, sliceName: string): string => {
    const fieldPart = uppercaseFirstLetter(safeCamelCase(fieldName) || "Field");
    const slicePart = uppercaseFirstLetter(safeCamelCase(sliceName) || "Slice");
    return `setSlice${fieldPart}${slicePart}`;
};

export type TypeScriptOptions = {
    /** openResourceTypeSet -- for resource families (Resource, DomainResource) use open set for resourceType field.
     *
     * - when openResourceTypeSet is false: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" }`
     * - when openResourceTypeSet is true: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" | string }`
     */
    openResourceTypeSet: boolean;
    primitiveTypeExtension: boolean;
} & WriterOptions;

export class TypeScript extends Writer<TypeScriptOptions> {
    tsImportType(tsPackageName: string, ...entities: string[]) {
        this.lineSM(`import type { ${entities.join(", ")} } from "${tsPackageName}"`);
    }

    private generateProfileIndexFile(tsIndex: TypeSchemaIndex, initialProfiles: ProfileTypeSchema[]) {
        if (initialProfiles.length === 0) return;
        this.cd("profiles", () => {
            this.cat("index.ts", () => {
                const profiles: [Identifier, string, string | undefined][] = initialProfiles.map((profile) => {
                    const className = tsProfileClassName(profile.identifier);
                    const resourceName = tsResourceName(profile.identifier);
                    const overrides = this.detectFieldOverrides(tsIndex, profile);
                    let typeExport;
                    if (overrides.size > 0) typeExport = resourceName;
                    return [profile.identifier, className, typeExport];
                });
                if (profiles.length === 0) return;
                const uniqueExports: Set<string> = new Set();
                for (const [identifier, className, typeName] of profiles) {
                    uniqueExports.add(`export { ${className} } from "./${tsModuleName(identifier as Identifier)}"`);
                    if (typeName)
                        uniqueExports.add(
                            `export type { ${typeName} } from "./${tsModuleName(identifier as Identifier)}"`,
                        );
                }
                for (const exp of [...uniqueExports].sort()) {
                    this.lineSM(exp);
                }
            });
        });
    }

    generateFhirPackageIndexFile(tsIndex: TypeSchemaIndex, schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            const profiles = schemas.filter(isProfileTypeSchema);
            if (profiles.length > 0) {
                this.lineSM(`export * from "./profiles"`);
            }

            let exports = schemas
                .flatMap((schema) => {
                    const resourceName = tsResourceName(schema.identifier);
                    let typeExports: any = [];
                    if (isProfileTypeSchema(schema)) {
                        const overrides = this.detectFieldOverrides(tsIndex, schema);
                        if (overrides.size > 0) typeExports = [resourceName];
                    } else {
                        typeExports = [
                              resourceName,
                              ...((isResourceTypeSchema(schema) && schema.nested) ||
                              (isLogicalTypeSchema(schema) && schema.nested)
                                  ? schema.nested.map((n) => tsResourceName(n.identifier))
                                  : []),
                          ];
                    }
                    const valueExports = isResourceTypeSchema(schema) ? [`is${resourceName}`] : [];

                    return [
                        {
                            identifier: schema.identifier,
                            isProfile: isProfileTypeSchema(schema),
                            tsPackageName: tsModuleName(schema.identifier),
                            resourceName,
                            typeExports,
                            valueExports,
                        },
                    ];
                })
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            // FIXME: actually, duplication may means internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.resourceName.toLowerCase(), exp])).values()).sort(
                (a, b) => a.resourceName.localeCompare(b.resourceName),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);
                if (exp.typeExports.length > 0) {
                    this.lineSM(
                        `export type { ${exp.typeExports.join(", ")} } from "./${exp.isProfile ? "profiles/" : ""}${exp.tsPackageName}"`,
                    );
                }
                if (exp.valueExports.length > 0) {
                    this.lineSM(`export { ${exp.valueExports.join(", ")} } from "./${exp.tsPackageName}"`);
                }
            }
        });
    }

    generateDependenciesImports(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema, importPrefix = "../") {
        if (schema.dependencies) {
            const imports = [];
            const skipped = [];
            for (const dep of schema.dependencies) {
                if (["complex-type", "resource", "logical"].includes(dep.kind)) {
                    imports.push({
                        tsPackage: `${importPrefix}${tsModulePath(dep)}`,
                        name: uppercaseFirstLetter(dep.name),
                        dep: dep,
                    });
                } else if (isNestedIdentifier(dep)) {
                    const ndep = { ...dep };
                    ndep.name = canonicalToName(dep.url) as Name;
                    imports.push({
                        tsPackage: `${importPrefix}${tsModulePath(ndep)}`,
                        name: tsResourceName(dep),
                        dep: dep,
                    });
                } else {
                    skipped.push(dep);
                }
            }
            imports.sort((a, b) => a.name.localeCompare(b.name));
            for (const dep of imports) {
                this.debugComment(dep.dep);
                this.tsImportType(dep.tsPackage, dep.name);
            }
            for (const dep of skipped) {
                this.debugComment("skip:", dep);
            }
            this.line();
            if (
                this.withPrimitiveTypeExtension(schema) &&
                schema.identifier.name !== "Element" &&
                schema.dependencies.find((e) => e.name === "Element") === undefined
            ) {
                const elementUrl = "http://hl7.org/fhir/StructureDefinition/Element" as CanonicalUrl;
                const element = tsIndex.resolveByUrl(schema.identifier.package, elementUrl);
                if (!element) throw new Error(`'${elementUrl}' not found for ${schema.identifier.package}.`);

                this.tsImportType(`${importPrefix}${tsModulePath(element.identifier)}`, "Element");
            }
        }
    }

    generateComplexTypeReexports(schema: RegularTypeSchema) {
        const complexTypeDeps = schema.dependencies?.filter(isComplexTypeIdentifier).map((dep) => ({
            tsPackage: `../${tsModulePath(dep)}`,
            name: uppercaseFirstLetter(dep.name),
        }));
        if (complexTypeDeps && complexTypeDeps.length > 0) {
            for (const dep of complexTypeDeps) {
                this.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
            }
            this.line();
        }
    }

    addFieldExtension(fieldName: string): void {
        const extFieldName = tsFieldName(`_${fieldName}`);
        this.lineSM(`${extFieldName}?: Element`);
    }

    generateType(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema) {
        let name: string;
        if (schema.identifier.name === "Reference") {
            name = "Reference<T extends string = string>";
        } else if (schema.identifier.kind === "nested") {
            name = tsResourceName(schema.identifier);
        } else {
            name = tsResourceName(schema.identifier);
        }

        let extendsClause: string | undefined;
        if (schema.base) extendsClause = `extends ${canonicalToName(schema.base.url)}`;

        this.debugComment(schema.identifier);
        if (!schema.fields && !extendsClause && !isResourceTypeSchema(schema)) {
            this.lineSM(`export type ${name} = object`);
            return;
        }
        this.curlyBlock(["export", "interface", name, extendsClause], () => {
            if (isResourceTypeSchema(schema)) {
                const possibleResourceTypes = [schema.identifier];
                possibleResourceTypes.push(...tsIndex.resourceChildren(schema.identifier));
                const openSetSuffix =
                    this.opts.openResourceTypeSet && possibleResourceTypes.length > 1 ? " | string" : "";
                this.lineSM(
                    `resourceType: ${possibleResourceTypes
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((e) => `"${e.name}"`)
                        .join(" | ")}${openSetSuffix}`,
                );
                this.line();
            }

            if (!schema.fields) return;
            const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [fieldName, field] of fields) {
                if (isChoiceDeclarationField(field)) continue;

                this.debugComment(fieldName, ":", field);

                const tsName = tsFieldName(fieldName);

                let tsType: string;
                if (field.enum) {
                    tsType = tsEnumType(field.enum);
                } else if (schema.identifier.name === "Reference" && tsName === "reference") {
                    // biome-ignore lint: that is exactly string what we want
                    tsType = "`${T}/${string}`";
                } else if (field.reference && field.reference.length > 0) {
                    const references = field.reference.map((ref) => `"${ref.name}"`).join(" | ");
                    tsType = `Reference<${references}>`;
                } else if (isPrimitiveIdentifier(field.type)) {
                    tsType = resolvePrimitiveType(field.type.name);
                } else if (isNestedIdentifier(field.type)) {
                    tsType = tsResourceName(field.type);
                } else {
                    tsType = field.type.name as string;
                }

                const optionalSymbol = field.required ? "" : "?";
                const arraySymbol = field.array ? "[]" : "";
                this.lineSM(`${tsName}${optionalSymbol}: ${tsType}${arraySymbol}`);

                if (this.withPrimitiveTypeExtension(schema)) {
                    if (isPrimitiveIdentifier(field.type)) {
                        this.addFieldExtension(fieldName);
                    }
                }
            }
        });
    }

    withPrimitiveTypeExtension(schema: TypeSchema): boolean {
        if (!this.opts.primitiveTypeExtension) return false;
        if (!isSpecializationTypeSchema(schema)) return false;
        for (const field of Object.values(schema.fields ?? {})) {
            if (isChoiceDeclarationField(field)) continue;
            if (isPrimitiveIdentifier(field.type)) return true;
        }
        return false;
    }

    generateResourceTypePredicate(schema: RegularTypeSchema) {
        if (!isResourceTypeSchema(schema)) return;
        const name = tsResourceName(schema.identifier);
        this.curlyBlock(["export", "const", `is${name}`, "=", `(resource: unknown): resource is ${name}`, "=>"], () => {
            this.lineSM(
                `return resource !== null && typeof resource === "object" && (resource as {resourceType: string}).resourceType === "${schema.identifier.name}"`,
            );
        });
    }

    generateNestedTypes(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema) {
        if (schema.nested) {
            for (const subtype of schema.nested) {
                this.generateType(tsIndex, subtype);
                this.line();
            }
        }
    }

    private tsTypeForProfileField(
        tsIndex: TypeSchemaIndex,
        flatProfile: ProfileTypeSchema,
        fieldName: string,
        field: NonNullable<ProfileTypeSchema["fields"]>[string],
    ): string {
        if (!isNotChoiceDeclarationField(field)) {
            throw new Error(`Choice declaration fields not supported for '${fieldName}'`);
        }
        if (field.enum) {
            return tsEnumType(field.enum);
        }
        if (field.reference && field.reference.length > 0) {
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
                return `Reference<"Resource" /* ${cleanRefs} */ >`;
            }
            return `Reference<${references}>`;
        }
        if (isNestedIdentifier(field.type)) {
            return tsResourceName(field.type);
        }
        if (isPrimitiveIdentifier(field.type)) {
            return resolvePrimitiveType(field.type.name);
        }
        if (field.type === undefined) {
            throw new Error(`Undefined type for '${fieldName}' field at ${typeSchemaInfo(flatProfile)}`);
        }
        return field.type.name;
    }

    generateProfileType(tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) {
        this.debugComment("flatProfile", flatProfile);
        const tsName = tsResourceName(flatProfile.identifier);
        this.debugComment("identifier", flatProfile.identifier);
        this.debugComment("base", flatProfile.base);
        this.curlyBlock(["export", "interface", tsName], () => {
            this.lineSM(`__profileUrl: "${flatProfile.identifier.url}"`);
            this.line();

            for (const [fieldName, field] of Object.entries(flatProfile.fields ?? {})) {
                if (isChoiceDeclarationField(field)) continue;
                this.debugComment(fieldName, field);

                const tsName = tsFieldName(fieldName);
                const tsType = this.tsTypeForProfileField(tsIndex, flatProfile, fieldName, field);
                this.lineSM(`${tsName}${!field.required ? "?" : ""}: ${tsType}${field.array ? "[]" : ""}`);
            }
        });

        this.line();
    }

    generateAttachProfile(flatProfile: ProfileTypeSchema) {
        const tsBaseResourceName = tsResourceName(flatProfile.base);
        const tsProfileName = tsResourceName(flatProfile.identifier);
        const profileFields = Object.entries(flatProfile.fields || {})
            .filter(([_fieldName, field]) => {
                return field && isNotChoiceDeclarationField(field) && field.type !== undefined;
            })
            .map(([fieldName]) => tsFieldName(fieldName));

        this.curlyBlock(
            [
                `export const attach_${tsProfileName}_to_${tsBaseResourceName} =`,
                `(resource: ${tsBaseResourceName}, profile: ${tsProfileName}): ${tsBaseResourceName}`,
                "=>",
            ],
            () => {
                this.curlyBlock(["return"], () => {
                    this.line("...resource,");
                    // FIXME: don't rewrite all profiles
                    this.curlyBlock(["meta:"], () => {
                        this.line(`profile: ['${flatProfile.identifier.url}']`);
                    }, [","]);
                    profileFields.forEach((fieldName) => {
                        this.line(`${fieldName}: ${tsGet("profile", fieldName)},`);
                    });
                });
            },
        );
        this.line();
    }

    generateExtractProfile(tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) {
        const tsBaseResourceName = tsResourceName(flatProfile.base);
        const tsProfileName = tsResourceName(flatProfile.identifier);

        const profileFields = Object.entries(flatProfile.fields || {})
            .filter(([_fieldName, field]) => {
                return isNotChoiceDeclarationField(field) && field.type !== undefined;
            })
            .map(([fieldName]) => fieldName);

        const specialization = tsIndex.findLastSpecialization(flatProfile);
        if (!isSpecializationTypeSchema(specialization))
            throw new Error(`Specialization not found for ${flatProfile.identifier.url}`);

        const shouldCast: Record<string, boolean> = {};
        this.curlyBlock(
            [
                `export const extract_${tsProfileName}_from_${tsBaseResourceName} =`,
                `(resource: ${tsBaseResourceName}): ${tsProfileName}`,
                "=>",
            ],
            () => {
                profileFields.forEach((fieldName) => {
                    const tsField = tsFieldName(fieldName);
                    const pField = flatProfile.fields?.[fieldName];
                    const rField = specialization.fields?.[fieldName];
                    if (!isNotChoiceDeclarationField(pField) || !isNotChoiceDeclarationField(rField)) return;

                    if (pField.required && !rField.required) {
                        this.curlyBlock([`if (${tsGet("resource", tsField)} === undefined)`], () =>
                            this.lineSM(
                                `throw new Error("'${tsField}' is required for ${flatProfile.identifier.url}")`,
                            ),
                        );
                    }

                    const pRefs = pField?.reference?.map((ref) => ref.name);
                    const rRefs = rField?.reference?.map((ref) => ref.name);
                    if (pRefs && rRefs && pRefs.length !== rRefs.length) {
                        const predName = `reference_is_valid_${tsField}`;
                        this.curlyBlock(["const", predName, "=", "(ref?: Reference)", "=>"], () => {
                            this.line("return !ref");
                            this.indentBlock(() => {
                                rRefs.forEach((ref) => {
                                    this.line(`|| ref.reference?.startsWith('${ref}/')`);
                                });
                                this.line(";");
                            });
                        });
                        let cond: string = !pField?.required ? `!${tsGet("resource", tsField)} || ` : "";
                        if (pField.array) {
                            cond += `${tsGet("resource", tsField)}.every( (ref) => ${predName}(ref) )`;
                        } else {
                            cond += `!${predName}(${tsGet("resource", tsField)})`;
                        }
                        this.curlyBlock(["if (", cond, ")"], () => {
                            this.lineSM(
                                `throw new Error("'${fieldName}' has different references in profile and specialization")`,
                            );
                        });
                        this.line();
                        shouldCast[fieldName] = true;
                    }
                });
                this.curlyBlock(["return"], () => {
                    this.line(`__profileUrl: '${flatProfile.identifier.url}',`);
                    profileFields.forEach((fieldName) => {
                        const tsField = tsFieldName(fieldName);
                        if (shouldCast[fieldName]) {
                            this.line(
                                `${tsField}:`,
                                `${tsGet("resource", tsField)} as ${tsProfileName}['${tsField}'],`,
                            );
                        } else {
                            this.line(`${tsField}:`, `${tsGet("resource", tsField)},`);
                        }
                    });
                });
            },
        );
    }

    generateProfileHelpersModule() {
        this.cat("profile-helpers.ts", () => {
            this.generateDisclaimer();
            this.curlyBlock(
                ["export const", "isRecord", "=", "(value: unknown): value is Record<string, unknown>", "=>"],
                () => {
                    this.lineSM('return value !== null && typeof value === "object" && !Array.isArray(value)');
                },
            );
            this.line();
            this.curlyBlock(
                [
                    "export const",
                    "getOrCreateObjectAtPath",
                    "=",
                    "(root: Record<string, unknown>, path: string[]): Record<string, unknown>",
                    "=>",
                ],
                () => {
                    this.lineSM("let current: Record<string, unknown> = root");
                    this.curlyBlock(["for (const", "segment", "of", "path)"], () => {
                        this.curlyBlock(["if", "(Array.isArray(current[segment]))"], () => {
                            this.lineSM("const list = current[segment] as unknown[]");
                            this.curlyBlock(["if", "(list.length === 0)"], () => {
                                this.lineSM("list.push({})");
                            });
                            this.lineSM("current = list[0] as Record<string, unknown>");
                        });
                        this.curlyBlock(["else"], () => {
                            this.curlyBlock(["if", "(!isRecord(current[segment]))"], () => {
                                this.lineSM("current[segment] = {}");
                            });
                            this.lineSM("current = current[segment] as Record<string, unknown>");
                        });
                    });
                    this.lineSM("return current");
                },
            );
            this.line();
            this.curlyBlock(
                [
                    "export const",
                    "mergeMatch",
                    "=",
                    "(target: Record<string, unknown>, match: Record<string, unknown>): void",
                    "=>",
                ],
                () => {
                    this.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                        this.curlyBlock(
                            ["if", '(key === "__proto__" || key === "constructor" || key === "prototype")'],
                            () => {
                                this.lineSM("continue");
                            },
                        );
                        this.curlyBlock(["if", "(isRecord(matchValue))"], () => {
                            this.curlyBlock(["if", "(isRecord(target[key]))"], () => {
                                this.lineSM("mergeMatch(target[key] as Record<string, unknown>, matchValue)");
                            });
                            this.curlyBlock(["else"], () => {
                                this.lineSM("target[key] = { ...matchValue }");
                            });
                        });
                        this.curlyBlock(["else"], () => {
                            this.lineSM("target[key] = matchValue");
                        });
                    });
                },
            );
            this.line();
            this.curlyBlock(
                [
                    "export const",
                    "applySliceMatch",
                    "=",
                    "<T extends Record<string, unknown>>(input: T, match: Record<string, unknown>): T",
                    "=>",
                ],
                () => {
                    this.lineSM("const result = { ...input } as Record<string, unknown>");
                    this.lineSM("mergeMatch(result, match)");
                    this.lineSM("return result as T");
                },
            );
            this.line();
            this.curlyBlock(
                ["export const", "matchesValue", "=", "(value: unknown, match: unknown): boolean", "=>"],
                () => {
                    this.curlyBlock(["if", "(Array.isArray(match))"], () => {
                        this.curlyBlock(["if", "(!Array.isArray(value))"], () => this.lineSM("return false"));
                        this.lineSM(
                            "return match.every((matchItem) => value.some((item) => matchesValue(item, matchItem)))",
                        );
                    });
                    this.curlyBlock(["if", "(isRecord(match))"], () => {
                        this.curlyBlock(["if", "(!isRecord(value))"], () => this.lineSM("return false"));
                        this.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                            this.curlyBlock(
                                ["if", "(!matchesValue((value as Record<string, unknown>)[key], matchValue))"],
                                () => {
                                    this.lineSM("return false");
                                },
                            );
                        });
                        this.lineSM("return true");
                    });
                    this.lineSM("return value === match");
                },
            );
            this.line();
            this.curlyBlock(
                [
                    "export const",
                    "matchesSlice",
                    "=",
                    "(value: unknown, match: Record<string, unknown>): boolean",
                    "=>",
                ],
                () => {
                    this.lineSM("return matchesValue(value, match)");
                },
            );
            this.line();
            // extractComplexExtension - extract sub-extension values from complex extension
            this.curlyBlock(
                [
                    "export const",
                    "extractComplexExtension",
                    "=",
                    "(extension: { extension?: Array<{ url?: string; [key: string]: unknown }> } | undefined, config: Array<{ name: string; valueField: string; isArray: boolean }>): Record<string, unknown> | undefined",
                    "=>",
                ],
                () => {
                    this.lineSM("if (!extension?.extension) return undefined");
                    this.lineSM("const result: Record<string, unknown> = {}");
                    this.curlyBlock(["for (const", "{ name, valueField, isArray }", "of", "config)"], () => {
                        this.lineSM("const subExts = extension.extension.filter(e => e.url === name)");
                        this.curlyBlock(["if", "(isArray)"], () => {
                            this.lineSM("result[name] = subExts.map(e => (e as Record<string, unknown>)[valueField])");
                        });
                        this.curlyBlock(["else if", "(subExts[0])"], () => {
                            this.lineSM("result[name] = (subExts[0] as Record<string, unknown>)[valueField]");
                        });
                    });
                    this.lineSM("return result");
                },
            );
            this.line();
            // extractSliceSimplified - remove match keys from slice (reverse of applySliceMatch)
            this.curlyBlock(
                [
                    "export const",
                    "extractSliceSimplified",
                    "=",
                    "<T extends Record<string, unknown>>(slice: T, matchKeys: string[]): Partial<T>",
                    "=>",
                ],
                () => {
                    this.lineSM("const result = { ...slice } as Record<string, unknown>");
                    this.curlyBlock(["for (const", "key", "of", "matchKeys)"], () => {
                        this.lineSM("delete result[key]");
                    });
                    this.lineSM("return result as Partial<T>");
                },
            );
        });
    }

    private generateProfileHelpersImport(options: {
        needsGetOrCreateObjectAtPath: boolean;
        needsSliceHelpers: boolean;
        needsExtensionExtraction: boolean;
        needsSliceExtraction: boolean;
    }) {
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
            this.lineSM(`import { ${imports.join(", ")} } from "../../profile-helpers"`);
        }
    }

    private generateProfileImports(tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) {
        const usedTypes = new Map<string, { importPath: string; tsName: string }>();

        // Helper to get the module path for a type, handling nested types
        const getModulePath = (typeId: Identifier): string => {
            if (isNestedIdentifier(typeId)) {
                // For nested types, extract the parent resource name from the URL
                const url = typeId.url;
                const path = canonicalToName(url, true); // true to drop fragment
                if (path) {
                    return `../../${tsFhirPackageDir(typeId.package)}/${pascalCase(path)}`;
                }
            }
            return `../../${tsModulePath(typeId)}`;
        };

        // Helper to add a type if not primitive and not already added
        const addType = (typeId: Identifier) => {
            // Skip primitive types - they use TypeScript native types
            if (typeId.kind === "primitive-type") return;

            const tsName = tsResourceName(typeId);
            if (!usedTypes.has(tsName)) {
                usedTypes.set(tsName, {
                    importPath: getModulePath(typeId),
                    tsName,
                });
            }
        };

        // Always import the base resource type
        addType(flatProfile.base);

        // Collect types from slice definitions
        const fields = flatProfile.fields ?? {};
        for (const [_fieldName, field] of Object.entries(fields)) {
            if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices || !field.type) continue;

            for (const [_sliceName, slice] of Object.entries(field.slicing.slices)) {
                const match = slice.match ?? {};
                if (Object.keys(match).length === 0) continue;

                // Add the type for slices (handles both regular and nested types)
                addType(field.type);
            }
        }

        // Collect types from extensions
        const extensions = flatProfile.extensions ?? [];
        let needsExtensionType = false;

        for (const ext of extensions) {
            if (ext.isComplex && ext.subExtensions) {
                // Complex extensions need Extension type and sub-extension value types
                needsExtensionType = true;
                for (const sub of ext.subExtensions) {
                    if (sub.valueType) {
                        // Resolve the type properly from the FHIR schema index
                        const resolvedType = tsIndex.resolveByUrl(
                            flatProfile.identifier.package,
                            sub.valueType.url as CanonicalUrl,
                        );
                        if (resolvedType) {
                            addType(resolvedType.identifier);
                        } else {
                            addType(sub.valueType);
                        }
                    }
                }
            } else if (ext.valueTypes && ext.valueTypes.length === 1) {
                // Simple extensions with single value type
                // Also need Extension type for getter overloads
                needsExtensionType = true;
                const valueType = ext.valueTypes[0];
                if (valueType) {
                    addType(valueType);
                }
            } else {
                // Generic extensions need Extension type
                needsExtensionType = true;
            }
        }

        // Add Extension type if needed
        if (needsExtensionType) {
            const extensionUrl = "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl;
            const extensionSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, extensionUrl);
            if (extensionSchema) {
                addType(extensionSchema.identifier);
            }
        }

        // Add Reference type if used in override interface
        const referenceUrl = "http://hl7.org/fhir/StructureDefinition/Reference" as CanonicalUrl;
        const referenceSchema = tsIndex.resolveByUrl(flatProfile.identifier.package, referenceUrl);

        // Collect types from fields that will be in the override interface
        const specialization = tsIndex.findLastSpecialization(flatProfile);
        if (isSpecializationTypeSchema(specialization)) {
            for (const [fieldName, pField] of Object.entries(flatProfile.fields ?? {})) {
                if (!isNotChoiceDeclarationField(pField)) continue;
                const sField = specialization.fields?.[fieldName];
                if (!sField || isChoiceDeclarationField(sField)) continue;

                // Check for Reference narrowing - needs Reference type
                if (pField.reference && sField.reference && pField.reference.length < sField.reference.length) {
                    if (referenceSchema) {
                        addType(referenceSchema.identifier);
                    }
                }
                // Check for cardinality change - needs field's type
                else if (pField.required && !sField.required) {
                    if (pField.type) {
                        addType(pField.type);
                    }
                }
            }
        }

        // Generate imports sorted by name
        const sortedImports = Array.from(usedTypes.values()).sort((a, b) => a.tsName.localeCompare(b.tsName));

        for (const { importPath, tsName } of sortedImports) {
            this.tsImportType(importPath, tsName);
        }

        if (sortedImports.length > 0) {
            this.line();
        }
    }

    generateProfileClass(tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) {
        const tsBaseResourceName = tsTypeFromIdentifier(flatProfile.base);
        const tsProfileName = tsResourceName(flatProfile.identifier);
        const profileClassName = tsProfileClassName(flatProfile.identifier);

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
            this.curlyBlock(["export", "type", typeName, "="], () => {
                for (const sub of ext.subExtensions ?? []) {
                    const tsType = sub.valueType ? tsTypeFromIdentifier(sub.valueType) : "unknown";
                    const isArray = sub.max === "*";
                    const isRequired = sub.min !== undefined && sub.min > 0;
                    this.lineSM(`${sub.name}${isRequired ? "" : "?"}: ${tsType}${isArray ? "[]" : ""}`);
                }
            });
            this.line();
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
                this.lineSM(`export type ${typeName} = ${typeExpr}`);
            }
            this.line();
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
            this.generateProfileHelpersImport({
                needsGetOrCreateObjectAtPath,
                needsSliceHelpers,
                needsExtensionExtraction,
                needsSliceExtraction,
            });
            this.line();
        }

        // Check if we have an override interface (narrowed types)
        const hasOverrideInterface = this.detectFieldOverrides(tsIndex, flatProfile).size > 0;

        this.curlyBlock(["export", "class", profileClassName], () => {
            this.line(`private resource: ${tsBaseResourceName}`);
            this.line();
            this.curlyBlock(["constructor", `(resource: ${tsBaseResourceName})`], () => {
                this.line("this.resource = resource");
            });
            this.line();
            // toResource() returns base type (e.g., Patient)
            this.curlyBlock(["toResource", "()", `: ${tsBaseResourceName}`], () => {
                this.line("return this.resource");
            });
            this.line();
            // toProfile() returns casted profile type if override interface exists
            if (hasOverrideInterface) {
                this.curlyBlock(["toProfile", "()", `: ${tsProfileName}`], () => {
                    this.line(`return this.resource as ${tsProfileName}`);
                });
                this.line();
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

            for (const ext of extensions) {
                if (!ext.url) continue;
                const methodName = extensionMethodNames.get(ext) ?? tsExtensionMethodFallback(ext.name, ext.path);
                const valueTypes = ext.valueTypes ?? [];
                const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

                if (ext.isComplex && ext.subExtensions) {
                    const inputTypeName = tsExtensionInputTypeName(tsProfileName, ext.name);
                    this.curlyBlock(["public", methodName, `(input: ${inputTypeName}): this`], () => {
                        this.line("const subExtensions: Extension[] = []");
                        for (const sub of ext.subExtensions ?? []) {
                            const valueField = sub.valueType
                                ? `value${uppercaseFirstLetter(sub.valueType.name)}`
                                : "value";
                            // When value type is unknown, cast to Extension to avoid TS error
                            const needsCast = !sub.valueType;
                            const pushSuffix = needsCast ? " as Extension" : "";
                            if (sub.max === "*") {
                                this.curlyBlock(["if", `(input.${sub.name})`], () => {
                                    this.curlyBlock(["for", `(const item of input.${sub.name})`], () => {
                                        this.line(
                                            `subExtensions.push({ url: "${sub.url}", ${valueField}: item }${pushSuffix})`,
                                        );
                                    });
                                });
                            } else {
                                this.curlyBlock(["if", `(input.${sub.name} !== undefined)`], () => {
                                    this.line(
                                        `subExtensions.push({ url: "${sub.url}", ${valueField}: input.${sub.name} }${pushSuffix})`,
                                    );
                                });
                            }
                        }
                        if (targetPath.length === 0) {
                            this.line("const list = (this.resource.extension ??= [])");
                            this.line(`list.push({ url: "${ext.url}", extension: subExtensions })`);
                        } else {
                            this.line(
                                `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                            );
                            this.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                            this.line(
                                `(target.extension as Extension[]).push({ url: "${ext.url}", extension: subExtensions })`,
                            );
                        }
                        this.line("return this");
                    });
                } else if (valueTypes.length === 1 && valueTypes[0]) {
                    const firstValueType = valueTypes[0];
                    const valueType = tsTypeFromIdentifier(firstValueType);
                    const valueField = `value${uppercaseFirstLetter(firstValueType.name)}`;
                    this.curlyBlock(["public", methodName, `(value: ${valueType}): this`], () => {
                        if (targetPath.length === 0) {
                            this.line("const list = (this.resource.extension ??= [])");
                            this.line(`list.push({ url: "${ext.url}", ${valueField}: value })`);
                        } else {
                            this.line(
                                `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
                                    targetPath,
                                )})`,
                            );
                            this.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                            this.line(
                                `(target.extension as Extension[]).push({ url: "${ext.url}", ${valueField}: value })`,
                            );
                        }
                        this.line("return this");
                    });
                } else {
                    this.curlyBlock(["public", methodName, `(value: Omit<Extension, "url">): this`], () => {
                        if (targetPath.length === 0) {
                            this.line("const list = (this.resource.extension ??= [])");
                            this.line(`list.push({ url: "${ext.url}", ...value })`);
                        } else {
                            this.line(
                                `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(
                                    targetPath,
                                )})`,
                            );
                            this.line("if (!Array.isArray(target.extension)) target.extension = [] as Extension[]");
                            this.line(`(target.extension as Extension[]).push({ url: "${ext.url}", ...value })`);
                        }
                        this.line("return this");
                    });
                }
                this.line();
            }

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
                this.curlyBlock(["public", methodName, paramSignature], () => {
                    this.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                    // Use empty object as default when input is optional
                    const inputExpr = sliceDef.inputOptional
                        ? "(input ?? {}) as Record<string, unknown>"
                        : "input as Record<string, unknown>";
                    this.line(`const value = applySliceMatch(${inputExpr}, match) as unknown as ${sliceDef.baseType}`);
                    if (sliceDef.array) {
                        this.line(`const list = (${fieldAccess} ??= [])`);
                        this.line("const index = list.findIndex((item) => matchesSlice(item, match))");
                        this.line("if (index === -1) {");
                        this.indentBlock(() => {
                            this.line("list.push(value)");
                        });
                        this.line("} else {");
                        this.indentBlock(() => {
                            this.line("list[index] = value");
                        });
                        this.line("}");
                    } else {
                        this.line(`${fieldAccess} = value`);
                    }
                    this.line("return this");
                });
                this.line();
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
                        this.line(`const ext = this.resource.extension?.find(e => e.url === "${ext.url}")`);
                    } else {
                        this.line(
                            `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                        );
                        this.line(
                            `const ext = (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`,
                        );
                    }
                };

                if (ext.isComplex && ext.subExtensions) {
                    const inputTypeName = tsExtensionInputTypeName(tsProfileName, ext.name);
                    // Flat API getter
                    this.curlyBlock(["public", getMethodName, `(): ${inputTypeName} | undefined`], () => {
                        generateExtLookup();
                        this.line("if (!ext) return undefined");
                        // Build extraction config
                        const configItems = (ext.subExtensions ?? []).map((sub) => {
                            const valueField = sub.valueType
                                ? `value${uppercaseFirstLetter(sub.valueType.name)}`
                                : "value";
                            const isArray = sub.max === "*";
                            return `{ name: "${sub.url}", valueField: "${valueField}", isArray: ${isArray} }`;
                        });
                        this.line(`const config = [${configItems.join(", ")}]`);
                        this.line(
                            `return extractComplexExtension(ext as unknown as { extension?: Array<{ url?: string; [key: string]: unknown }> }, config) as ${inputTypeName}`,
                        );
                    });
                    this.line();
                    // Raw Extension getter
                    this.curlyBlock(["public", getExtensionMethodName, "(): Extension | undefined"], () => {
                        generateExtLookup();
                        this.line("return ext");
                    });
                } else if (valueTypes.length === 1 && valueTypes[0]) {
                    const firstValueType = valueTypes[0];
                    const valueType = tsTypeFromIdentifier(firstValueType);
                    const valueField = `value${uppercaseFirstLetter(firstValueType.name)}`;
                    // Flat API getter
                    this.curlyBlock(["public", getMethodName, `(): ${valueType} | undefined`], () => {
                        generateExtLookup();
                        this.line(`return ext?.${valueField}`);
                    });
                    this.line();
                    // Raw Extension getter
                    this.curlyBlock(["public", getExtensionMethodName, "(): Extension | undefined"], () => {
                        generateExtLookup();
                        this.line("return ext");
                    });
                } else {
                    // Generic extension - only raw getter makes sense
                    this.curlyBlock(["public", getMethodName, "(): Extension | undefined"], () => {
                        if (targetPath.length === 0) {
                            this.line(`return this.resource.extension?.find(e => e.url === "${ext.url}")`);
                        } else {
                            this.line(
                                `const target = getOrCreateObjectAtPath(this.resource as unknown as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                            );
                            this.line(
                                `return (target.extension as Extension[] | undefined)?.find(e => e.url === "${ext.url}")`,
                            );
                        }
                    });
                }
                this.line();
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
                    this.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                    if (sliceDef.array) {
                        this.line(`const list = ${fieldAccess}`);
                        this.line("if (!list) return undefined");
                        this.line("const item = list.find((item) => matchesSlice(item, match))");
                    } else {
                        this.line(`const item = ${fieldAccess}`);
                        this.line("if (!item || !matchesSlice(item, match)) return undefined");
                    }
                };

                // Flat API getter (simplified)
                this.curlyBlock(["public", getMethodName, `(): ${typeName} | undefined`], () => {
                    generateSliceLookup();
                    if (sliceDef.array) {
                        this.line("if (!item) return undefined");
                    }
                    this.line(
                        `return extractSliceSimplified(item as unknown as Record<string, unknown>, ${matchKeys}) as ${typeName}`,
                    );
                });
                this.line();

                // Raw getter (full FHIR type)
                this.curlyBlock(["public", getRawMethodName, `(): ${baseType} | undefined`], () => {
                    generateSliceLookup();
                    if (sliceDef.array) {
                        this.line("return item");
                    } else {
                        this.line("return item");
                    }
                });
                this.line();
            }
        });
        this.line();
    }

    /**
     * Detects fields where the profile changes cardinality or narrows Reference types
     * compared to the base resource type.
     */
    private detectFieldOverrides(
        tsIndex: TypeSchemaIndex,
        flatProfile: ProfileTypeSchema,
    ): Map<string, { profileType: string; required: boolean; array: boolean }> {
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
                const tsType = this.tsTypeForProfileField(tsIndex, flatProfile, fieldName, pField);
                overrides.set(fieldName, {
                    profileType: tsType,
                    required: true,
                    array: pField.array ?? false,
                });
            }
        }
        return overrides;
    }

    /**
     * Generates an override interface for profiles that narrow cardinality or Reference types.
     * Example: export interface USCorePatient extends Patient { subject: Reference<"Patient"> }
     */
    generateProfileOverrideInterface(tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) {
        const overrides = this.detectFieldOverrides(tsIndex, flatProfile);
        if (overrides.size === 0) return;

        const tsProfileName = tsResourceName(flatProfile.identifier);
        const tsBaseResourceName = tsResourceName(flatProfile.base);

        this.curlyBlock(["export", "interface", tsProfileName, "extends", tsBaseResourceName], () => {
            for (const [fieldName, override] of overrides) {
                const tsField = tsFieldName(fieldName);
                const optionalSymbol = override.required ? "" : "?";
                const arraySymbol = override.array ? "[]" : "";
                this.lineSM(`${tsField}${optionalSymbol}: ${override.profileType}${arraySymbol}`);
            }
        });
        this.line();
    }

    generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema) {
        if (isProfileTypeSchema(schema)) {
            this.cd("profiles", () => {
                this.cat(`${tsModuleFileName(schema.identifier)}`, () => {
                    this.generateDisclaimer();
                    const flatProfile = tsIndex.flatProfile(schema);
                    this.generateProfileImports(tsIndex, flatProfile);
                    this.comment(
                        "CanonicalURL:",
                        schema.identifier.url,
                        `(pkg: ${packageMetaToFhir(packageMeta(schema))})`,
                    );
                    this.generateProfileOverrideInterface(tsIndex, flatProfile);
                    this.generateProfileClass(tsIndex, flatProfile);
                });
            });
        } else if (["complex-type", "resource", "logical"].includes(schema.identifier.kind)) {
            this.cat(`${tsModuleFileName(schema.identifier)}`, () => {
                this.generateDisclaimer();
                this.generateDependenciesImports(tsIndex, schema);
                this.generateComplexTypeReexports(schema);
                this.generateNestedTypes(tsIndex, schema);
                this.comment(
                    "CanonicalURL:",
                    schema.identifier.url,
                    `(pkg: ${packageMetaToFhir(packageMeta(schema))})`,
                );
                this.generateType(tsIndex, schema);
                this.generateResourceTypePredicate(schema);
            });
        } else {
            throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
        }
    }

    override async generate(tsIndex: TypeSchemaIndex) {
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
            ...tsIndex.collectLogicalModels(),
            ...(this.opts.generateProfile ? tsIndex.collectProfiles() : []),
        ];
        const grouped = groupByPackages(typesToGenerate);

        const hasProfiles = this.opts.generateProfile && typesToGenerate.some(isProfileTypeSchema);

        this.cd("/", () => {
            if (hasProfiles) {
                this.generateProfileHelpersModule();
            }

            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageDir = tsFhirPackageDir(packageName);
                this.cd(tsPackageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    this.generateProfileIndexFile(tsIndex, packageSchemas.filter(isProfileTypeSchema));
                    this.generateFhirPackageIndexFile(tsIndex, packageSchemas);
                });
            }
        });
    }
}
