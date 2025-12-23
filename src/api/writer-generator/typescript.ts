import {
    camelCase,
    kebabCase,
    pascalCase,
    typeSchemaInfo,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import { packageTreeShakeReadme, rootTreeShakeReadme } from "@root/typeschema/tree-shake";
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
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type Name,
    type ProfileExtension,
    type ProfileTypeSchema,
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
    return pascalCase(id.name);
};

const tsModuleFileName = (id: Identifier): string => {
    return `${tsModuleName(id)}.ts`;
};

const tsModulePath = (id: Identifier): string => {
    if (id.kind === "profile") {
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
    return n.replace(/[- ]/g, "_");
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
    return id.name;
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

    private tsProfileClassName(profileName: string): string {
        return `${uppercaseFirstLetter(profileName)}Profile`;
    }

    private tsSliceInputTypeName(profileName: string, fieldName: string, sliceName: string): string {
        return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(fieldName))}_${uppercaseFirstLetter(normalizeTsName(sliceName))}SliceInput`;
    }

    private tsExtensionInputTypeName(profileName: string, extensionName: string): string {
        return `${uppercaseFirstLetter(profileName)}_${uppercaseFirstLetter(normalizeTsName(extensionName))}Input`;
    }

    private safeCamelCase(name: string): string {
        if (!name) return "";
        return camelCase(name);
    }

    private tsSliceMethodName(sliceName: string): string {
        const normalized = this.safeCamelCase(sliceName);
        return `set${uppercaseFirstLetter(normalized || "Slice")}`;
    }

    private tsExtensionMethodName(name: string): string {
        const normalized = this.safeCamelCase(name);
        return `set${uppercaseFirstLetter(normalized || "Extension")}`;
    }

    private tsExtensionMethodFallback(name: string, path?: string): string {
        const rawPath =
            path
                ?.split(".")
                .filter((p) => p && p !== "extension")
                .join("_") ?? "";
        const pathPart = rawPath ? uppercaseFirstLetter(this.safeCamelCase(rawPath)) : "";
        const normalized = this.safeCamelCase(name);
        return `setExtension${pathPart}${uppercaseFirstLetter(normalized || "Extension")}`;
    }

    private tsSliceMethodFallback(fieldName: string, sliceName: string): string {
        const fieldPart = uppercaseFirstLetter(this.safeCamelCase(fieldName) || "Field");
        const slicePart = uppercaseFirstLetter(this.safeCamelCase(sliceName) || "Slice");
        return `setSlice${fieldPart}${slicePart}`;
    }

    private generateProfileIndexFile(profiles: TypeSchema[]) {
        if (profiles.length === 0) return;
        this.cd("profiles", () => {
            this.cat("index.ts", () => {
                const exports = profiles
                    .filter(isProfileTypeSchema)
                    .map((schema) => this.tsProfileClassName(tsResourceName(schema.identifier)))
                    .sort((a, b) => a.localeCompare(b));
                if (exports.length === 0) return;
                for (const profile of profiles) {
                    const className = this.tsProfileClassName(tsResourceName(profile.identifier));
                    this.lineSM(`export { ${className} } from "./${tsModuleName(profile.identifier)}"`);
                }
            });
        });
    }

    generateFhirPackageIndexFile(schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            const profiles = schemas.filter(isProfileTypeSchema);
            if (profiles.length > 0) {
                this.lineSM(`export * from "./profiles"`);
            }

            let exports = schemas
                .flatMap((schema) => {
                    const resourceName = tsResourceName(schema.identifier);
                    const typeExports = isProfileTypeSchema(schema)
                        ? []
                        : [
                              resourceName,
                              ...((isResourceTypeSchema(schema) && schema.nested) ||
                              (isLogicalTypeSchema(schema) && schema.nested)
                                  ? schema.nested.map((n) => tsResourceName(n.identifier))
                                  : []),
                          ];
                    const valueExports =
                        isResourceTypeSchema(schema) || isLogicalTypeSchema(schema) ? [`is${resourceName}`] : [];

                    return [
                        {
                            identifier: schema.identifier,
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
                    this.lineSM(`export type { ${exp.typeExports.join(", ")} } from "./${exp.tsPackageName}"`);
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
            if (isResourceTypeSchema(schema) || isLogicalTypeSchema(schema)) {
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
        if (!isResourceTypeSchema(schema) && !isLogicalTypeSchema(schema)) return;
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
                return `Reference<"Resource" /* ${references} */ >`;
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
                    this.line('return value !== null && typeof value === "object" && !Array.isArray(value)');
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
                    this.line("let current: Record<string, unknown> = root");
                    this.curlyBlock(["for (const", "segment", "of", "path)"], () => {
                        this.curlyBlock(["if", "(Array.isArray(current[segment]))"], () => {
                            this.line("const list = current[segment] as unknown[]");
                            this.curlyBlock(["if", "(list.length === 0)"], () => {
                                this.line("list.push({})");
                            });
                            this.line("current = list[0] as Record<string, unknown>");
                        });
                        this.curlyBlock(["else"], () => {
                            this.curlyBlock(["if", "(!isRecord(current[segment]))"], () => {
                                this.line("current[segment] = {}");
                            });
                            this.line("current = current[segment] as Record<string, unknown>");
                        });
                    });
                    this.line("return current");
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
                        this.curlyBlock(["if", "(isRecord(matchValue))"], () => {
                            this.curlyBlock(["if", "(isRecord(target[key]))"], () => {
                                this.line("mergeMatch(target[key] as Record<string, unknown>, matchValue)");
                            });
                            this.curlyBlock(["else"], () => {
                                this.line("target[key] = { ...matchValue }");
                            });
                        });
                        this.curlyBlock(["else"], () => {
                            this.line("target[key] = matchValue");
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
                    this.line("const result = { ...input } as Record<string, unknown>");
                    this.line("mergeMatch(result, match)");
                    this.line("return result as T");
                },
            );
            this.line();
            this.curlyBlock(
                ["export const", "matchesValue", "=", "(value: unknown, match: unknown): boolean", "=>"],
                () => {
                    this.curlyBlock(["if", "(Array.isArray(match))"], () => {
                        this.curlyBlock(["if", "(!Array.isArray(value))"], () => this.line("return false"));
                        this.line(
                            "return match.every((matchItem) => value.some((item) => matchesValue(item, matchItem)))",
                        );
                    });
                    this.curlyBlock(["if", "(isRecord(match))"], () => {
                        this.curlyBlock(["if", "(!isRecord(value))"], () => this.line("return false"));
                        this.curlyBlock(["for (const", "[key, matchValue]", "of", "Object.entries(match))"], () => {
                            this.curlyBlock(
                                ["if", "(!matchesValue((value as Record<string, unknown>)[key], matchValue))"],
                                () => {
                                    this.line("return false");
                                },
                            );
                        });
                        this.line("return true");
                    });
                    this.line("return value === match");
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
                    this.line("return matchesValue(value, match)");
                },
            );
        });
    }

    private generateProfileHelpersImport(needsGetOrCreateObjectAtPath: boolean, needsSliceHelpers: boolean) {
        const imports: string[] = [];
        if (needsSliceHelpers) {
            imports.push("applySliceMatch", "matchesSlice");
        }
        if (needsGetOrCreateObjectAtPath) {
            imports.push("getOrCreateObjectAtPath");
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
        const tsBaseResourceName = tsResourceName(flatProfile.base);
        const tsProfileName = tsResourceName(flatProfile.identifier);
        const tsProfileClassName = this.tsProfileClassName(tsProfileName);

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
                    .map(([sliceName, slice]) => ({
                        fieldName,
                        baseType,
                        sliceName,
                        match: slice.match ?? {},
                        required: slice.required ?? [],
                        excluded: slice.excluded ?? [],
                        array: Boolean(field.array),
                    }));
            });

        const extensions = flatProfile.extensions ?? [];
        const complexExtensions = extensions.filter((ext) => ext.isComplex && ext.subExtensions);

        for (const ext of complexExtensions) {
            const typeName = this.tsExtensionInputTypeName(tsProfileName, ext.name);
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
                const typeName = this.tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
                const matchFields = Object.keys(sliceDef.match);
                const allExcluded = [...new Set([...sliceDef.excluded, ...matchFields])];
                const excludedNames = allExcluded.map((name) => JSON.stringify(name));
                const filteredRequired = sliceDef.required.filter((name) => !matchFields.includes(name));
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

        if (needsSliceHelpers || needsGetOrCreateObjectAtPath) {
            this.generateProfileHelpersImport(needsGetOrCreateObjectAtPath, needsSliceHelpers);
            this.line();
        }

        this.curlyBlock(["export", "class", tsProfileClassName], () => {
            this.line(`private resource: ${tsBaseResourceName}`);
            this.line();
            this.curlyBlock(["constructor", `(resource?: ${tsBaseResourceName})`], () => {
                this.line(
                    `this.resource = resource ?? ({ resourceType: "${flatProfile.base.name}" } as ${tsBaseResourceName})`,
                );
            });
            this.line();
            this.curlyBlock(["toResource", "()", `: ${tsBaseResourceName}`], () => {
                this.line("return this.resource");
            });
            this.line();

            const extensionMethods = extensions
                .filter((ext) => ext.url)
                .map((ext) => ({
                    ext,
                    baseName: this.tsExtensionMethodName(ext.name),
                    fallbackName: this.tsExtensionMethodFallback(ext.name, ext.path),
                }));
            const sliceMethodBases = sliceDefs.map((slice) => this.tsSliceMethodName(slice.sliceName));
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
                    const baseName = this.tsSliceMethodName(slice.sliceName);
                    const needsFallback = (methodCounts.get(baseName) ?? 0) > 1;
                    const fallback = this.tsSliceMethodFallback(slice.fieldName, slice.sliceName);
                    return [slice, needsFallback ? fallback : baseName];
                }),
            );

            for (const ext of extensions) {
                if (!ext.url) continue;
                const methodName = extensionMethodNames.get(ext) ?? this.tsExtensionMethodFallback(ext.name, ext.path);
                const valueTypes = ext.valueTypes ?? [];
                const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");

                if (ext.isComplex && ext.subExtensions) {
                    const inputTypeName = this.tsExtensionInputTypeName(tsProfileName, ext.name);
                    this.curlyBlock(["public", methodName, `(input: ${inputTypeName}): this`], () => {
                        this.line("const subExtensions: Extension[] = []");
                        for (const sub of ext.subExtensions ?? []) {
                            const valueField = sub.valueType
                                ? `value${uppercaseFirstLetter(sub.valueType.name)}`
                                : "value";
                            if (sub.max === "*") {
                                this.curlyBlock(["if", `(input.${sub.name})`], () => {
                                    this.curlyBlock(["for", `(const item of input.${sub.name})`], () => {
                                        this.line(`subExtensions.push({ url: "${sub.url}", ${valueField}: item })`);
                                    });
                                });
                            } else {
                                this.curlyBlock(["if", `(input.${sub.name} !== undefined)`], () => {
                                    this.line(
                                        `subExtensions.push({ url: "${sub.url}", ${valueField}: input.${sub.name} })`,
                                    );
                                });
                            }
                        }
                        if (targetPath.length === 0) {
                            this.line("const list = (this.resource.extension ??= [])");
                            this.line(`list.push({ url: "${ext.url}", extension: subExtensions })`);
                        } else {
                            this.line(
                                `const target = getOrCreateObjectAtPath(this.resource as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                            );
                            this.line("if (!Array.isArray(target.extension)) target.extension = []");
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
                                `const target = getOrCreateObjectAtPath(this.resource as Record<string, unknown>, ${JSON.stringify(
                                    targetPath,
                                )})`,
                            );
                            this.line("if (!Array.isArray(target.extension)) target.extension = []");
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
                                `const target = getOrCreateObjectAtPath(this.resource as Record<string, unknown>, ${JSON.stringify(
                                    targetPath,
                                )})`,
                            );
                            this.line("if (!Array.isArray(target.extension)) target.extension = []");
                            this.line(`(target.extension as Extension[]).push({ url: "${ext.url}", ...value })`);
                        }
                        this.line("return this");
                    });
                }
                this.line();
            }

            for (const sliceDef of sliceDefs) {
                const methodName =
                    sliceMethodNames.get(sliceDef) ??
                    this.tsSliceMethodFallback(sliceDef.fieldName, sliceDef.sliceName);
                const typeName = this.tsSliceInputTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
                const matchLiteral = JSON.stringify(sliceDef.match);
                const tsField = tsFieldName(sliceDef.fieldName);
                const fieldAccess = tsGet("this.resource", tsField);
                this.curlyBlock(["public", methodName, `(input: ${typeName}): this`], () => {
                    this.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                    this.line(
                        `const value = applySliceMatch(input as Record<string, unknown>, match) as unknown as ${sliceDef.baseType}`,
                    );
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

            const generatedResetMethods = new Set<string>();

            for (const ext of extensions) {
                if (!ext.url) continue;
                const resetMethodName = `reset${uppercaseFirstLetter(this.safeCamelCase(ext.name))}`;
                if (generatedResetMethods.has(resetMethodName)) continue;
                generatedResetMethods.add(resetMethodName);
                const targetPath = ext.path.split(".").filter((segment) => segment !== "extension");
                this.curlyBlock(["public", resetMethodName, "(): this"], () => {
                    if (targetPath.length === 0) {
                        this.line("const list = this.resource.extension");
                    } else {
                        this.line(
                            `const target = getOrCreateObjectAtPath(this.resource as Record<string, unknown>, ${JSON.stringify(targetPath)})`,
                        );
                        this.line("const list = target.extension as Extension[] | undefined");
                    }
                    this.curlyBlock(["if", "(list)"], () => {
                        this.line(`const index = list.findIndex((e) => e.url === "${ext.url}")`);
                        this.curlyBlock(["if", "(index !== -1)"], () => {
                            this.line("list.splice(index, 1)");
                        });
                    });
                    this.line("return this");
                });
                this.line();
            }

            for (const sliceDef of sliceDefs) {
                const resetMethodName = `reset${uppercaseFirstLetter(this.safeCamelCase(sliceDef.sliceName))}`;
                if (generatedResetMethods.has(resetMethodName)) continue;
                generatedResetMethods.add(resetMethodName);
                const matchLiteral = JSON.stringify(sliceDef.match);
                const tsField = tsFieldName(sliceDef.fieldName);
                const fieldAccess = tsGet("this.resource", tsField);
                this.curlyBlock(["public", resetMethodName, "(): this"], () => {
                    this.line(`const match = ${matchLiteral} as Record<string, unknown>`);
                    this.line(`const list = ${fieldAccess}`);
                    this.curlyBlock(["if", "(list)"], () => {
                        this.line("const index = list.findIndex((item) => matchesSlice(item, match))");
                        this.curlyBlock(["if", "(index !== -1)"], () => {
                            this.line("list.splice(index, 1)");
                        });
                    });
                    this.line("return this");
                });
                this.line();
            }
        });
        this.line();
    }

    generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema) {
        const generateModule = () => {
            this.generateDisclaimer();
            if (["complex-type", "resource", "logical"].includes(schema.identifier.kind)) {
                this.generateDependenciesImports(tsIndex, schema);
                this.generateComplexTypeReexports(schema);
                this.generateNestedTypes(tsIndex, schema);
                this.comment("CanonicalURL:", schema.identifier.url);
                this.generateType(tsIndex, schema);
                this.generateResourceTypePredicate(schema);
            } else if (isProfileTypeSchema(schema)) {
                const flatProfile = tsIndex.flatProfile(schema);
                this.generateProfileImports(tsIndex, flatProfile);
                this.comment("CanonicalURL:", schema.identifier.url);
                this.generateProfileClass(tsIndex, flatProfile);
            } else throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
        };

        if (isProfileTypeSchema(schema)) {
            this.cd("profiles", () => {
                this.cat(`${tsModuleFileName(schema.identifier)}`, generateModule);
            });
        } else {
            this.cat(`${tsModuleFileName(schema.identifier)}`, generateModule);
        }
    }

    override async generate(tsIndex: TypeSchemaIndex) {
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
            ...tsIndex.collectLogicalModels(),
            ...(this.opts.generateProfile
                ? tsIndex
                      .collectProfiles()
                      // NOTE: because non Resource don't have `meta` field
                      .filter((p) => tsIndex.isWithMetaField(p))
                : []),
        ];
        const grouped = groupByPackages(typesToGenerate);
        const treeShakeReport = tsIndex.treeShakeReport();

        const hasProfiles = this.opts.generateProfile && typesToGenerate.some(isProfileTypeSchema);

        this.cd("/", () => {
            if (treeShakeReport) {
                this.cat("README.md", () => {
                    this.write(rootTreeShakeReadme(treeShakeReport));
                });
            if (hasProfiles) {
                this.generateProfileHelpersModule();
            }

            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageDir = tsFhirPackageDir(packageName);
                this.cd(tsPackageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    this.generateProfileIndexFile(packageSchemas.filter(isProfileTypeSchema));
                    this.generateFhirPackageIndexFile(packageSchemas);
                    if (treeShakeReport) {
                        this.cat("README.md", () => {
                            this.write(packageTreeShakeReadme(treeShakeReport, packageName));
                        });
                    }
                });
            }
        });
    }
}
