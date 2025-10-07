/**
 * High-Level API Builder
 *
 * Provides a fluent, chainable API for common codegen use cases with pre-built generators.
 * This builder pattern allows users to configure generation in a declarative way.
 */

import * as Path from "node:path";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { GeneratedFile } from "@root/api/generators/base/types";
import { registerFromManager } from "@root/typeschema/register";
import { generateTypeSchemas, TypeSchemaCache, TypeSchemaGenerator, TypeSchemaParser } from "@typeschema/index";
import { packageMetaToNpm, type TypeSchema } from "@typeschema/types";
import type { Config, TypeSchemaConfig } from "../config";
import type { CodegenLogger } from "../utils/codegen-logger";
import { createLogger } from "../utils/codegen-logger";
import { TypeScriptGenerator } from "./generators/typescript";
import * as TS2 from "./writer-generator/typescript";
import type { Writer, WriterOptions } from "./writer-generator/writer";

/**
 * Configuration options for the API builder
 */
export interface APIBuilderOptions {
    outputDir?: string;
    verbose?: boolean;
    overwrite?: boolean;
    cache?: boolean;
    typeSchemaConfig?: TypeSchemaConfig;
    logger?: CodegenLogger;
    manager?: ReturnType<typeof CanonicalManager> | null;
    throwException?: boolean;
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
    generate: (schemas: TypeSchema[]) => Promise<GeneratedFile[]>;
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
        generate: async (schemas: TypeSchema[]): Promise<GeneratedFile[]> => {
            writerGen.generate(schemas);
            return getGeneratedFiles();
        },
        setOutputDir: (outputDir: string) => (writerGen.opts.outputDir = outputDir),
        build: async (_schemas: TypeSchema[]) => getGeneratedFiles(),
    };
};

/**
 * High-Level API Builder class
 *
 * Provides a fluent interface for configuring and executing code generation
 * from FHIR packages or TypeSchema documents.
 */
export class APIBuilder {
    private schemas: TypeSchema[] = [];
    private options: Omit<Required<APIBuilderOptions>, "typeSchemaConfig" | "logger"> & {
        typeSchemaConfig?: TypeSchemaConfig;
    };
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
            typeSchemaConfig: options.typeSchemaConfig,
            manager: options.manager || null,
            throwException: options.throwException || false,
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
        this.packages.push(packageMetaToNpm({ name: packageName, version: version || "latest" }));
        return this;
    }

    /**
     * Load TypeSchema from files
     */
    fromFiles(...filePaths: string[]): APIBuilder {
        this.logger.debug(`Loading from ${filePaths.length} TypeSchema files`);
        const operation = this.loadFromFiles(filePaths);
        this.pendingOperations.push(operation);
        return this;
    }

    /**
     * Load TypeSchema from TypeSchema objects
     */
    fromSchemas(schemas: TypeSchema[]): APIBuilder {
        this.logger.debug(`Adding ${schemas.length} TypeSchemas to generation`);
        this.schemas = [...this.schemas, ...schemas];
        return this;
    }

    typescript(
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
        // Hardcode types subfolder
        const typesOutputDir = `${this.options.outputDir}/types`;

        const generator = new TypeScriptGenerator({
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

    typescript2(opts: Partial<WriterOptions>) {
        const writerOpts = {
            outputDir: Path.join(this.options.outputDir, "/types"),
            tabSize: 2,
            withDebugComment: true,
            commentLinePrefix: "//",
        };
        const effectiveOpts = { logger: this.logger, ...writerOpts, ...opts };
        const generator = writerToGenerator(new TS2.TypeScript(effectiveOpts));
        this.generators.set("typescript2", generator);
        this.logger.debug(`Configured TypeScript2 generator (${JSON.stringify(effectiveOpts, undefined, 2)})`);
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
            this.logger.info("Initialize Canonical Manager");
            const manager = CanonicalManager({
                packages: this.packages,
                workingDir: "tmp/fhir",
            });
            await manager.init();
            const register = await registerFromManager(manager, this.logger);
            const typeSchemas = await generateTypeSchemas(register);

            this.logger.debug(`Executing ${this.generators.size} generators`);

            await this.executeGenerators(result, typeSchemas);

            this.logger.info("Generation completed successfully");

            result.success = result.errors.length === 0;

            this.logger.debug(`Generation completed: ${result.filesGenerated.length} files`);
        } catch (error) {
            this.logger.error("Code generation failed", error instanceof Error ? error : new Error(String(error)));
            result.errors.push(error instanceof Error ? error.message : String(error));
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

    private async executeGenerators(result: GenerationResult, typeSchemas: TypeSchema[]): Promise<void> {
        for (const [type, generator] of this.generators.entries()) {
            this.logger.info(`Generating ${type}...`);

            try {
                const files = await generator.generate(typeSchemas);
                result.filesGenerated.push(...files.map((f: GeneratedFile) => f.path || f.filename));
                this.logger.info(`Generating ${type} finished successfully`);
            } catch (error) {
                result.errors.push(
                    `${type} generator failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }
    }
}

/**
 * Create a new API builder instance
 */
export function createAPI(options?: APIBuilderOptions): APIBuilder {
    return new APIBuilder(options);
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
        builder.typescript(config.typescript);
    }

    return builder;
}

/**
 * Convenience function for quick TypeScript generation from a package
 */
export async function generateTypesFromPackage(
    packageName: string,
    outputDir: string,
    options: {
        version?: string;
        verbose?: boolean;
        validate?: boolean;
    } = {},
): Promise<GenerationResult> {
    return createAPI({
        outputDir,
        verbose: options.verbose,
    })
        .fromPackage(packageName, options.version)
        .typescript()
        .generate();
}

/**
 * Convenience function for quick TypeScript generation from files
 */
export async function generateTypesFromFiles(
    inputFiles: string[],
    outputDir: string,
    options: {
        verbose?: boolean;
        validate?: boolean;
    } = {},
): Promise<GenerationResult> {
    return createAPI({
        outputDir,
        verbose: options.verbose,
    })
        .fromFiles(...inputFiles)
        .typescript()
        .generate();
}
