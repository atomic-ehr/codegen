/**
 * High-Level API Module
 *
 * Main entry point for the atomic-codegen high-level API.
 * Provides convenient access to all generators and utilities.
 *
 * @packageDocumentation
 */

export type { APIBuilderOptions } from "./builder";
export type { TypeScriptOptions } from "./writer-generator/typescript";
export type { CSharpGeneratorOptions } from "./writer-generator/csharp/csharp";

export { APIBuilder } from "./builder";
