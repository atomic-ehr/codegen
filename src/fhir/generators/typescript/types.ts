/**
 * Branded Types Generator for Type-Safe FHIR IDs
 *
 * Generates branded types that prevent mixing of incompatible ID types,
 * providing compile-time type safety for FHIR resource references.
 */

import type { AnyTypeSchema } from "../../../typeschema/types";
import type { InterfaceGeneratorOptions } from "./enhanced-interfaces";

/**
 * Generate branded types for all resource schemas
 */
export function generateBrandedTypes(
	schemas: AnyTypeSchema[],
	options: InterfaceGeneratorOptions,
): string {
	if (!options.useBrandedTypes) return "";

	const brandedTypes: string[] = [];
	const resourceSchemas = schemas.filter(isResourceSchema);

	if (resourceSchemas.length === 0) return "";

	// Add header comment
	brandedTypes.push("// Branded ID types for type-safe resource identifiers");
	brandedTypes.push(
		"// These types prevent accidental mixing of different resource IDs",
	);
	brandedTypes.push("");

	// Generate branded ID types for each resource
	for (const schema of resourceSchemas) {
		const typeName = formatTypeName(schema.identifier.name);
		const brandedId = generateBrandedIdType(typeName);
		brandedTypes.push(brandedId);
	}

	// Add utility types if there are multiple resources
	if (resourceSchemas.length > 1) {
		brandedTypes.push("");
		brandedTypes.push(generateUtilityTypes(resourceSchemas));
	}

	return brandedTypes.join("\n");
}

/**
 * Generate a branded ID type for a resource
 */
function generateBrandedIdType(resourceName: string): string {
	const parts: string[] = [];

	// Generate JSDoc documentation
	parts.push(`/**`);
	parts.push(` * Branded ID type for ${resourceName} resources`);
	parts.push(` * `);
	parts.push(
		` * This branded type prevents accidental mixing of different resource IDs:`,
	);
	parts.push(` * - Provides compile-time type safety`);
	parts.push(` * - Prevents assignment of one resource ID to another`);
	parts.push(` * - Maintains runtime compatibility with string`);
	parts.push(` * `);
	parts.push(` * @example`);
	parts.push(` * \`\`\`typescript`);
	parts.push(` * const patientId: PatientId = 'patient-123' as PatientId;`);
	parts.push(
		` * const organizationId: OrganizationId = patientId; // TypeScript error!`,
	);
	parts.push(` * \`\`\``);
	parts.push(` */`);

	// Generate the branded type
	parts.push(
		`export type ${resourceName}Id = string & { readonly __brand: '${resourceName}Id' };`,
	);

	return parts.join("\n");
}

/**
 * Generate utility types for working with branded IDs
 */
function generateUtilityTypes(schemas: AnyTypeSchema[]): string {
	const parts: string[] = [];
	const resourceNames = schemas.map((schema) =>
		formatTypeName(schema.identifier.name),
	);

	// Generate union type for all resource IDs
	parts.push(`/**`);
	parts.push(` * Union type for all FHIR resource IDs`);
	parts.push(` */`);
	const idUnion = resourceNames.map((name) => `${name}Id`).join(" | ");
	parts.push(`export type AnyResourceId = ${idUnion};`);
	parts.push("");

	// Generate type guard functions
	parts.push(`/**`);
	parts.push(` * Type guard functions for resource IDs`);
	parts.push(` */`);
	parts.push(`export const ResourceIdGuards = {`);

	for (let i = 0; i < resourceNames.length; i++) {
		const resourceName = resourceNames[i];
		const comma = i < resourceNames.length - 1 ? "," : "";

		parts.push(`  /**`);
		parts.push(`   * Check if a string is a valid ${resourceName}Id`);
		parts.push(`   */`);
		parts.push(`  is${resourceName}Id(id: string): id is ${resourceName}Id {`);
		parts.push(
			`    // In a real implementation, this could validate the ID format`,
		);
		parts.push(`    return typeof id === 'string' && id.length > 0;`);
		parts.push(`  }${comma}`);

		if (i < resourceNames.length - 1) {
			parts.push("");
		}
	}

	parts.push("} as const;");
	parts.push("");

	// Generate casting functions
	parts.push(`/**`);
	parts.push(` * Safe casting functions for resource IDs`);
	parts.push(` */`);
	parts.push(`export const ResourceIdCasters = {`);

	for (let i = 0; i < resourceNames.length; i++) {
		const resourceName = resourceNames[i];
		const comma = i < resourceNames.length - 1 ? "," : "";

		parts.push(`  /**`);
		parts.push(
			`   * Safely cast a string to ${resourceName}Id with validation`,
		);
		parts.push(`   */`);
		parts.push(`  to${resourceName}Id(id: string): ${resourceName}Id {`);
		parts.push(`    if (!ResourceIdGuards.is${resourceName}Id(id)) {`);
		parts.push(`      throw new Error(\`Invalid ${resourceName}Id: \${id}\`);`);
		parts.push(`    }`);
		parts.push(`    return id as ${resourceName}Id;`);
		parts.push(`  }${comma}`);

		if (i < resourceNames.length - 1) {
			parts.push("");
		}
	}

	parts.push("} as const;");
	parts.push("");

	// Generate extraction utilities
	parts.push(`/**`);
	parts.push(` * Utilities for working with resource references`);
	parts.push(` */`);
	parts.push(`export const ResourceIdUtils = {`);
	parts.push(`  /**`);
	parts.push(`   * Extract resource ID from a FHIR reference string`);
	parts.push(
		`   * @param reference - Reference string like "Patient/123" or "Organization/abc"`,
	);
	parts.push(`   * @returns Object with resourceType and id`);
	parts.push(`   */`);
	parts.push(
		`  parseReference(reference: string): { resourceType: string; id: string } | null {`,
	);
	parts.push(`    const match = reference.match(/^([A-Za-z]+)\\/(.+)$/);`);
	parts.push(`    if (!match) return null;`);
	parts.push(`    return { resourceType: match[1], id: match[2] };`);
	parts.push(`  },`);
	parts.push("");
	parts.push(`  /**`);
	parts.push(`   * Create a reference string from resource type and ID`);
	parts.push(`   * @param resourceType - The FHIR resource type`);
	parts.push(`   * @param id - The resource ID`);
	parts.push(`   * @returns Reference string like "Patient/123"`);
	parts.push(`   */`);
	parts.push(
		`  createReference(resourceType: string, id: AnyResourceId): string {`,
	);
	parts.push(`    return \`\${resourceType}/\${id}\`;`);
	parts.push(`  }`);
	parts.push("} as const;");

	return parts.join("\n");
}

/**
 * Generate nominal types (alternative to branded types)
 */
export function generateNominalTypes(
	schemas: AnyTypeSchema[],
	options: InterfaceGeneratorOptions,
): string {
	if (!options.useNominalTypes) return "";

	const nominalTypes: string[] = [];
	const resourceSchemas = schemas.filter(isResourceSchema);

	if (resourceSchemas.length === 0) return "";

	// Add header comment
	nominalTypes.push("// Nominal ID types for type-safe resource identifiers");
	nominalTypes.push("// These types use unique symbols to prevent mixing");
	nominalTypes.push("");

	// Generate unique symbols
	nominalTypes.push("// Unique symbols for nominal typing");
	for (const schema of resourceSchemas) {
		const resourceName = formatTypeName(schema.identifier.name);
		nominalTypes.push(`declare const ${resourceName}IdSymbol: unique symbol;`);
	}
	nominalTypes.push("");

	// Generate nominal ID types
	for (const schema of resourceSchemas) {
		const resourceName = formatTypeName(schema.identifier.name);
		nominalTypes.push(`/**`);
		nominalTypes.push(` * Nominal ID type for ${resourceName} resources`);
		nominalTypes.push(` */`);
		nominalTypes.push(
			`export type ${resourceName}Id = string & { [${resourceName}IdSymbol]: true };`,
		);
	}

	return nominalTypes.join("\n");
}

/**
 * Generate literal types for fixed values
 */
export function generateLiteralTypes(
	schemas: AnyTypeSchema[],
	options: InterfaceGeneratorOptions,
): string {
	if (!options.useLiteralTypes) return "";

	const literalTypes: string[] = [];

	// Generate resourceType literal types
	const resourceSchemas = schemas.filter(isResourceSchema);
	if (resourceSchemas.length > 0) {
		literalTypes.push("// Resource type literals");

		for (const schema of resourceSchemas) {
			const resourceName = formatTypeName(schema.identifier.name);
			literalTypes.push(`/**`);
			literalTypes.push(` * Literal type for ${resourceName} resourceType`);
			literalTypes.push(` */`);
			literalTypes.push(
				`export type ${resourceName}ResourceType = '${resourceName}';`,
			);
		}

		// Generate union of all resource types
		const resourceTypeUnion = resourceSchemas
			.map((schema) => `'${formatTypeName(schema.identifier.name)}'`)
			.join(" | ");

		literalTypes.push("");
		literalTypes.push(`/**`);
		literalTypes.push(` * Union of all FHIR resource types`);
		literalTypes.push(` */`);
		literalTypes.push(`export type FHIRResourceType = ${resourceTypeUnion};`);
	}

	// Generate status literal types for common enums
	const statusTypes = generateStatusLiteralTypes(schemas);
	if (statusTypes) {
		literalTypes.push("");
		literalTypes.push(statusTypes);
	}

	return literalTypes.join("\n");
}

/**
 * Generate literal types for common status enums
 */
function generateStatusLiteralTypes(_schemas: AnyTypeSchema[]): string {
	const statusTypes: string[] = [];
	const commonStatuses: Record<string, string[]> = {
		ObservationStatus: [
			"registered",
			"preliminary",
			"final",
			"amended",
			"corrected",
			"cancelled",
			"entered-in-error",
			"unknown",
		],
		EncounterStatus: [
			"planned",
			"arrived",
			"triaged",
			"in-progress",
			"onleave",
			"finished",
			"cancelled",
		],
		RequestStatus: [
			"draft",
			"active",
			"on-hold",
			"revoked",
			"completed",
			"entered-in-error",
			"unknown",
		],
		PublicationStatus: ["draft", "active", "retired", "unknown"],
	};

	statusTypes.push("// Common status literal types");

	for (const [statusName, values] of Object.entries(commonStatuses)) {
		const literalValues = values.map((v) => `'${v}'`).join(" | ");
		statusTypes.push(`/**`);
		statusTypes.push(` * ${statusName} literal type`);
		statusTypes.push(` */`);
		statusTypes.push(`export type ${statusName} = ${literalValues};`);
	}

	return statusTypes.join("\n");
}

/**
 * Type guard to check if schema is a resource schema
 */
function isResourceSchema(schema: AnyTypeSchema): boolean {
	return schema.identifier?.kind === "resource";
}

/**
 * Format type name to PascalCase
 */
function formatTypeName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}
