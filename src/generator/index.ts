/**
 * Generator Module
 * 
 * Main entry point for FHIR type generation
 */

export { BaseGenerator, GeneratorOptions } from './base';
export { SchemaLoader, LoadedSchemas, LoaderOptions } from './loader';
export { TypeScriptGenerator, TypeScriptGeneratorOptions } from './typescript';

import { TypeScriptGenerator, TypeScriptGeneratorOptions } from './typescript';

/**
 * Generate TypeScript types from FHIR schemas
 */
export async function generateTypes(options: TypeScriptGeneratorOptions): Promise<void> {
  const generator = new TypeScriptGenerator(options);
  await generator.generate();
}

/**
 * Convenience function for generating types with default options
 */
export async function generateTypesFromPackage(
  outputDir: string,
  packagePath?: string,
  verbose = false
): Promise<void> {
  await generateTypes({
    outputDir,
    packagePath,
    verbose
  });
}