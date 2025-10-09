import {
    kebabCase,
    pascalCase,
    uppercaseFirstLetter,
    uppercaseFirstLetterOfEach,
} from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { Identifier, TypeSchema } from "@root/typeschema";
import {
    isChoiceDeclarationField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isProfileTypeSchema,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type ProfileTypeSchema,
    type RegularField,
    type RegularTypeSchema,
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
    if (id.kind === "profile") return `${tsResourceName(id)}_profile`;
    return pascalCase(id.name);
};

const tsModuleFileName = (id: Identifier): string => {
    return `${tsModuleName(id)}.ts`;
};

const canonicalToName = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (!localName) return undefined;
    if (dropFragment && localName.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (!localName) return undefined;
    if (/^\d/.test(localName)) {
        localName = `number_${localName}`;
    }
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

const tsFieldName = (n: string): string => normalizeTsName(n);

const normalizeTsName = (n: string): string => {
    // biome-ignore format: too long
    const tsKeywords = new Set(["abstract", "any", "as", "async", "await", "boolean", "bigint", "break", "case", "catch", "class", "const", "constructor", "continue", "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "extern", "false", "finally", "for", "function", "from", "get", "goto", "if", "implements", "import", "in", "infer", "instanceof", "interface", "keyof", "let", "module", "namespace", "never", "new", "null", "number", "object", "of", "override", "private", "protected", "public", "readonly", "return", "satisfies", "set", "static", "string", "super", "switch", "this", "throw", "true", "try", "type", "typeof", "unknown", "var", "void", "while"]);
    if (tsKeywords.has(n)) n = `${n}_`;
    return n.replace(/[- ]/g, "_");
};

export type TypeScriptOptions = {} & WriterOptions;

export class TypeScript extends Writer {
    tsImportType(tsPackageName: string, ...entities: string[]) {
        this.lineSM(`import type { ${entities.join(", ")} } from "${tsPackageName}"`);
    }

    generateFhirPackageIndexFile(schemas: TypeSchema[]) {
        this.cat("index.ts", () => {
            let exports = schemas
                .map((schema) => ({
                    identifier: schema.identifier,
                    tsPackageName: tsModuleName(schema.identifier),
                    resourceName: tsResourceName(schema.identifier),
                }))
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            // FIXME: actually, duplication may means internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.resourceName.toLowerCase(), exp])).values()).sort(
                (a, b) => a.resourceName.localeCompare(b.resourceName),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);
                this.lineSM(`export type { ${exp.resourceName} } from "./${exp.tsPackageName}"`);
            }
        });
    }

    generateDependenciesImports(schema: RegularTypeSchema) {
        if (schema.dependencies) {
            const imports = [];
            const skipped = [];
            for (const dep of schema.dependencies) {
                if (["complex-type", "resource", "logical"].includes(dep.kind)) {
                    imports.push({
                        tsPackage: `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
                        name: uppercaseFirstLetter(dep.name),
                    });
                } else if (isNestedIdentifier(dep)) {
                    imports.push({
                        tsPackage: `../${kebabCase(dep.package)}/${pascalCase(canonicalToName(dep.url) ?? "")}`,
                        name: tsResourceName(dep),
                    });
                } else {
                    skipped.push(dep);
                }
            }
            imports.sort((a, b) => a.name.localeCompare(b.name));
            for (const dep of imports) {
                this.tsImportType(dep.tsPackage, dep.name);
            }
            for (const dep of skipped) {
                this.debugComment("skip:", dep);
            }
            this.line();
            // // NOTE: for primitive type extensions
            // const element = this.loader.complexTypes().find((e) => e.identifier.name === "Element");
            // if (
            //     element &&
            //     deps.find((e) => e.name === "Element") === undefined &&
            //     // FIXME: don't import if fields and nested fields don't have primitive types
            //     schema.identifier.name !== "Element"
            // ) {
            //     this.tsImport(`../${kebabCase(element.identifier.package)}/Element`, "Element");
            // }
        }
    }

    generateComplexTypeReexports(schema: RegularTypeSchema) {
        const complexTypeDeps = schema.dependencies
            ?.filter((dep) => ["complex-type"].includes(dep.kind))
            .map((dep) => ({
                tsPackage: `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
                name: uppercaseFirstLetter(dep.name),
            }));
        if (complexTypeDeps && complexTypeDeps.length > 0) {
            for (const dep of complexTypeDeps) {
                this.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
            }
            this.line();
        }
    }

    addFieldExtension(fieldName: string, field: RegularField): void {
        if (field.type.kind === "primitive-type") {
            this.lineSM(`_${tsFieldName(fieldName)}?: Element`);
        }
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
        this.curlyBlock(["export", "interface", name, extendsClause], () => {
            if (isResourceTypeSchema(schema)) {
                const possibleResourceTypes = [schema.identifier];
                possibleResourceTypes.push(...tsIndex.resourceChildren(schema.identifier));
                this.lineSM(`resourceType: ${possibleResourceTypes.map((e) => `"${e.name}"`).join(" | ")}`);
                this.line();
            }

            if (!schema.fields) return;
            const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [fieldName, field] of fields) {
                if (isChoiceDeclarationField(field)) continue;
                if (field.type === undefined) continue; // FIXME: should be impossible

                this.debugComment(fieldName, ":", field);

                const tsName = tsFieldName(fieldName);

                let tsType: string;
                if (field.enum) {
                    tsType = field.enum.map((e) => `"${e}"`).join(" | ");
                } else if (schema.identifier.name === "Reference" && tsName === "reference") {
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

                if (["resource", "complex-type"].includes(schema.identifier.kind)) {
                    this.addFieldExtension(fieldName, field);
                }
            }
        });
    }

    generateNestedTypes(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema) {
        if (schema.nested) {
            for (const subtype of schema.nested) {
                this.generateType(tsIndex, subtype);
            }
        }
    }

    generateProfileType(tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) {
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

                let tsType: string;
                if (field.enum) {
                    tsType = field.enum.map((e) => `'${e}'`).join(" | ");
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
                        tsType = `Reference<"Resource" /* ${references} */ >`;
                    } else {
                        tsType = `Reference<${references}>`;
                    }
                } else if (isNestedIdentifier(field.type)) {
                    tsType = tsResourceName(field.type);
                } else if (isPrimitiveIdentifier(field.type)) {
                    tsType = resolvePrimitiveType(field.type.name);
                } else {
                    tsType = field.type.name;
                }

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
                        this.line(`${fieldName}:`, `profile.${fieldName},`);
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
                        this.curlyBlock([`if (resource.${tsField} === undefined)`], () =>
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
                        let cond: string = !pField?.required ? `!resource.${tsField} || ` : "";
                        if (pField.array) {
                            cond += `resource.${tsField}.every( (ref) => ${predName}(ref) )`;
                        } else {
                            cond += `!${predName}(resource.${tsField})`;
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
                            this.line(`${tsField}:`, `resource.${tsField} as ${tsProfileName}['${tsField}'],`);
                        } else {
                            this.line(`${tsField}:`, `resource.${tsField},`);
                        }
                    });
                });
            },
        );
    }

    generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema) {
        this.cat(`${tsModuleFileName(schema.identifier)}`, () => {
            this.generateDisclaimer();
            if (["complex-type", "resource", "logical"].includes(schema.identifier.kind)) {
                this.generateDependenciesImports(schema);
                this.generateComplexTypeReexports(schema);
                this.generateNestedTypes(tsIndex, schema);
                this.generateType(tsIndex, schema);
            } else if (isProfileTypeSchema(schema)) {
                const flatProfile = tsIndex.flatProfile(schema);
                this.generateDependenciesImports(flatProfile);
                this.generateProfileType(tsIndex, flatProfile);
                this.generateAttachProfile(flatProfile);
                this.generateExtractProfile(tsIndex, flatProfile);
            } else throw new Error(`Profile generation not implemented for kind: ${schema.identifier.kind}`);
        });
    }

    override generate(tsIndex: TypeSchemaIndex) {
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
            // ...tsIndex.collectLogicalModels(),
            ...tsIndex
                .collectProfiles()
                // NOTE: because non Resource don't have `meta` field
                .filter((p) => tsIndex.isWithMetaField(p)),
        ];
        const grouped = groupByPackages(typesToGenerate);

        this.cd("/", () => {
            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageDir = tsFhirPackageDir(packageName);
                this.cd(tsPackageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    this.generateFhirPackageIndexFile(packageSchemas);
                });
            }
        });
    }
}
