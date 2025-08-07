/**
 * TypeSchema Core Module
 *
 * Main entry point for the TypeSchema library providing a unified API
 * for FHIR-to-TypeSchema generation, parsing, validation, and transformation.
 */

// Re-export core dependencies
export { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
export type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
// Re-export validation utilities
export {
	isValidatorAvailable,
	validateTypeSchema as validateTypeSchemaCore,
	validateTypeSchemaOrThrow as validateTypeSchemaOrThrowCore,
	validateTypeSchemas as validateTypeSchemasCore,
} from "../core/validation/typeschema-validator";
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
// Re-export utility functions
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
// Re-export transformation utilities
export {
	transformFHIRSchema,
	transformFHIRSchemas,
} from "./core/transformer";
// Export generator functionality
export {
	generateTypeSchemaFromPackage,
	generateTypeSchemaFromSchema,
	generateTypeSchemaFromSchemas,
	TypeSchemaGenerator,
} from "./generator";
// Export parser functionality
export {
	parseTypeSchemaFromFile,
	parseTypeSchemaFromFiles,
	parseTypeSchemaFromString,
	TypeSchemaParser,
} from "./parser";
export { transformProfile } from "./profile/processor";
// Export transformer functionality
export {
	generateTypeScriptFiles,
	TypeScriptTransformer,
	transformTypeSchemasToTypeScript,
	transformTypeSchemaToTypeScript,
} from "./transformer";
// Export all types and interfaces
export * from "./types";
// Export validator functionality
export {
	TypeSchemaValidator,
	validateTypeSchema,
	validateTypeSchemaOrThrow,
	validateTypeSchemas,
	validateTypeSchemasWithDependencies,
} from "./validator";
export { transformValueSet } from "./value-set/processor";

/**
 * TypeSchema API class
 *
 * High-level API that combines all TypeSchema functionality into a single,
 * easy-to-use interface for common workflows.
 */
export class TypeSchemaAPI {
	private generator: TypeSchemaGenerator;
	private parser: TypeSchemaParser;
	private validator: TypeSchemaValidator;
	private transformer: TypeScriptTransformer;
	private cache: TypeSchemaCache;

	constructor(
		options: {
			generator?: import("./generator").GeneratorOptions;
			parser?: import("./parser").ParserOptions;
			validator?: { strict?: boolean };
			transformer?: import("./transformer").TypeScriptGeneratorOptions;
			cache?: import("./cache").CacheOptions;
		} = {},
	) {
		this.generator = new TypeSchemaGenerator(options.generator);
		this.parser = new TypeSchemaParser(options.parser);
		this.validator = new TypeSchemaValidator(options.validator?.strict);
		this.transformer = new TypeScriptTransformer(options.transformer);
		this.cache = new TypeSchemaCache(options.cache);
	}

	/**
	 * Complete workflow: Generate TypeSchema from FHIR package and convert to TypeScript
	 */
	async generateTypesFromPackage(
		packageName: string,
		outputDir: string,
		packageVersion?: string,
	): Promise<void> {
		// Generate TypeSchema
		const schemas = await this.generator.generateFromPackage(
			packageName,
			packageVersion,
		);

		// Cache generated schemas
		this.cache.setMany(schemas);

		// Validate schemas
		const validationResult =
			await this.validator.validateWithDependencies(schemas);
		if (!validationResult.valid) {
			throw new Error(
				`Validation failed: ${validationResult.errors.map((e) => e.message).join(", ")}`,
			);
		}

		// Transform to TypeScript
		await this.transformer.generateToFiles(schemas);
	}

	/**
	 * Complete workflow: Parse TypeSchema files and convert to TypeScript
	 */
	async generateTypesFromFiles(
		inputFiles: string[],
		outputDir: string,
	): Promise<void> {
		// Parse TypeSchema files
		const schemas = await this.parser.parseFromFiles(inputFiles);

		// Cache parsed schemas
		this.cache.setMany(schemas);

		// Validate schemas
		const validationResult =
			await this.validator.validateWithDependencies(schemas);
		if (!validationResult.valid) {
			throw new Error(
				`Validation failed: ${validationResult.errors.map((e) => e.message).join(", ")}`,
			);
		}

		// Set output directory and transform to TypeScript
		this.transformer.setOptions({ outputDir });
		await this.transformer.generateToFiles(schemas);
	}

	/**
	 * Validate TypeSchema files
	 */
	async validateFiles(
		filePaths: string[],
	): Promise<import("./validator").ValidationResult> {
		const schemas = await this.parser.parseFromFiles(filePaths);
		return await this.validator.validateWithDependencies(schemas);
	}

	/**
	 * Get the generator instance
	 */
	getGenerator(): TypeSchemaGenerator {
		return this.generator;
	}

	/**
	 * Get the parser instance
	 */
	getParser(): TypeSchemaParser {
		return this.parser;
	}

	/**
	 * Get the validator instance
	 */
	getValidator(): TypeSchemaValidator {
		return this.validator;
	}

	/**
	 * Get the transformer instance
	 */
	getTransformer(): TypeScriptTransformer {
		return this.transformer;
	}

	/**
	 * Get the cache instance
	 */
	getCache(): TypeSchemaCache {
		return this.cache;
	}

	/**
	 * Clear all caches
	 */
	clearCache(): void {
		this.cache.clear();
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
 * Convenience function for the most common workflow
 */
export async function generateTypesFromPackage(
	packageName: string,
	outputDir: string,
	packageVersion?: string,
): Promise<void> {
	const api = createTypeSchemaAPI({
		transformer: { outputDir },
	});

	await api.generateTypesFromPackage(packageName, outputDir, packageVersion);
}

/**
 * Convenience function for parsing and generating from files
 */
export async function generateTypesFromFiles(
	inputFiles: string[],
	outputDir: string,
): Promise<void> {
	const api = createTypeSchemaAPI({
		transformer: { outputDir },
	});

	await api.generateTypesFromFiles(inputFiles, outputDir);
}
