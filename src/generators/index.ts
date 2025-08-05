/**
 * Code Generators
 *
 * Entry point for all language-specific code generators
 */

// Base generator functionality (re-export from lib)
export * from "../lib/generators";

// Language-specific generators
export * from "./typescript";

import type { TypeScriptGeneratorOptions } from "./typescript";
// Convenience functions
import { TypeScriptGenerator } from "./typescript";

/**
 * Generate TypeScript types from FHIR schemas
 */
export async function generateTypes(
	options: TypeScriptGeneratorOptions,
): Promise<void> {
	const generator = new TypeScriptGenerator(options);
	await generator.generate();
}

/**
 * Convenience function for generating types with default options
 */
export async function generateTypesFromPackage(
	outputDir: string,
	packagePath?: string,
	verbose = false,
): Promise<void> {
	await generateTypes({
		outputDir,
		packagePath,
		verbose,
	});
}
