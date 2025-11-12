/**
 * High-Level API Builder
 *
 * Provides a fluent, chainable API for common codegen use cases with pre-built generators.
 * This builder pattern allows users to configure generation in a declarative way.
 */

import * as fs from "node:fs";
import * as afs from "node:fs/promises";
import * as Path from "node:path";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { GeneratedFile } from "@root/api/generators/base/types";
import { CSharp } from "@root/api/writer-generator/csharp/csharp.ts";
import { registerFromManager } from "@root/typeschema/register";
import { mkTypeSchemaIndex, treeShake, type TreeShake } from "@root/typeschema/utils";
import { generateTypeSchemas, TypeSchemaCache, TypeSchemaGenerator, TypeSchemaParser } from "@typeschema/index";
import {
    extractNameFromCanonical,
    npmToPackageMeta,
    packageMetaToFhir,
    packageMetaToNpm,
    type TypeSchema,
} from "@typeschema/types";
import type { Config, TypeSchemaConfig } from "../config";
import { CodegenLogger, createLogger } from "../utils/codegen-logger";
import { TypeScriptGenerator as TypeScriptGeneratorDepricated } from "./generators/typescript";
import * as TS2 from "./writer-generator/typescript";
import type { Writer, WriterOptions } from "./writer-generator/writer";
import type { GeneratorInput } from "./generators/base/BaseGenerator";

/**
 * Configuration options for the API builder
 */
export interface APIBuilderOptions {
    outputDir?: string;
    verbose?: boolean;
    overwrite?: boolean; // FIXME: remove
    cache?: boolean; // FIXME: remove
    cleanOutput?: boolean;
    typeSchemaConfig?: TypeSchemaConfig; // FIXME: remove
    logger?: CodegenLogger;
    manager?: ReturnType<typeof CanonicalManager> | null;
    typeSchemaOutputDir?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
    throwException?: boolean;
    exportTypeTree?: string;
    treeShake?: TreeShake;
}

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (phase: string, current: number, total: number, message?: string) => void;

/**
 * Generation result information
 */
export interface GenerationResult {
    success: boolean;
    outputDir: string;
    filesGenerated: string[];
    errors: string[];
    warnings: string[];
    duration: number;
}

interface Generator {
    generate: (input: GeneratorInput) => Promise<GeneratedFile[]>;
    setOutputDir: (outputDir: string) => void;
    build: (schemas: TypeSchema[]) => Promise<GeneratedFile[]>;
}

const writerToGenerator = (writerGen: Writer): Generator => {
    const getGeneratedFiles = () => {
        return writerGen.writtenFiles().map((fn: string) => {
            return {
                path: Path.normalize(Path.join(writerGen.opts.outputDir, fn)),
                filename: fn.replace(/^.*[\\/]/, ""),
                content: "",
                exports: [],
                size: 0,
                timestamp: new Date(),
            };
        });
    };
    return {
        generate: async ({ index: tsIndex }: GeneratorInput): Promise<GeneratedFile[]> => {
            writerGen.generate(tsIndex);
            return getGeneratedFiles();
        },
        setOutputDir: (outputDir: string) => (writerGen.opts.outputDir = outputDir),
        build: async (_input: unknown) => getGeneratedFiles(),
    };
};

const normalizeFileName = (str: string): string => {
    const res = str.replace(/[^a-zA-Z0-9\-_.@#()]/g, "");
    if (res.length === 0) return "unknown";
    return res;
};

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type APIBuilderConfig = PartialBy<
    Required<APIBuilderOptions>,
    "logger" | "typeSchemaConfig" | "typeSchemaOutputDir" | "exportTypeTree" | "treeShake"
> & {
    cleanOutput: boolean;
};

const cleanup = async (opts: APIBuilderConfig, logger: CodegenLogger): Promise<void> => {
    logger.info(`Cleaning outputs...`);
    try {
        logger.info(`Clean ${opts.outputDir}`);
        fs.rmSync(opts.outputDir, { recursive: true, force: true });
        if (opts.typeSchemaOutputDir) {
            logger.info(`Clean ${opts.typeSchemaOutputDir}`);
            fs.rmSync(opts.typeSchemaOutputDir, {
                recursive: true,
                force: true,
            });
        }
        if (opts.exportTypeTree) {
            logger.info(`Clean ${opts.exportTypeTree}`);
            fs.rmSync(opts.exportTypeTree, {
                recursive: true,
                force: true,
            });
        }
    } catch (error) {
        logger.warn(`Error cleaning output directory: ${error instanceof Error ? error.message : String(error)}`);
    }
};

const writeTypeSchemasToSeparateFiles = async (
    typeSchemas: TypeSchema[],
    outputDir: string,
    logger: CodegenLogger,
): Promise<void> => {
    await afs.mkdir(outputDir, { recursive: true });
    logger.info(`Writing TypeSchema files to ${outputDir}/...`);

    const files: Record<string, string[]> = {};
    for (const ts of typeSchemas) {
        const pkg = {
            name: ts.identifier.package,
            version: ts.identifier.version,
        };
        const pkgPath = normalizeFileName(packageMetaToFhir(pkg));
        const name = normalizeFileName(`${ts.identifier.name}(${extractNameFromCanonical(ts.identifier.url)})`);
        const json = JSON.stringify(ts, null, 2);
        const baseName = Path.join(outputDir, pkgPath, name);
        if (!files[baseName]) files[baseName] = [];
        if (!files[baseName]?.some((e) => e === json)) {
            files[baseName].push(json);
        }
    }

    for (const [baseName, jsons] of Object.entries(files)) {
        await Promise.all(
            jsons.map(async (json, index) => {
                let fullName: string;
                if (index === 0) {
                    fullName = `${baseName}.typeschema.json`;
                } else {
                    fullName = `${baseName}-${index}.typeschema.json`;
                }
                await afs.mkdir(Path.dirname(fullName), { recursive: true });
                await afs.writeFile(fullName, json);
            }),
        );
    }
};

const writeTypeSchemasToSingleFile = async (
    typeSchemas: TypeSchema[],
    outputFile: string,
    logger: CodegenLogger,
): Promise<void> => {
    logger.info(`Writing TypeSchema files to: ${outputFile}`);
    await afs.mkdir(Path.dirname(outputFile), { recursive: true });

    logger.info(`Writing TypeSchemas to one file ${outputFile}...`);

    for (const ts of typeSchemas) {
        const json = JSON.stringify(ts, null, 2);
        await afs.appendFile(outputFile, `${json}\n`);
    }
};

const tryWriteTypeSchema = async (typeSchemas: TypeSchema[], opts: APIBuilderConfig, logger: CodegenLogger) => {
    if (!opts.typeSchemaOutputDir) return;
    try {
        if (Path.extname(opts.typeSchemaOutputDir) === ".ndjson") {
            await writeTypeSchemasToSingleFile(typeSchemas, opts.typeSchemaOutputDir, logger);
        } else {
            await writeTypeSchemasToSeparateFiles(typeSchemas, opts.typeSchemaOutputDir, logger);
        }
        logger.info(`Writing TypeSchema - DONE`);
    } catch (error) {
        logger.error("Failed to write TypeSchema output", error instanceof Error ? error : new Error(String(error)));
        if (opts.throwException) throw error;
    }
};

/**
 * High-Level API Builder class
 *
 * Provides a fluent interface for configuring and executing code generation
 * from FHIR packages or TypeSchema documents.
 */
export class APIBuilder {
    private schemas: TypeSchema[] = [];
    private options: APIBuilderConfig;
    private generators: Map<string, Generator> = new Map();
    private cache?: TypeSchemaCache;
    private pendingOperations: Promise<void>[] = [];
    private typeSchemaGenerator?: TypeSchemaGenerator;
    private logger: CodegenLogger;
    private packages: string[] = [];
    progressCallback: any;
    private typeSchemaConfig?: TypeSchemaConfig;

    constructor(options: APIBuilderOptions = {}) {
        this.options = {
            outputDir: options.outputDir || "./generated",
            verbose: options.verbose ?? false,
            overwrite: options.overwrite ?? true,
            cache: options.cache ?? true,
            cleanOutput: options.cleanOutput ?? true,
            typeSchemaConfig: options.typeSchemaConfig,
            manager: options.manager || null,
            throwException: options.throwException || false,
            typeSchemaOutputDir: options.typeSchemaOutputDir,
            exportTypeTree: options.exportTypeTree,
            treeShake: options.treeShake,
        };

        this.typeSchemaConfig = options.typeSchemaConfig;

        // Use provided logger or create a default one
        this.logger =
            options.logger ||
            createLogger({
                verbose: this.options.verbose,
                prefix: "API",
            });

        if (this.options.cache) {
            this.cache = new TypeSchemaCache(this.typeSchemaConfig);
        }
    }

    fromPackage(packageName: string, version?: string): APIBuilder {
        const pkg = packageMetaToNpm({ name: packageName, version: version || "latest" });
        this.packages.push(pkg);
        return this;
    }

    fromFiles(...filePaths: string[]): APIBuilder {
        this.logger.debug(`Loading from ${filePaths.length} TypeSchema files`);
        const operation = this.loadFromFiles(filePaths);
        this.pendingOperations.push(operation);
        return this;
    }

    fromSchemas(schemas: TypeSchema[]): APIBuilder {
        this.logger.debug(`Adding ${schemas.length} TypeSchemas to generation`);
        this.schemas = [...this.schemas, ...schemas];
        return this;
    }

    typescriptDepricated(
        options: {
            moduleFormat?: "esm" | "cjs";
            generateIndex?: boolean;
            includeDocuments?: boolean;
            namingConvention?: "PascalCase" | "camelCase";
            includeExtensions?: boolean;
            includeProfiles?: boolean;
            generateValueSets?: boolean;
            includeValueSetHelpers?: boolean;
            valueSetStrengths?: ("required" | "preferred" | "extensible" | "example")[];
            valueSetMode?: "all" | "required-only" | "custom";
            valueSetDirectory?: string;
        } = {},
    ): APIBuilder {
        const typesOutputDir = `${this.options.outputDir}/types`;

        const generator = new TypeScriptGeneratorDepricated({
            outputDir: typesOutputDir,
            moduleFormat: options.moduleFormat || "esm",
            generateIndex: options.generateIndex ?? true,
            includeDocuments: options.includeDocuments ?? true,
            namingConvention: options.namingConvention || "PascalCase",
            includeExtensions: options.includeExtensions ?? false,
            includeProfiles: options.includeProfiles ?? false,
            generateValueSets: options.generateValueSets ?? false,
            includeValueSetHelpers: options.includeValueSetHelpers ?? false,
            valueSetStrengths: options.valueSetStrengths ?? ["required"],
            logger: this.logger.child("TS"),
            valueSetMode: options.valueSetMode ?? "required-only",
            valueSetDirectory: options.valueSetDirectory ?? "valuesets",
            verbose: this.options.verbose,
            validate: true, // Enable validation for debugging
            overwrite: this.options.overwrite,
        });

        this.generators.set("typescript", generator);
        this.logger.debug(`Configured TypeScript generator (${options.moduleFormat || "esm"})`);
        return this;
    }

    typescript(opts: Partial<WriterOptions>) {
        const writerOpts = {
            outputDir: Path.join(this.options.outputDir, "/types"),
            tabSize: 4,
            withDebugComment: false,
            commentLinePrefix: "//",
            exportTypeTree: this.options.exportTypeTree,
        };
        const effectiveOpts = { logger: this.logger, ...writerOpts, ...opts };
        const generator = writerToGenerator(new TS2.TypeScript(effectiveOpts));
        this.generators.set("typescript", generator);
        this.logger.debug(`Configured TypeScript generator (${JSON.stringify(effectiveOpts, undefined, 2)})`);
        return this;
    }

    csharp(namespace: string, staticSourceDir?: string | undefined): APIBuilder {
        const generator = writerToGenerator(
            new CSharp({
                outputDir: Path.join(this.options.outputDir, "/types"),
                staticSourceDir: staticSourceDir ?? undefined,
                targetNamespace: namespace,
                logger: new CodegenLogger({
                    prefix: "C#",
                    timestamp: true,
                    verbose: true,
                    suppressLoggingLevel: [],
                }),
            }),
        );
        this.generators.set("C#", generator);
        this.logger.debug(`Configured C# generator`);
        return this;
    }

    /**
     * Set a progress callback for monitoring generation
     */
    onProgress(callback: ProgressCallback): APIBuilder {
        this.progressCallback = callback;
        return this;
    }

    /**
     * Set the output directory for all generators
     */
    outputTo(directory: string): APIBuilder {
        this.logger.debug(`Setting output directory: ${directory}`);
        this.options.outputDir = directory;

        // Update all configured generators
        for (const generator of this.generators.values()) {
            if (generator.setOutputDir) {
                generator.setOutputDir(directory);
            }
        }

        return this;
    }

    verbose(enabled = true): APIBuilder {
        this.options.verbose = enabled;
        this.logger?.configure({ verbose: enabled });
        return this;
    }

    throwException(enabled = true): APIBuilder {
        this.options.throwException = enabled;
        return this;
    }

    cleanOutput(enabled = true): APIBuilder {
        this.options.cleanOutput = enabled;
        return this;
    }

    writeTypeTree(filename: string) {
        this.options.exportTypeTree = filename;
        return this;
    }

    treeShake(tree: TreeShake) {
        this.options.treeShake = tree;
        return this;
    }

    writeTypeSchemas(target: string) {
        this.options.typeSchemaOutputDir = target;
        return this;
    }

    async generate(): Promise<GenerationResult> {
        const startTime = performance.now();
        const result: GenerationResult = {
            success: false,
            outputDir: this.options.outputDir,
            filesGenerated: [],
            errors: [],
            warnings: [],
            duration: 0,
        };

        this.logger.debug(`Starting generation with ${this.generators.size} generators`);
        try {
            if (this.options.cleanOutput) cleanup(this.options, this.logger);

            this.logger.info("Initialize Canonical Manager");
            const manager = CanonicalManager({
                packages: this.packages,
                workingDir: "tmp/fhir",
            });
            await manager.init();
            const register = await registerFromManager(manager, {
                logger: this.logger,
                focusedPackages: this.packages.map(npmToPackageMeta),
            });

            const typeSchemas = await generateTypeSchemas(register, this.logger);
            await tryWriteTypeSchema(typeSchemas, this.options, this.logger);

            let tsIndex = mkTypeSchemaIndex(typeSchemas, this.logger);
            if (this.options.treeShake) tsIndex = treeShake(tsIndex, this.options.treeShake, this.logger);

            if (this.options.exportTypeTree) await tsIndex.exportTree(this.options.exportTypeTree);

            this.logger.debug(`Executing ${this.generators.size} generators`);

            await this.executeGenerators(result, {
                schemas: typeSchemas,
                index: tsIndex,
            });

            this.logger.info("Generation completed successfully");

            result.success = result.errors.length === 0;

            this.logger.debug(`Generation completed: ${result.filesGenerated.length} files`);
        } catch (error) {
            this.logger.error("Code generation failed", error instanceof Error ? error : new Error(String(error)));
            result.errors.push(error instanceof Error ? error.message : String(error));
            if (this.options.throwException) throw error;
        }

        return {
            ...result,
            success: result.errors.length === 0,
            duration: performance.now() - startTime,
        };
    }

    /**
     * Generate and return the results without writing to files
     */
    async build(): Promise<{
        typescript?: { content: string; filename: string }[];
    }> {
        const results: Record<string, unknown> = {};

        for (const [type, generator] of this.generators.entries()) {
            if (generator.build) {
                results[type] = await generator.build(this.schemas);
            }
        }

        return results;
    }

    /**
     * Clear all configuration and start fresh
     */
    reset(): APIBuilder {
        this.schemas = [];
        this.generators.clear();
        this.progressCallback = undefined;
        return this;
    }

    /**
     * Get loaded schemas (for inspection)
     */
    getSchemas(): TypeSchema[] {
        return [...this.schemas];
    }

    /**
     * Get configured generators (for inspection)
     */
    getGenerators(): string[] {
        return Array.from(this.generators.keys());
    }

    private async loadFromFiles(filePaths: string[]): Promise<void> {
        if (!this.typeSchemaGenerator) {
            this.typeSchemaGenerator = new TypeSchemaGenerator(
                {
                    verbose: this.options.verbose,
                    logger: this.logger.child("Schema"),
                    treeshake: this.typeSchemaConfig?.treeshake,
                },
                this.typeSchemaConfig,
            );
        }

        const parser = new TypeSchemaParser({
            format: "auto",
        });

        const schemas = await parser.parseFromFiles(filePaths);
        this.schemas = [...this.schemas, ...schemas];

        if (this.cache) {
            this.cache.setMany(schemas);
        }
    }

    private async executeGenerators(result: GenerationResult, input: GeneratorInput): Promise<void> {
        for (const [type, generator] of this.generators.entries()) {
            this.logger.info(`Generating ${type}...`);

            try {
                const files = await generator.generate(input);
                result.filesGenerated.push(...files.map((f: GeneratedFile) => f.path || f.filename));
                this.logger.info(`Generating ${type} finished successfully`);
            } catch (error) {
                result.errors.push(
                    `${type} generator failed: ${error instanceof Error ? error.message : String(error)}`,
                );
                if (this.options.throwException) throw error;
            }
        }
    }
}

/**
 * Create an API builder instance from a configuration object
 */
export function createAPIFromConfig(config: Config): APIBuilder {
    const builder = new APIBuilder({
        outputDir: config.outputDir,
        verbose: config.verbose,
        overwrite: config.overwrite,
        cache: config.cache,
        cleanOutput: config.cleanOutput,
        typeSchemaConfig: config.typeSchema,
    });

    // Add packages if specified
    if (config.packages && config.packages.length > 0) {
        for (const pkg of config.packages) {
            builder.fromPackage(pkg);
        }
    }

    // Add files if specified
    if (config.files && config.files.length > 0) {
        builder.fromFiles(...config.files);
    }

    // Configure TypeScript generator if specified
    if (config.typescript) {
        builder.typescriptDepricated(config.typescript);
    }

    return builder;
}
