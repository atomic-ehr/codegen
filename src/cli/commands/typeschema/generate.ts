/**
 * TypeSchema Generate Command
 *
 * Generate TypeSchema files from FHIR packages
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { complete, list } from "@root/utils/codegen-logger";
import { makeLogger } from "@root/utils/logger";
import { generateTypeSchemas } from "@typeschema/index";
import { registerFromPackageMetas } from "@typeschema/register";
import type { PackageMeta } from "@typeschema/types";
import type { CommandModule } from "yargs";

interface GenerateTypeschemaArgs {
    packages: string[];
    output?: string;
    format?: "ndjson" | "json";
    verbose?: boolean;
    treeshake?: string[];
    singleFile?: boolean;
    registry?: string;
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
        registry: {
            alias: "r",
            type: "string",
            describe: "Custom FHIR package registry URL (default: https://fs.get-ig.org/pkgs/)",
        },
    },
    handler: async (argv) => {
        const logger = makeLogger({
            prefix: "TypeSchema",
        });

        try {
            logger.info("Generating TypeSchema from FHIR packages");
            logger.info(`Packages: ${argv.packages.join(", ")}`);
            logger.info(`Output: ${argv.output}`);

            const outputFormat = argv.singleFile ? "ndjson" : argv.format;
            logger.debug(
                `Format: ${outputFormat}${argv.singleFile && argv.format === "json" ? " (forced from json due to singleFile)" : ""}`,
            );

            if (argv.treeshake && argv.treeshake.length > 0) {
                logger.info(`Treeshaking enabled for ResourceTypes: ${argv.treeshake.join(", ")}`);
            }

            if (argv.singleFile) {
                logger.info("Single file output enabled (NDJSON format)");
            }

            if (argv.registry) {
                logger.info(`Using custom registry: ${argv.registry}`);
            }

            const startTime = Date.now();

            // Parse package specs into PackageMeta objects
            const packageMetas: PackageMeta[] = argv.packages.map((packageSpec) => {
                if (packageSpec.includes("@")) {
                    const atIndex = packageSpec.lastIndexOf("@");
                    return {
                        name: packageSpec.slice(0, atIndex),
                        version: packageSpec.slice(atIndex + 1) || "latest",
                    };
                }
                return { name: packageSpec, version: "latest" };
            });

            logger.info(`Processing packages: ${packageMetas.map((p) => `${p.name}@${p.version}`).join(", ")}`);

            // Create register from packages
            const register = await registerFromPackageMetas(packageMetas, {
                logger,
                registry: argv.registry,
                focusedPackages: packageMetas,
            });

            // Generate TypeSchemas
            const { schemas: allSchemas } = await generateTypeSchemas(register, logger);

            if (allSchemas.length === 0) {
                throw new Error("No schemas were generated from the specified packages");
            }

            // Use the output format determined earlier

            // Ensure output directory exists
            const outputPath = argv.output;
            if (!outputPath) throw new Error("Output format not specified");
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
            logger.info(`Output: ${outputPath}`);

            if (argv.verbose) {
                logger.debug("Generated schemas:");
                const schemaNames = allSchemas.map(
                    (schema: any) =>
                        `${schema.identifier?.name || "Unknown"} (${schema.identifier?.kind || "unknown"})`,
                );
                list(schemaNames);
            }
        } catch (error) {
            logger.error(`Failed to generate TypeSchema: ${error instanceof Error ? error.message : String(error)}`);
            process.exit(1);
        }
    },
};
