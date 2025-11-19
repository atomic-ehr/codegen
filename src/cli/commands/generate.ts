/**
 * Generate Command - Config-Driven Generation
 *
 * Main generate command that reads all configuration from the config file
 * and executes generation based purely on config settings.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { CommandModule } from "yargs";
import { APIBuilder } from "../../api/index";
import { CONFIG_FILE_NAMES, loadConfig } from "../../config";
import { createLogger, error, step, success, warn } from "../utils/log";
import type { CLIArgv } from "./index";

interface GenerateArgs extends CLIArgv {
    // Only verbose flag remains as it's a general CLI flag
}

/**
 * Main generate command - fully config-driven
 */
export const generateCommand: CommandModule<Record<string, unknown>, GenerateArgs> = {
    command: "generate",
    describe: "Generate code based on configuration file settings",
    builder: (yargs) =>
        yargs
            .option("verbose", {
                alias: "v",
                type: "boolean",
                default: false,
                description: "Enable verbose output",
            })
            .example("$0 generate", "Generate code using settings from config file")
            .example("$0 generate --verbose", "Generate with verbose output"),
    handler: async (argv) => {
        // Check for old command syntax and provide helpful error
        if (argv._.length > 1) {
            const extraArgs = argv._.slice(1).join(" ");
            error(
                `Invalid syntax: 'atomic-codegen generate ${extraArgs}'\n\n` +
                    `The CLI has been simplified and no longer uses subcommands.\n\n` +
                    `✅ Use: atomic-codegen generate\n` +
                    `❌ Old: atomic-codegen generate typescript\n\n` +
                    `All generation settings are now configured in your config file.\n` +
                    `Create an atomic-codegen.config.ts file to get started.`,
            );
            process.exit(1);
        }

        // Check if config file exists first
        const workingDir = process.cwd();
        const configPath = await findConfigFile(workingDir);

        if (!configPath) {
            const configFilesList = CONFIG_FILE_NAMES.map((name) => `  - ${name}`).join("\n");
            error(
                `No configuration file found. Please create one of the following files in your project root:\n${configFilesList}\n\nExample atomic-codegen.config.ts:\n\n` +
                    `import { defineConfig } from '@atomic-ehr/codegen';\n\n` +
                    `export default defineConfig({\n` +
                    `  packages: ['hl7.fhir.r4.core@4.0.1'],\n` +
                    `  typescript: {\n` +
                    `    generateIndex: true\n` +
                    `  }\n` +
                    `});`,
            );
            process.exit(1);
        }

        // Load config file
        const config = await loadConfig(workingDir);
        const verbose = argv.verbose ?? config.verbose ?? false;

        // Create logger for CLI command
        const logger = createLogger({
            verbose,
            prefix: "Generate",
        });

        try {
            step("Starting generation from config");
            if (verbose) {
                logger.info(`Config file: ${configPath}`);
                logger.info(`Output directory: ${config.outputDir || "./generated"}`);
                logger.info(`Packages: ${config.packages?.length || 0}`);
                logger.info(`Files: ${config.files?.length || 0}`);
                logger.info(`TypeScript generation: ${config.typescript ? "enabled" : "disabled"}`);
            }

            // Create API builder with config options
            const builder = new APIBuilder({
                outputDir: config.outputDir || "./generated",
                verbose,
                overwrite: config.overwrite ?? true,
                cache: config.cache ?? true,
                typeSchemaConfig: config.typeSchema,
                logger,
            });

            // Load data sources from config
            if (config.packages && config.packages.length > 0) {
                logger.info(`Loading packages from config: ${config.packages.join(", ")}`);
                for (const packageSpec of config.packages) {
                    const [name, version] = packageSpec.includes("@")
                        ? packageSpec.split("@")
                        : [packageSpec, undefined];
                    builder.fromPackage(name, version);
                }
            } else if (config.files && config.files.length > 0) {
                logger.info(`Loading files from config: ${config.files.join(", ")}`);
                for (const file of config.files) {
                    builder.fromFiles(file);
                }
            } else {
                throw new Error(
                    "No data source specified in config. Please configure 'packages' or 'files' in your config file.",
                );
            }

            // Configure generators from config
            if (config.typescript) {
                if (verbose) {
                    logger.info("Configuring TypeScript generation from config");
                    logger.debug(`Module format: ${config.typescript.moduleFormat || "esm"}`);
                    logger.debug(`Generate index: ${config.typescript.generateIndex ?? true}`);
                    logger.debug(`Include docs: ${config.typescript.includeDocuments ?? false}`);
                    logger.debug(`Naming convention: ${config.typescript.namingConvention || "PascalCase"}`);
                }
                throw new Error("Not Implemented");
            }

            // Check that at least one generator is configured
            if (!config.typescript) {
                throw new Error("No generators configured. Please enable 'typescript' in your config file.");
            }

            // Add progress callback if verbose
            if (verbose) {
                builder.onProgress((phase, current, total, message) => {
                    const progress = Math.round((current / total) * 100);
                    logger.progress(`[${phase}] ${progress}% - ${message || "Processing..."}`);
                });
            }

            // Execute generation
            logger.step("Executing generation...");
            const result = await builder.generate();

            if (result.success) {
                success(`Generated ${result.filesGenerated.length} files in ${result.duration.toFixed(2)}ms`);
                logger.dim(`Output directory: ${result.outputDir}`);

                if (result.warnings.length > 0) {
                    for (const warning of result.warnings) {
                        warn(warning);
                    }
                }
            } else {
                error(`Generation failed with ${result.errors.length} errors`);
                for (const err of result.errors) {
                    logger.dim(`  ${err}`);
                }
                process.exit(1);
            }
        } catch (err) {
            error("Generation failed with unexpected error", err instanceof Error ? err : new Error(String(err)));
            process.exit(1);
        }
    },
};

/**
 * Helper function to find config file in the given directory
 */
async function findConfigFile(startDir: string): Promise<string | null> {
    for (const fileName of CONFIG_FILE_NAMES) {
        const configPath = resolve(startDir, fileName);
        if (existsSync(configPath)) {
            return configPath;
        }
    }
    return null;
}
