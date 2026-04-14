/**
 * proc-ts TypeScript generator
 *
 * Generates flat TypeScript files with _type.ts suffix.
 * All type references use `types.fhir.*` global namespace.
 * Resource types get `export default function isX` type guard.
 * Data types are type-only (no default export).
 */

import { uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import {
    type CanonicalUrl,
    extractNameFromCanonical,
    isChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type SpecializationTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import { type TypeSchemaIndex } from "@root/typeschema/utils";
import { tsFieldName, tsResourceName, tsNameFromCanonical } from "./typescript/name";

export type ProcTsOptions = {
    lineWidth?: number;
    /** Prefix for type references, e.g. "types.fhir" */
    typePrefix?: string;
} & WriterOptions;

const PRIMITIVE_MAP: Record<string, string> = {
    boolean: "boolean", instant: "string", time: "string", date: "string", dateTime: "string",
    decimal: "number", integer: "number", unsignedInt: "number", positiveInt: "number", integer64: "number",
    base64Binary: "string", uri: "string", url: "string", canonical: "string", oid: "string", uuid: "string",
    string: "string", code: "string", markdown: "string", id: "string", xhtml: "string",
};

const normalizeName = (id: TypeIdentifier): string => {
    if (id.kind === "nested") {
        const localName = extractNameFromCanonical(id.url as CanonicalUrl, false);
        if (!localName) return "";
        const [resourceName, fragment] = localName.split("#");
        const parts = (fragment ?? "").split(".");
        return [resourceName, ...parts.map(uppercaseFirstLetter)].join("");
    }
    return id.name;
};

export class ProcTs extends Writer<ProcTsOptions> {
    private prefix: string;

    constructor(options: ProcTsOptions) {
        super({ lineWidth: 120, ...options });
        this.prefix = options.typePrefix ?? "types.fhir";
    }

    /** Resolve field type with types.fhir.* prefix for non-primitive, non-nested types */
    private resolveType(field: any, schemaName: string): string {
        if (!field.type) return "any";

        // Enum values
        if (field.enum) {
            const values = field.enum.values.map((e: string) => `"${e}"`).join(" | ");
            const enumType = field.enum.isOpen ? `(${values} | string)` : `(${values})`;

            if (field.type.name === "Coding") return `${this.prefix}.Coding<${enumType}>`;
            if (field.type.name === "CodeableConcept") return `${this.prefix}.CodeableConcept<${enumType}>`;
            return enumType;
        }

        // References
        if (field.reference && field.reference.length > 0) {
            const refs = field.reference.map((r: TypeIdentifier) => `"${r.name}"`).join(" | ");
            return `${this.prefix}.Reference<${refs}>`;
        }

        // Primitive
        if (isPrimitiveIdentifier(field.type)) {
            return PRIMITIVE_MAP[field.type.name] ?? "string";
        }

        // Nested (backbone) — separate file, use prefix
        if (field.type.kind === "nested") {
            return `${this.prefix}.${normalizeName(field.type)}`;
        }

        // Complex type or resource — prefix with types.fhir.*
        return `${this.prefix}.${field.type.name}`;
    }

    private generateInterface(
        tsIndex: TypeSchemaIndex,
        schema: SpecializationTypeSchema | NestedTypeSchema,
        isNested = false,
    ) {
        const name = normalizeName(schema.identifier);
        // Nested types don't extend (they're local to the file)
        // Top-level types can extend if they have a base
        let extendsClause = "";
        if (!isNested && schema.base) {
            const baseName = tsNameFromCanonical(schema.base.url);
            if (baseName && baseName !== "DomainResource" && baseName !== "Resource" && baseName !== "Element" && baseName !== "BackboneElement") {
                extendsClause = ` extends ${this.prefix}.${baseName}`;
            }
        }

        this.curlyBlock(["export", "interface", name, extendsClause || undefined], () => {
            if (isResourceTypeSchema(schema)) {
                this.lineSM(`resourceType: "${schema.identifier.name}"`);
                this.line();
            }
            if (!schema.fields) return;
            const fields = Object.entries(schema.fields).sort(([a], [b]) => a.localeCompare(b));
            for (const [fieldName, field] of fields) {
                if (isChoiceDeclarationField(field)) continue;
                if (!field.type) continue;
                const tsName = tsFieldName(fieldName);
                const tsType = this.resolveType(field, schema.identifier.name);
                const optional = field.required ? "" : "?";
                const array = field.array ? "[]" : "";
                this.lineSM(`${tsName}${optional}: ${tsType}${array}`);
            }
        });
    }

    private generateNestedTypes(tsIndex: TypeSchemaIndex, schema: SpecializationTypeSchema) {
        if (!schema.nested) return;
        for (const subtype of schema.nested) {
            const nestedName = normalizeName(subtype.identifier);
            // Each nested type gets its own _type.ts file
            this.cat(`${nestedName}_type.ts`, () => {
                this.generateDisclaimer();
                this.comment("Nested type from", schema.identifier.name);
                this.generateInterface(tsIndex, subtype, true);
            });
        }
    }

    private generateTypeGuard(schema: SpecializationTypeSchema) {
        if (!isResourceTypeSchema(schema)) return;
        const name = tsResourceName(schema.identifier);
        this.line();
        this.curlyBlock(
            ["export", "default", "function", `is${name}(resource: unknown): resource is ${name}`],
            () => {
                this.lineSM(
                    `return resource !== null && typeof resource === "object" && (resource as {resourceType: string}).resourceType === "${schema.identifier.name}"`,
                );
            },
        );
    }

    private generateModule(tsIndex: TypeSchemaIndex, schema: SpecializationTypeSchema) {
        const name = tsResourceName(schema.identifier);
        // Generate nested types as separate files first
        this.generateNestedTypes(tsIndex, schema);
        // Generate main type file
        this.cat(`${name}_type.ts`, () => {
            this.generateDisclaimer();
            this.comment("CanonicalURL:", schema.identifier.url, `(pkg: ${packageMetaToFhir(packageMeta(schema))})`);
            this.generateInterface(tsIndex, schema);
            this.generateTypeGuard(schema);
        });
    }

    override async generate(tsIndex: TypeSchemaIndex) {
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
        ];

        this.cd("/", () => {
            for (const schema of typesToGenerate) {
                if (!isSpecializationTypeSchema(schema)) continue;
                this.generateModule(tsIndex, schema);
            }
        });
    }
}
