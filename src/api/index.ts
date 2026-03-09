/**
 * High-Level API Module
 *
 * Main entry point for the atomic-codegen high-level API.
 * Provides convenient access to all generators and utilities.
 *
 * @packageDocumentation
 */

export type { IrConf, LogicalPromotionConf, TreeShakeConf } from "../typeschema/ir/types";
export type { Log, LogEntry, LogLevel, LogManager } from "../utils/log";
export { mkLogger } from "../utils/log";
export type { CodegenLog, CodegenLogManager, CodegenTag } from "../utils/types";
export { mkCodegenLogger } from "../utils/types";
export type { APIBuilderOptions, LocalStructureDefinitionConfig } from "./builder";
export { APIBuilder, prettyReport } from "./builder";
export type { CSharpGeneratorOptions } from "./writer-generator/csharp/csharp";
export type { TypeScriptOptions } from "./writer-generator/typescript/writer";
