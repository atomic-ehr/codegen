/**
 * FHIR Guard Generator
 *
 * Main generator class that coordinates the creation of all FHIR type guards,
 * discriminators, and validation utilities.
 */

import type { AnyTypeSchema, PackageInfo } from "../../typeschema/lib-types";
import { generateChoiceTypeDiscriminators } from "./discriminators";
import { generateCustomPredicates } from "./predicates";
import { generatePrimitiveTypeGuards } from "./primitives";
import {
	generateComplexTypeGuards,
	generateFieldTypeGuards,
	generateNestedTypeGuards,
	generateResourceTypeGuards,
} from "./resources";
import type {
	GuardGenerationContext,
	GuardGenerationOptions,
	TypeGuardMetadata,
	TypeGuardResult,
} from "./types";

/**
 * Main FHIR type guard generator
 */
export class FHIRGuardGenerator {
	private options: GuardGenerationOptions;

	constructor(options: GuardGenerationOptions = {}) {
		this.options = {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			targetTSVersion: "5.0",
			strict: false,
			includeNullChecks: true,
			...options,
		};
	}

	/**
	 * Generate all type guards from TypeSchemas
	 */
	async generateFromTypeSchemas(
		schemas: AnyTypeSchema[],
		packageInfo?: PackageInfo,
	): Promise<TypeGuardResult> {
		const context: GuardGenerationContext = {
			schemas,
			options: this.options,
			guardCache: new Map(),
			processing: new Set(),
		};

		const results: TypeGuardResult[] = [];
		const allImports = new Set<string>();
		const allDependencies = new Set<string>();

		// Generate resource type guards
		if (this.options.verbose) {
			console.log("Generating resource type guards...");
		}
		const resourceResult = generateResourceTypeGuards(schemas, context);
		results.push(resourceResult);

		// Generate complex type guards
		if (this.options.verbose) {
			console.log("Generating complex type guards...");
		}
		const complexResult = generateComplexTypeGuards(schemas, context);
		results.push(complexResult);

		// Generate primitive type guards
		if (this.options.verbose) {
			console.log("Generating primitive type guards...");
		}
		const primitiveResult = generatePrimitiveTypeGuards(schemas, context);
		results.push(primitiveResult);

		// Generate choice type discriminators
		if (this.options.verbose) {
			console.log("Generating choice type discriminators...");
		}
		const choiceResult = generateChoiceTypeDiscriminators(schemas, context);
		results.push(choiceResult);

		// Generate custom predicates
		if (this.options.verbose) {
			console.log("Generating custom predicates...");
		}
		const predicateResult = generateCustomPredicates(schemas, context);
		results.push(predicateResult);

		// Combine all results
		const guardCode = results
			.map((r) => r.guardCode)
			.filter(Boolean)
			.join("\n\n");
		const typeDefinitions = results
			.map((r) => r.typeDefinitions)
			.filter(Boolean)
			.join("\n\n");

		// Collect all imports and dependencies
		results.forEach((result) => {
			result.imports.forEach((imp) => allImports.add(imp));
			result.dependencies.forEach((dep) => allDependencies.add(dep));
		});

		// Generate header with package info
		const header = this.generateHeader(packageInfo);
		const imports = this.generateImports(Array.from(allImports));

		const finalCode = [header, imports, typeDefinitions, guardCode]
			.filter(Boolean)
			.join("\n\n");

		return {
			guardCode: finalCode,
			typeDefinitions,
			imports: Array.from(allImports),
			dependencies: Array.from(allDependencies),
		};
	}

	/**
	 * Generate type guards for a specific FHIR package
	 */
	async generateFromPackage(
		packageName: string,
		packageVersion?: string,
	): Promise<TypeGuardResult> {
		// This would typically load schemas from the package
		// For now, return a placeholder
		throw new Error(
			"generateFromPackage not implemented - use generateFromTypeSchemas instead",
		);
	}

	/**
	 * Generate metadata about the generated guards
	 */
	generateMetadata(
		schemas: AnyTypeSchema[],
		result: TypeGuardResult,
	): TypeGuardMetadata[] {
		return schemas.map((schema) => ({
			sourceSchema: schema,
			generatedAt: new Date(),
			tsVersion: this.options.targetTSVersion || "5.0",
			performance: {
				complexity: this.estimateComplexity(schema),
				treeShakeable: this.options.treeShakeable || false,
				estimatedSize: this.estimateSize(result.guardCode),
			},
		}));
	}

	/**
	 * Generate file header with package and generation info
	 */
	private generateHeader(packageInfo?: PackageInfo): string {
		const timestamp = new Date().toISOString();
		const packageLine = packageInfo
			? `\n * Generated from: ${packageInfo.name}@${packageInfo.version}`
			: "";

		return `/**
 * FHIR Type Guards and Validation${packageLine}
 * 
 * Auto-generated type guards for FHIR resources and types.
 * Generated at: ${timestamp}
 * 
 * WARNING: This file is auto-generated. Do not modify manually.
 */

/* eslint-disable */
// @ts-nocheck`;
	}

	/**
	 * Generate import statements
	 */
	private generateImports(imports: string[]): string {
		if (imports.length === 0) return "";

		const importLines = imports.map(
			(imp) => `import { ${imp} } from './types';`,
		);
		return importLines.join("\n");
	}

	/**
	 * Estimate complexity of a schema for performance metadata
	 */
	private estimateComplexity(schema: AnyTypeSchema): "O(1)" | "O(n)" | "O(n²)" {
		if ("fields" in schema && schema.fields) {
			const fieldCount = Object.keys(schema.fields).length;
			if (fieldCount > 20) return "O(n²)";
			if (fieldCount > 5) return "O(n)";
		}
		return "O(1)";
	}

	/**
	 * Estimate size of generated code
	 */
	private estimateSize(code: string): number {
		return Buffer.byteLength(code, "utf8");
	}
}

/**
 * Convenience function to generate all type guards
 */
export async function generateAllTypeGuards(
	schemas: AnyTypeSchema[],
	options: GuardGenerationOptions = {},
	packageInfo?: PackageInfo,
): Promise<TypeGuardResult> {
	const generator = new FHIRGuardGenerator(options);
	return generator.generateFromTypeSchemas(schemas, packageInfo);
}

/**
 * Generate guards for a specific resource type
 */
export function generateResourceGuards(
	resourceSchemas: AnyTypeSchema[],
	options: GuardGenerationOptions = {},
): TypeGuardResult {
	const context: GuardGenerationContext = {
		schemas: resourceSchemas,
		options: {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			...options,
		},
		guardCache: new Map(),
		processing: new Set(),
	};

	return generateResourceTypeGuards(resourceSchemas, context);
}

/**
 * Generate guards for primitive types only
 */
export function generatePrimitiveGuards(
	primitiveSchemas: AnyTypeSchema[],
	options: GuardGenerationOptions = {},
): TypeGuardResult {
	const context: GuardGenerationContext = {
		schemas: primitiveSchemas,
		options: {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			...options,
		},
		guardCache: new Map(),
		processing: new Set(),
	};

	return generatePrimitiveTypeGuards(primitiveSchemas, context);
}

/**
 * Generate choice type discriminators only
 */
export function generateChoiceGuards(
	schemas: AnyTypeSchema[],
	options: GuardGenerationOptions = {},
): TypeGuardResult {
	const context: GuardGenerationContext = {
		schemas,
		options: {
			includeRuntimeValidation: true,
			includeErrorMessages: true,
			treeShakeable: true,
			...options,
		},
		guardCache: new Map(),
		processing: new Set(),
	};

	return generateChoiceTypeDiscriminators(schemas, context);
}
