/**
 * Built-in Generator Registration
 *
 * Registers all built-in generators with the registry system
 */

import { PythonGenerator } from "../../generators/python/generator";
import { TypeScriptGenerator } from "../../generators/typescript/generator";
import type { GeneratorOptions } from "./base";
import { defaultRegistry } from "./generator-registry";
import type { GeneratorFactory, GeneratorMetadata } from "./registry";

/**
 * TypeScript generator metadata
 */
export const typescriptGeneratorMetadata: GeneratorMetadata = {
	id: "typescript",
	name: "TypeScript Generator",
	target: "typescript",
	version: "1.0.0",
	description:
		"Generates TypeScript types and interfaces from TypeSchema definitions",
	author: "Atomic EHR Team",
	supportedInputs: [".json", ".ndjson"],
	supportedOutputs: [".ts"],
	builtin: true,
};

/**
 * TypeScript generator factory
 */
export const createTypeScriptGenerator: GeneratorFactory = (
	options: GeneratorOptions,
) => {
	return new TypeScriptGenerator(options);
};

/**
 * Python generator metadata
 */
export const pythonGeneratorMetadata: GeneratorMetadata = {
	id: "python",
	name: "Python Generator",
	target: "python",
	version: "1.0.0",
	description:
		"Generates Python dataclasses and type hints from TypeSchema definitions",
	author: "Atomic EHR Team",
	supportedInputs: [".json", ".ndjson"],
	supportedOutputs: [".py"],
	builtin: true,
};

/**
 * Python generator factory
 */
export const createPythonGenerator: GeneratorFactory = (
	options: GeneratorOptions,
) => {
	return new PythonGenerator(options);
};

/**
 * Register all built-in generators
 */
export function registerBuiltinGenerators(): void {
	// Register TypeScript generator
	defaultRegistry.register(
		typescriptGeneratorMetadata,
		createTypeScriptGenerator,
	);

	// Register Python generator
	defaultRegistry.register(pythonGeneratorMetadata, createPythonGenerator);
}

/**
 * Get all built-in generator metadata
 */
export function getBuiltinGenerators(): GeneratorMetadata[] {
	return [typescriptGeneratorMetadata, pythonGeneratorMetadata];
}

/**
 * Check if a generator ID is a built-in generator
 */
export function isBuiltinGenerator(id: string): boolean {
	return getBuiltinGenerators().some((metadata) => metadata.id === id);
}
