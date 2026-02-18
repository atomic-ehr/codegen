/**
 * High-Level API Builder
 *
 * Provides a fluent, chainable API for common codegen use cases with pre-built generators.
 * This builder pattern allows users to configure generation in a declarative way.
 */

import assert from "node:assert";
import * as fs from "node:fs";
import * as Path from "node:path";
import { CanonicalManager, type LocalPackageConfig, type TgzPackageConfig } from "@atomic-ehr/fhir-canonical-manager";
import { CSharp, type CSharpGeneratorOptions } from "@root/api/writer-generator/csharp/csharp";
import { Python, type PythonGeneratorOptions } from "@root/api/writer-generator/python";
import { generateTypeSchemas } from "@root/typeschema";
import { promoteLogical } from "@root/typeschema/ir/logic-promotion";
import { treeShake } from "@root/typeschema/ir/tree-shake";
import type { IrConf, LogicalPromotionConf, TreeShakeConf } from "@root/typeschema/ir/types";
import { type Register, registerFromManager } from "@root/typeschema/register";
import { type PackageMeta, packageMetaToNpm } from "@root/typeschema/types";
import { mkTypeSchemaIndex, type TypeSchemaIndex } from "@root/typeschema/utils";
import { type Logger, type LogLevel, makeLogger } from "@root/utils/logger";
import { IntrospectionWriter, type IntrospectionWriterOptions } from "./writer-generator/introspection";
import { IrReportWriterWriter, type IrReportWriterWriterOptions } from "./writer-generator/ir-report";
import type { FileBasedMustacheGeneratorOptions } from "./writer-generator/mustache";
import * as Mustache from "./writer-generator/mustache";
import { TypeScript, type TypeScriptOptions } from "./writer-generator/typescript";
import type { FileBuffer, FileSystemWriter, FileSystemWriterOptions, WriterOptions } from "./writer-generator/writer";

/**
 * Configuration options for the API builder
 */
export interface APIBuilderOptions {
    outputDir: string;
    cleanOutput: boolean;
    throwException: boolean;
    treeShake: TreeShakeConf | undefined;
    promoteLogical: LogicalPromotionConf | undefined;

    /** Log level for the logger. Default: INFO */
    logLevel: LogLevel;
    /** Custom FHIR package registry URL (default: https://fs.get-ig.org/pkgs/) */
    registry: string | undefined;
    /** Drop the canonical manager cache */
    dropCanonicalManagerCache: boolean;
}

export type GenerationReport = {
    success: boolean;
    outputDir: string;
    filesGenerated: Record<string, string>;
    errors: string[];
    warnings: string[];
    duration: number;
};

function countLinesByMatches(text: string): number {
    if (text === "") return 0;
    const m = text.match(/\n/g);
    return m ? m.length + 1 : 1;
}

export const prettyReport = (report: GenerationReport): string => {
    const { success, filesGenerated, errors, warnings, duration } = report;
    const errorsStr = errors.length > 0 ? `Errors: ${errors.join(", ")}` : undefined;
    const warningsStr = warnings.length > 0 ? `Warnings: ${warnings.join(", ")}` : undefined;
    let allLoc = 0;
    const files = Object.entries(filesGenerated)
        .map(([path, content]) => {
            const loc = countLinesByMatches(content);
            allLoc += loc;
            return `  - ${path} (${loc} loc)`;
        })
        .join("\n");
    return [
        `Generated files (${Math.round(allLoc / 1000)} kloc):`,
        files,
        errorsStr,
        warningsStr,
        `Duration: ${Math.round(duration)}ms`,
        `Status: ${success ? "🟩 Success" : "🟥 Failure"}`,
    ]
        .filter((e) => e)
        .join("\n");
};

export interface LocalStructureDefinitionConfig {
    package: PackageMeta;
    path: string;
    dependencies?: PackageMeta[];
}

const cleanup = async (opts: APIBuilderOptions, logger: Logger): Promise<void> => {
    logger.info(`Cleaning outputs...`);
    try {
        logger.info(`Clean ${opts.outputDir}`);
        fs.rmSync(opts.outputDir, { recursive: true, force: true });
    } catch (error) {
        logger.warn(`Error cleaning output directory: ${error instanceof Error ? error.message : String(error)}`);
    }
};

/**
 * High-Level API Builder class
 *
 * Provides a fluent interface for configuring and executing code generation
 * from FHIR packages or TypeSchema documents.
 */
export class APIBuilder {
    private options: APIBuilderOptions;
    private manager: ReturnType<typeof CanonicalManager>;
    private prebuiltRegister: Register | undefined;
    private managerInput: {
        npmPackages: string[];
        localSDs: LocalPackageConfig[];
        localTgzPackages: TgzPackageConfig[];
    };
    private logger: Logger;
    private generators: { name: string; writer: FileSystemWriter }[] = [];

    constructor(
        userOpts: Partial<APIBuilderOptions> & {
            manager?: ReturnType<typeof CanonicalManager>;
            register?: Register;
            logger?: Logger;
        } = {},
    ) {
        const defaultOpts: APIBuilderOptions = {
            outputDir: "./generated",
            cleanOutput: true,
            throwException: false,
            treeShake: undefined,
            promoteLogical: undefined,
            registry: undefined,
            logLevel: "info",
            dropCanonicalManagerCache: false,
        };
        const opts: APIBuilderOptions = {
            ...defaultOpts,
            ...Object.fromEntries(
                Object.entries(userOpts).filter(
                    ([k, v]) => v !== undefined && k !== "manager" && k !== "register" && k !== "logger",
                ),
            ),
        };

        if (userOpts.manager && userOpts.register) {
            throw new Error("Cannot provide both 'manager' and 'register' options. Use one or the other.");
        }

        this.managerInput = {
            npmPackages: [],
            localSDs: [],
            localTgzPackages: [],
        };
        this.prebuiltRegister = userOpts.register;
        this.manager =
            userOpts.manager ??
            CanonicalManager({
                packages: [],
                workingDir: ".codegen-cache/canonical-manager-cache",
                registry: userOpts.registry,
                dropCache: userOpts.dropCanonicalManagerCache,
            });
        this.logger = userOpts.logger ?? makeLogger({ prefix: "API", level: opts.logLevel });
        this.options = opts;
    }

    fromPackage(packageName: string, version?: string): APIBuilder {
        const pkg = packageMetaToNpm({ name: packageName, version: version || "latest" });
        this.managerInput.npmPackages.push(pkg);
        return this;
    }

    fromPackageRef(packageRef: string): APIBuilder {
        this.managerInput.npmPackages.push(packageRef);
        return this;
    }

    localStructureDefinitions(config: LocalStructureDefinitionConfig): APIBuilder {
        this.logger.info(`Registering local StructureDefinitions for ${config.package.name}@${config.package.version}`);
        this.managerInput.localSDs.push({
            name: config.package.name,
            version: config.package.version,
            path: config.path,
            dependencies: config.dependencies?.map((dep) => packageMetaToNpm(dep)),
        });
        return this;
    }

    localTgzPackage(archivePath: string): APIBuilder {
        this.logger.info(`Registering local tgz package: ${archivePath}`);
        this.managerInput.localTgzPackages.push({ archivePath: Path.resolve(archivePath) });
        return this;
    }

    introspection(userOpts?: Partial<IntrospectionWriterOptions>): APIBuilder {
        const defaultWriterOpts: FileSystemWriterOptions = {
            logger: this.logger,
            outputDir: this.options.outputDir,
            inMemoryOnly: false,
        };
        const opts: IntrospectionWriterOptions = {
            ...defaultWriterOpts,
            ...Object.fromEntries(Object.entries(userOpts ?? {}).filter(([_, v]) => v !== undefined)),
        };

        const writer = new IntrospectionWriter(opts);
        this.generators.push({ name: "introspection", writer });
        this.logger.debug(`Configured introspection generator (${JSON.stringify(opts, undefined, 2)})`);
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
            primitiveTypeExtension: true,
        };
        const opts: TypeScriptOptions = {
            ...defaultTsOpts,
            ...Object.fromEntries(Object.entries(userOpts).filter(([_, v]) => v !== undefined)),
        };
        const generator = new TypeScript(opts);
        this.generators.push({ name: "typescript", writer: generator });
        this.logger.debug(`Configured TypeScript generator (${JSON.stringify(opts, undefined, 2)})`);
        return this;
    }

    python(userOptions: Partial<PythonGeneratorOptions>): APIBuilder {
        const defaultWriterOpts: WriterOptions = {
            logger: this.logger,
            outputDir: this.options.outputDir,
            tabSize: 4,
            withDebugComment: false,
            commentLinePrefix: "#",
        };

        const defaultPyOpts: PythonGeneratorOptions = {
            ...defaultWriterOpts,
            rootPackageName: "fhir_types",
            fieldFormat: "snake_case",
        };

        const opts: PythonGeneratorOptions = {
            ...defaultPyOpts,
            ...Object.fromEntries(Object.entries(userOptions).filter(([_, v]) => v !== undefined)),
        };

        const generator = new Python(opts);
        this.generators.push({ name: "python", writer: generator });
        this.logger.debug(`Configured python generator`);
        return this;
    }

    mustache(templatePath: string, userOpts: Partial<FileSystemWriterOptions & FileBasedMustacheGeneratorOptions>) {
        const defaultWriterOpts: FileSystemWriterOptions = {
            logger: this.logger,
            outputDir: this.options.outputDir,
        };
        const defaultMustacheOpts: Partial<FileBasedMustacheGeneratorOptions> = {
            meta: {
                timestamp: new Date().toISOString(),
                generator: "atomic-codegen",
            },
        };
        const opts = {
            ...defaultWriterOpts,
            ...defaultMustacheOpts,
            ...userOpts,
        };
        const generator = Mustache.createGenerator(templatePath, opts);
        this.generators.push({ name: `mustache[${templatePath}]`, writer: generator });
        this.logger.debug(`Configured TypeScript generator (${JSON.stringify(opts, undefined, 2)})`);
        return this;
    }

    csharp(userOptions: Partial<CSharpGeneratorOptions>): APIBuilder {
        const defaultWriterOpts: WriterOptions = {
            logger: this.logger,
            outputDir: Path.join(this.options.outputDir, "/types"),
            tabSize: 4,
            withDebugComment: false,
            commentLinePrefix: "//",
        };

        const defaultCSharpOpts: CSharpGeneratorOptions = {
            ...defaultWriterOpts,
            rootNamespace: "Fhir.Types",
        };

        const opts: CSharpGeneratorOptions = {
            ...defaultCSharpOpts,
            ...Object.fromEntries(Object.entries(userOptions).filter(([_, v]) => v !== undefined)),
        };

        const generator = new CSharp(opts);
        this.generators.push({ name: "csharp", writer: generator });
        this.logger.debug(`Configured C# generator`);
        return this;
    }

    /**
     * Set the output directory for all generators
     */
    outputTo(directory: string): APIBuilder {
        this.logger.debug(`Setting output directory: ${directory}`);
        this.options.outputDir = directory;

        // Update all configured generators
        for (const gen of this.generators) {
            gen.writer.setOutputDir(directory);
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

    typeSchema(cfg: IrConf) {
        if (cfg.treeShake) {
            assert(this.options.treeShake === undefined, "treeShake option is already set");
            this.options.treeShake = cfg.treeShake;
        }
        if (cfg.promoteLogical) {
            assert(this.options.promoteLogical === undefined, "promoteLogical option is already set");
            this.options.promoteLogical = cfg.promoteLogical;
        }
        this.irReport({});
        return this;
    }

    irReport(userOpts: Partial<IrReportWriterWriterOptions>) {
        const defaultWriterOpts: FileSystemWriterOptions = {
            logger: this.logger,
            outputDir: this.options.outputDir,
            inMemoryOnly: false,
        };
        const opts: IrReportWriterWriterOptions = {
            ...defaultWriterOpts,
            rootReadmeFileName: "README.md",
            ...Object.fromEntries(Object.entries(userOpts ?? {}).filter(([_, v]) => v !== undefined)),
        };

        const writer = new IrReportWriterWriter(opts);
        this.generators.push({ name: "ir-report", writer });
        this.logger.debug(`Configured ir-report generator (${JSON.stringify(opts, undefined, 2)})`);
        return this;
    }

    async generate(): Promise<GenerationReport> {
        const startTime = performance.now();
        const result: GenerationReport = {
            success: false,
            outputDir: this.options.outputDir,
            filesGenerated: {},
            errors: [],
            warnings: [],
            duration: 0,
        };

        this.logger.debug(`Starting generation with ${this.generators.length} generators`);
        try {
            if (this.options.cleanOutput) cleanup(this.options, this.logger);

            let register: Register;
            if (this.prebuiltRegister) {
                this.logger.info("Using prebuilt register");
                register = this.prebuiltRegister;
            } else {
                this.logger.info("Initialize Canonical Manager");
                // Add all packages before initialization
                if (this.managerInput.npmPackages.length > 0) {
                    await this.manager.addPackages(...this.managerInput.npmPackages.sort());
                }
                // Add local packages and archives
                for (const config of this.managerInput.localSDs) {
                    await this.manager.addLocalPackage(config);
                }
                for (const tgzArchive of this.managerInput.localTgzPackages) {
                    await this.manager.addTgzPackage(tgzArchive);
                }
                // Initialize after all packages are registered
                const ref2meta = await this.manager.init();

                const packageMetas = Object.values(ref2meta);
                register = await registerFromManager(this.manager, {
                    logger: this.logger,
                    focusedPackages: packageMetas,
                });
            }

            const { schemas: typeSchemas, collisions } = await generateTypeSchemas(register, this.logger);

            const tsIndexOpts = {
                register,
                logger: this.logger,
                irReport: Object.keys(collisions).length > 0 ? { collisions } : {},
            };
            let tsIndex = mkTypeSchemaIndex(typeSchemas, tsIndexOpts);
            if (this.options.treeShake) tsIndex = treeShake(tsIndex, this.options.treeShake);
            if (this.options.promoteLogical) tsIndex = promoteLogical(tsIndex, this.options.promoteLogical);

            this.logger.debug(`Executing ${this.generators.length} generators`);

            await this.executeGenerators(result, tsIndex);

            this.logger.info("Generation completed successfully");

            result.success = result.errors.length === 0;

            this.logger.debug(`Generation completed: ${result.filesGenerated.length} files`);
        } catch (error) {
            this.logger.error(`Code generation failed: ${error instanceof Error ? error.message : String(error)}`);
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
        this.generators = [];
        return this;
    }

    /**
     * Get configured generators (for inspection)
     */
    getGenerators(): string[] {
        return this.generators.map((g) => g.name);
    }

    private async executeGenerators(result: GenerationReport, tsIndex: TypeSchemaIndex): Promise<void> {
        for (const gen of this.generators) {
            this.logger.info(`Generating ${gen.name}...`);

            try {
                await gen.writer.generateAsync(tsIndex);
                const fileBuffer: FileBuffer[] = gen.writer.writtenFiles();
                fileBuffer.forEach((buf) => {
                    result.filesGenerated[buf.relPath] = buf.content;
                });
                this.logger.info(`Generating ${gen.name} finished successfully`);
            } catch (error) {
                result.errors.push(
                    `${gen.name} generator failed: ${error instanceof Error ? error.message : String(error)}`,
                );
                if (this.options.throwException) throw error;
            }
        }
    }
}
