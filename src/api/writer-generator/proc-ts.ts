/**
 * proc-ts TypeScript generator
 *
 * Generates flat TypeScript files with one interface + one default export per file.
 * Resource types get `export default function isX` type guard.
 * Data types are type-only (no default export).
 *
 * Convention: fhir/Patient.ts, fhir/Encounter.ts — no subfolders.
 */

import { uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import {
    type CanonicalUrl,
    extractNameFromCanonical,
    isChoiceDeclarationField,
    isComplexTypeIdentifier,
    isPrimitiveIdentifier,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type NestedTypeSchema,
    packageMeta,
    packageMetaToFhir,
    type SpecializationTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";
import { resolveFieldTsType } from "./typescript/utils";
import { tsFieldName, tsResourceName, tsNameFromCanonical } from "./typescript/name";

export type ProcTsOptions = {
    lineWidth?: number;
} & WriterOptions;

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
    constructor(options: ProcTsOptions) {
        super({ lineWidth: 120, ...options });
    }

    // No imports — all types are global via ctx.types, resolved by genTypes() in REPL

    private generateInterface(
        tsIndex: TypeSchemaIndex,
        schema: SpecializationTypeSchema | NestedTypeSchema,
    ) {
        const name = normalizeName(schema.identifier);
        let extendsClause = "";
        if (schema.base) {
            const baseName = tsNameFromCanonical(schema.base.url);
            if (baseName) extendsClause = ` extends ${baseName}`;
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
                const tsType = resolveFieldTsType(schema.identifier.name, tsName, field);
                const optional = field.required ? "" : "?";
                const array = field.array ? "[]" : "";
                this.lineSM(`${tsName}${optional}: ${tsType}${array}`);
            }
        });
    }

    private generateNestedTypes(tsIndex: TypeSchemaIndex, schema: SpecializationTypeSchema) {
        if (!schema.nested) return;
        for (const subtype of schema.nested) {
            this.generateInterface(tsIndex, subtype);
            this.line();
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
        this.cat(`${name}_type.ts`, () => {
            this.generateDisclaimer();
            this.generateNestedTypes(tsIndex, schema);
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

        // Flat output — no package subdirectories
        this.cd("/", () => {
            for (const schema of typesToGenerate) {
                if (!isSpecializationTypeSchema(schema)) continue;
                this.generateModule(tsIndex, schema);
            }
        });
    }
}
