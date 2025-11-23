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
import { CSharp } from "@root/api/writer-generator/csharp/csharp";
import { registerFromManager } from "@root/typeschema/register";
import { mkTypeSchemaIndex, type TreeShake, type TypeSchemaIndex, treeShake } from "@root/typeschema/utils";
import { generateTypeSchemas } from "@typeschema/index";
import { extractNameFromCanonical, packageMetaToFhir, packageMetaToNpm, type TypeSchema } from "@typeschema/types";
import type { TypeSchemaConfig } from "../config";
import { CodegenLogger, createLogger, type LogLevel } from "../utils/codegen-logger";
import { TypeScript, type TypeScriptOptions } from "./writer-generator/typescript";
import type { FileBuffer, FileSystemWriter, WriterOptions } from "./writer-generator/writer";

/**
 * Configuration options for the API builder
 */
export interface APIBuilderOptions {
    outputDir?: string;
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
    /** Log level for the logger. Default: INFO */
    logLevel?: LogLevel;
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

export interface GeneratedFile {
    fullFileName: string;
}

export type GeneratorInput = { schemas: TypeSchema[]; index: TypeSchemaIndex };

const normalizeFileName = (str: string): string => {
    const res = str.replace(/[^a-zA-Z0-9\-_.@#()]/g, "");
    if (res.length === 0) return "unknown";
    return res;
};

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

type APIBuilderConfig = PartialBy<
    Required<APIBuilderOptions>,
    "logger" | "typeSchemaConfig" | "typeSchemaOutputDir" | "exportTypeTree" | "treeShake" | "logLevel"
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
    private generators: Map<string, FileSystemWriter> = new Map();
    private logger: CodegenLogger;
    private packages: string[] = [];
    progressCallback: any;
    private typeSchemaConfig?: TypeSchemaConfig;

    constructor(options: APIBuilderOptions = {}) {
        this.options = {
            outputDir: options.outputDir || "./generated",
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
                prefix: "API",
                level: options.logLevel,
            });
    }

    fromPackage(packageName: string, version?: string): APIBuilder {
        const pkg = packageMetaToNpm({ name: packageName, version: version || "latest" });
        this.packages.push(pkg);
        return this;
    }

    fromPackageRef(packageRef: string): APIBuilder {
        this.packages.push(packageRef);
        return this;
    }

    fromSchemas(schemas: TypeSchema[]): APIBuilder {
        this.logger.debug(`Adding ${schemas.length} TypeSchemas to generation`);
        this.schemas = [...this.schemas, ...schemas];
        return this;
    }

    typescript(userOpts: Partial<TypeScriptOptions>) {
        const defaultWriterOpts: WriterOptions = {
            logger: this.logger,
            outputDir: Path.join(this.options.outputDir, "/types"),
            tabSize: 4,
            withDebugComment: false,
            commentLinePrefix: "//",
            generateProfile: true,
        };
        const defaultTsOpts: TypeScriptOptions = {
            ...defaultWriterOpts,
            openResourceTypeSet: false,
        };
        const opts: TypeScriptOptions = {
            ...defaultTsOpts,
            ...Object.fromEntries(Object.entries(userOpts).filter(([_, v]) => v !== undefined)),
        };
        const generator = new TypeScript(opts);
        this.generators.set("typescript", generator);
        this.logger.debug(`Configured TypeScript generator (${JSON.stringify(opts, undefined, 2)})`);
        return this;
    }

    csharp(namespace: string, staticSourceDir?: string | undefined): APIBuilder {
        const generator = new CSharp({
            outputDir: Path.join(this.options.outputDir, "/types"),
            staticSourceDir: staticSourceDir ?? undefined,
            targetNamespace: namespace,
            logger: new CodegenLogger({
                prefix: "C#",
                timestamp: true,
                suppressLoggingLevel: [],
            }),
        });
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
            generator.setOutputDir(directory);
        }

        return this;
    }

    setLogLevel(level: LogLevel): APIBuilder {
        this.logger?.setLevel(level);
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
                workingDir: ".codegen-cache/canonical-manager-cache",
            });
            const ref2meta = await manager.init();
            const packageMetas = Object.values(ref2meta);
            const register = await registerFromManager(manager, {
                logger: this.logger,
                focusedPackages: packageMetas,
            });

            const typeSchemas = await generateTypeSchemas(register, this.logger);
            await tryWriteTypeSchema(typeSchemas, this.options, this.logger);

            let tsIndex = mkTypeSchemaIndex(typeSchemas, this.logger);
            if (this.options.treeShake) tsIndex = treeShake(tsIndex, this.options.treeShake, this.logger);

            if (this.options.exportTypeTree) await tsIndex.exportTree(this.options.exportTypeTree);

            this.logger.debug(`Executing ${this.generators.size} generators`);

            await this.executeGenerators(result, tsIndex);

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

    private async executeGenerators(result: GenerationResult, tsIndex: TypeSchemaIndex): Promise<void> {
        for (const [type, generator] of this.generators.entries()) {
            this.logger.info(`Generating ${type}...`);

            try {
                await generator.generate(tsIndex);
                const fileBuffer: FileBuffer[] = generator.writtenFiles();
                result.filesGenerated.push(...fileBuffer.map((e) => e.absPath));
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
