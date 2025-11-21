import type { Writer } from "@root/api/writer-generator/writer";
import type { RegularField, RegularTypeSchema } from "@root/typeschema/types";
import {
    isChoiceDeclarationField,
    isLogicalTypeSchema,
    isNestedIdentifier,
    isPrimitiveIdentifier,
    isResourceTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { canonicalToName, resolvePrimitiveType, tsFieldName, tsResourceName } from "./utils";

/**
 * Generate TypeScript interface for a resource or complex type
 */
export function generateType(writer: Writer, tsIndex: TypeSchemaIndex, schema: RegularTypeSchema): void {
    let name: string;
    if (schema.identifier.name === "Reference") {
        name = "Reference<T extends string = string>";
    } else if (schema.identifier.kind === "nested") {
        name = tsResourceName(schema.identifier);
    } else {
        name = tsResourceName(schema.identifier);
    }

    let extendsClause: string | undefined;
    if (schema.base) {
        extendsClause = `extends ${canonicalToName(schema.base.url)}`;
    }

    writer.debugComment(schema.identifier);
    writer.curlyBlock(["export", "interface", name, extendsClause], () => {
        // Add resourceType for resources and logical models
        if (isResourceTypeSchema(schema) || isLogicalTypeSchema(schema)) {
            const possibleResourceTypes = [schema.identifier];
            possibleResourceTypes.push(...tsIndex.resourceChildren(schema.identifier));

            // Check if we should add string as open type set
            const openSetSuffix =
                writer.opts.openResourceTypeSet && possibleResourceTypes.length > 1 ? " | string" : "";

            writer.lineSM(
                `resourceType: ${possibleResourceTypes
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((e) => `"${e.name}"`)
                    .join(" | ")}${openSetSuffix}`,
            );
            writer.line();
        }

        if (!schema.fields) return;

        // Generate fields sorted alphabetically
        const fields = Object.entries(schema.fields).sort((a, b) => a[0].localeCompare(b[0]));

        for (const [fieldName, field] of fields) {
            if (isChoiceDeclarationField(field)) continue;

            generateField(writer, tsIndex, schema, fieldName, field);
        }
    });

    // Generate type predicate for resources and logical models
    if (isResourceTypeSchema(schema) || isLogicalTypeSchema(schema)) {
        writer.line();
        generateResourceTypePredicate(writer, schema);
    }
}

/**
 * Generate a single field
 */
function generateField(
    writer: Writer,
    _tsIndex: TypeSchemaIndex,
    schema: RegularTypeSchema,
    fieldName: string,
    field: RegularField,
): void {
    writer.debugComment(fieldName, ":", field);

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
    writer.lineSM(`${tsName}${optionalSymbol}: ${tsType}${arraySymbol}`);

    // Add field extension for primitives in resources/complex-types
    if (["resource", "complex-type"].includes(schema.identifier.kind)) {
        addFieldExtension(writer, fieldName, field);
    }
}

/**
 * Add field extension metadata (for primitive type extensions)
 */
function addFieldExtension(writer: Writer, fieldName: string, field: RegularField): void {
    if (field.type.kind === "primitive-type") {
        const extFieldName = tsFieldName(`_${fieldName}`);
        writer.lineSM(`${extFieldName}?: Element`);
    }
}

/**
 * Generate nested types
 */
export function generateNestedTypes(writer: Writer, tsIndex: TypeSchemaIndex, schema: RegularTypeSchema): void {
    if (!schema.nested || schema.nested.length === 0) {
        return;
    }

    for (const nested of schema.nested) {
        generateType(writer, tsIndex, nested);
        writer.line();
    }
}

/**
 * Generate type predicate function for resource type checking
 */
function generateResourceTypePredicate(writer: Writer, schema: RegularTypeSchema): void {
    if (!isResourceTypeSchema(schema) && !isLogicalTypeSchema(schema)) return;

    const name = tsResourceName(schema.identifier);
    const resourceTypeName = schema.identifier.name;

    writer.curlyBlock(["export", "function", `is${name}(resource: any): resource is ${name}`], () => {
        writer.lineSM(`return resource?.resourceType === "${resourceTypeName}"`);
    });
}
