import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import type { NestedType, RegularTypeSchema, TypeSchema } from "@root/typeschema/types";
import { tsResourceName } from "./utils";

/**
 * Generate nested type definitions
 */
export function generateNestedTypes(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	schema: RegularTypeSchema,
): void {
	if (!schema.nested || schema.nested.length === 0) {
		return;
	}

	for (const nested of schema.nested) {
		generateNestedType(writer, tsIndex, nested);
		writer.line();
	}
}

/**
 * Generate a single nested type
 * This is imported from resource.ts to avoid circular dependencies
 */
function generateNestedType(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	nested: NestedType,
): void {
	const typeName = tsResourceName(nested.identifier);

	writer.comment(`Nested type: ${typeName}`);

	// Import generateType from resource.ts would create circular dependency
	// So we'll handle this in resource.ts instead
	// For now, just mark it needs to be generated
	writer.debugComment("Nested type", nested);
}
