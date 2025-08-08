/**
 * TypeSchema Core Module
 *
 * Main entry point for the TypeSchema library providing core functions
 * for FHIR-to-TypeSchema generation, parsing, and validation.
 *
 * This module focuses on:
 * - Converting FHIR to TypeSchema format
 * - Reading TypeSchema documents
 * - Validating TypeSchema documents
 */

import { TypeSchemaCache } from "./cache";
import { TypeSchemaGenerator } from "./generator";
import { TypeSchemaParser } from "./parser";
import type { AnyTypeSchemaCompliant, ParserOptions } from "./types.ts";

// Re-export core dependencies
export { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
export type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";

// Export cache functionality
export {
	cacheSchema,
	clearGlobalCache,
	getCachedSchema,
	getGlobalCache,
	initializeGlobalCache,
	isCached,
	TypeSchemaCache,
} from "./cache";

// Re-export utility functions for FHIR processing
export {
	buildEnum,
	collectBindingSchemas,
	extractValueSetConcepts,
	generateBindingSchema,
} from "./core/binding";
export {
	buildField,
	buildNestedField,
	getElementHierarchy,
	isExcluded,
	isNestedElement,
	isRequired,
	mergeElementHierarchy,
} from "./core/field-builder";
export {
	buildBindingIdentifier,
	buildNestedIdentifier,
	buildSchemaIdentifier,
	buildValueSetIdentifier,
	dropVersionFromUrl,
} from "./core/identifier";
export {
	buildNestedTypes,
	collectNestedElements,
	extractNestedDependencies,
} from "./core/nested-types";

// Re-export FHIR transformation utilities
export {
	transformFHIRSchema,
	transformFHIRSchemas,
} from "./core/transformer";

// Export generator functionality (FHIR -> TypeSchema)
export {
	generateTypeSchemaFromPackage,
	generateTypeSchemaFromSchema,
	generateTypeSchemaFromSchemas,
	TypeSchemaGenerator,
} from "./generator";

// Export parser functionality (Read TypeSchema)
export {
	parseTypeSchemaFromFile,
	parseTypeSchemaFromFiles,
	parseTypeSchemaFromString,
	TypeSchemaParser,
} from "./parser";

// Export profile processing
export { transformProfile } from "./profile/processor";

// Export all types and interfaces
export * from "./types";

// Export value set processing
export { transformValueSet } from "./value-set/processor";

/**
 * TypeSchema Core API class
 *
 * Provides core TypeSchema functionality: convert, read, and validate.
 * Does NOT include target-specific generation (like TypeScript generation).
 * Use target generators in src/api/generators/ for output generation.
 */
export class TypeSchemaAPI {
	private generator: TypeSchemaGenerator;
	private parser: TypeSchemaParser;
	private cache: TypeSchemaCache;

	constructor(
		options: {
			generator?: any;
			parser?: ParserOptions;
			validator?: { strict?: boolean };
		} = {},
	) {
		this.generator = new TypeSchemaGenerator(options.generator);
		this.parser = new TypeSchemaParser(options.parser);
		this.cache = new TypeSchemaCache();
	}

	/**
	 * Convert FHIR package to TypeSchema
	 */
	async generateFromPackage(
		packageName: string,
		packageVersion?: string,
	): Promise<import("./types").AnyTypeSchemaCompliant[]> {
		const schemas = await this.generator.generateFromPackage(
			packageName,
			packageVersion,
		);

		// Cache generated schemas
		this.cache.setMany(schemas);

		return schemas;
	}

	/**
	 * Parse TypeSchema from files
	 */
	async parseFromFiles(
		inputFiles: string[],
	): Promise<AnyTypeSchemaCompliant[]> {
		const schemas = await this.parser.parseFromFiles(inputFiles);

		// Cache parsed schemas
		this.cache.setMany(schemas);

		return schemas;
	}
}

/**
 * Create a new TypeSchema API instance
 */
export function createTypeSchemaAPI(
	options?: ConstructorParameters<typeof TypeSchemaAPI>[0],
): TypeSchemaAPI {
	return new TypeSchemaAPI(options);
}

/**
 * Convenience function to convert FHIR package to TypeSchema
 */
export async function generateTypeSchemaFromPackageCore(
	packageName: string,
	packageVersion?: string,
): Promise<import("./types").AnyTypeSchemaCompliant[]> {
	const api = createTypeSchemaAPI();
	return await api.generateFromPackage(packageName, packageVersion);
}

/**
 * Convenience function to parse TypeSchema from files
 */
export async function parseTypeSchemaFromFilesCore(
	inputFiles: string[],
): Promise<import("./types").AnyTypeSchemaCompliant[]> {
	const api = createTypeSchemaAPI();
	return await api.parseFromFiles(inputFiles);
}
