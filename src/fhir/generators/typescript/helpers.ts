/**
 * Helper Types Generator for Common FHIR Patterns
 */

import type { AnyTypeSchema } from "../../../typeschema/types";
import type { InterfaceGeneratorOptions } from "./enhanced-interfaces";

export function generateHelperTypes(
	schemas: AnyTypeSchema[],
	options: InterfaceGeneratorOptions,
): string {
	const helperTypes: string[] = [];
	const resourceSchemas = schemas.filter(isResourceSchema);

	if (resourceSchemas.length === 0) return "";

	helperTypes.push("// Helper types for common FHIR patterns");
	helperTypes.push("");

	// Generate create/update types
	if (options.generatePartialTypes || options.generateRequiredTypes) {
		const createUpdateTypes = generateCreateUpdateTypes(
			resourceSchemas,
			options,
		);
		if (createUpdateTypes) {
			helperTypes.push(createUpdateTypes);
		}
	}

	return helperTypes.join("\n");
}

function generateCreateUpdateTypes(
	schemas: AnyTypeSchema[],
	options: InterfaceGeneratorOptions,
): string {
	const types: string[] = [];

	for (const schema of schemas) {
		const resourceName = formatTypeName(schema.identifier.name);

		if (options.generatePartialTypes) {
			types.push(
				`export type Create${resourceName} = Omit<${resourceName}, 'id' | 'meta'>;`,
			);
		}

		if (options.generateRequiredTypes) {
			types.push(
				`export type Update${resourceName} = Partial<${resourceName}> & { id: string };`,
			);
		}
	}

	return types.join("\n");
}

function isResourceSchema(schema: AnyTypeSchema): boolean {
	return schema.identifier?.kind === "resource";
}

function formatTypeName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}
