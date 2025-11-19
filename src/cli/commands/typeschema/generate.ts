/**
 * TypeSchema Generate Command
 *
 * Generate TypeSchema files from FHIR packages
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { TypeSchemaGenerator } from "@typeschema/generator";
import type { CommandModule } from "yargs";
import { loadConfig } from "../../../config";
import { complete, createLogger, list } from "@root/utils/codegen-logger";

interface GenerateTypeschemaArgs {
    packages: string[];
    output?: string;
    format?: "ndjson" | "json";
    verbose?: boolean;
    treeshake?: string[];
    singleFile?: boolean;
}

/**
 * Generate TypeSchema from FHIR packages
 */
export const generateTypeschemaCommand: CommandModule<Record<string, unknown>, GenerateTypeschemaArgs> = {
    command: "generate <packages..>",
    describe: "Generate TypeSchema files from FHIR packages",
    builder: {
        packages: {
            type: "string",
            array: true,
            demandOption: true,
            describe: "FHIR packages to process (e.g., hl7.fhir.r4.core@4.0.1)",
        },
        output: {
            alias: "o",
            type: "string",
            describe: "Output file or directory",
            default: "./schemas.ndjson",
        },
        format: {
            alias: "f",
            type: "string",
            choices: ["ndjson", "json"] as const,
            default: "ndjson" as const,
            describe: "Output format for TypeSchema files",
        },
        treeshake: {
            alias: "t",
            type: "string",
            array: true,
            describe: "Only generate TypeSchemas for specific ResourceTypes (treeshaking)",
        },
        singleFile: {
            alias: "s",
            type: "boolean",
            default: false,
            describe: "Generate single TypeSchema file instead of multiple files (NDJSON format)",
        },
        verbose: {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Enable verbose output",
        },
    },
    handler: async (argv) => {
        const logger = createLogger({
            verbose: argv.verbose,
            prefix: "TypeSchema",
        });

        try {
            // Load configuration from file
            const config = await loadConfig(process.cwd());

            logger.step("Generating TypeSchema from FHIR packages");
            logger.info(`Packages: ${argv.packages.join(", ")}`);
            logger.info(`Output: ${argv.output}`);
            // Merge singleFile options: CLI args take precedence over config file
            const singleFileOption =
                argv.singleFile !== undefined ? argv.singleFile : (config.typeSchema?.singleFile ?? false);

            const outputFormat = singleFileOption ? "ndjson" : argv.format;
            logger.debug(
                `Format: ${outputFormat}${singleFileOption && argv.format === "json" ? " (forced from json due to singleFile)" : ""}`,
            );

            // Merge treeshake options: CLI args take precedence over config file
            const treeshakeOptions =
                argv.treeshake && argv.treeshake.length > 0 ? argv.treeshake : config.typeSchema?.treeshake;

            if (treeshakeOptions && treeshakeOptions.length > 0) {
                logger.info(`Treeshaking enabled for ResourceTypes: ${treeshakeOptions.join(", ")}`);
            }

            if (singleFileOption) {
                logger.info("Single file output enabled (NDJSON format)");
            }

            const startTime = Date.now();

            // Create TypeSchema generator
            const generator = new TypeSchemaGenerator({
                verbose: argv.verbose,
                treeshake: treeshakeOptions,
            });

            // Generate schemas from all packages
            const allSchemas: any[] = [];

            for (const packageSpec of argv.packages) {
                const [name, version] = packageSpec.includes("@") ? packageSpec.split("@") : [packageSpec, undefined];

                logger.progress(`Processing package: ${name}${version ? `@${version}` : ""}`);

                const schemas = await generator.generateFromPackage(name, version, logger);
                allSchemas.push(...schemas);
            }

            if (allSchemas.length === 0) {
                throw new Error("No schemas were generated from the specified packages");
            }

            // Use the output format determined earlier

            // Ensure output directory exists
            const outputPath = argv.output!;
            await mkdir(dirname(outputPath), { recursive: true });

            // Format and write the schemas
            let content: string;
            if (outputFormat === "json") {
                content = JSON.stringify(allSchemas, null, 2);
            } else {
                // NDJSON format (default for single file)
                content = allSchemas.map((schema) => JSON.stringify(schema)).join("\n");
            }

            await writeFile(outputPath, content, "utf-8");

            const duration = Date.now() - startTime;
            complete(`Generated ${allSchemas.length} TypeSchema definitions`, duration, { schemas: allSchemas.length });
            logger.dim(`Output: ${outputPath}`);

            if (argv.verbose) {
                logger.debug("Generated schemas:");
                const schemaNames = allSchemas.map(
                    (schema: any) =>
                        `${schema.identifier?.name || "Unknown"} (${schema.identifier?.kind || "unknown"})`,
                );
                list(schemaNames);
            }
        } catch (error) {
            logger.error("Failed to generate TypeSchema", error instanceof Error ? error : new Error(String(error)));
            process.exit(1);
        }
    },
};
