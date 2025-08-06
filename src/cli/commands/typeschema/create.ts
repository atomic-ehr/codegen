/**
 * TypeSchema Create Command
 *
 * Create TypeSchema from FHIR packages
 */

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { translate } from "@atomic-ehr/fhirschema";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join, resolve } from "path";
import type { CommandModule } from "yargs";
import type { TypeSchemaConfig } from "../../../lib/core/config";
import { transformFHIRSchema } from "../../../lib/typeschema/core/transformer";
import { transformValueSet } from "../../../lib/typeschema/value-set/processor";
import type { CLIArgvWithConfig } from "../index";

interface CreateCommandArgs extends CLIArgvWithConfig {
	packages?: string[];
	output?: string;
	format?: "ndjson" | "separate" | "merged";
	treeshake?: string;
	"drop-cache"?: boolean;
	"working-dir"?: string;
}

/**
 * TypeSchema create command
 */
export const createTypeschemaCommand: CommandModule<{}, CreateCommandArgs> = {
	command: "create [packages..]",
	describe: "Create TypeSchema from FHIR packages",
	builder: {
		packages: {
			type: "string",
			array: true,
			description:
				"FHIR package names (e.g., hl7.fhir.r4.core@4.0.1, hl7.fhir.us.core@6.1.0). Uses config file if not specified.",
			demandOption: false,
		},
		output: {
			alias: "o",
			type: "string",
			description: "Output file or directory",
		},
		format: {
			alias: "f",
			type: "string",
			choices: ["ndjson", "separate", "merged"] as const,
			default: "ndjson" as const,
			description: "Output format",
		},
		treeshake: {
			alias: "t",
			type: "string",
			description: "Comma-separated list of types to include (treeshaking)",
		},
		"drop-cache": {
			type: "boolean",
			default: false,
			description: "Drop existing package caches",
		},
		"working-dir": {
			type: "string",
			description: "Working directory for package caching",
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			description: "Enable verbose output",
		},
	},
	handler: async (argv) => {
		// Get packages from CLI args or configuration
		let packages =
			argv.packages && argv.packages.length > 0
				? argv.packages
				: argv._config?.typeschema?.packages;

		// Merge CLI args with configuration
		const configTypeschema = argv._config?.typeschema || {};
		const configGlobal = argv._config?.global || {};

		// For backward compatibility, merge any legacy profiles configuration into packages
		const legacyProfiles = configTypeschema.profiles;
		if (legacyProfiles && legacyProfiles.length > 0) {
			packages = packages ? [...packages, ...legacyProfiles] : legacyProfiles;
			console.warn(
				"Warning: 'profiles' configuration is deprecated. Please move profile packages to the 'packages' array.",
			);
		}

		if (!packages || packages.length === 0) {
			throw new Error(
				"No FHIR packages specified. Either provide packages as arguments or configure them in .atomic-codegen.json",
			);
		}

		const config: TypeSchemaConfig = {
			packages,
			outputFormat: argv.format || configTypeschema.outputFormat || "ndjson",
			validation: configTypeschema.validation ?? true,
			treeshaking: argv.treeshake
				? argv.treeshake.split(",").map((s) => s.trim())
				: configTypeschema.treeshaking,
			workingDir:
				argv["working-dir"] ||
				argv._config?.project?.workingDir ||
				configTypeschema.workingDir,
			dropCache: argv["drop-cache"] ?? configTypeschema.dropCache ?? false,
			verbose: argv.verbose ?? configGlobal.verbose ?? false,
		};

		// Use output from CLI or config
		const outputPath = argv.output || argv._config?.generator?.outputDir;

		await createTypeSchema(config, outputPath);
	},
};

/**
 * Create TypeSchema from FHIR packages
 */
export async function createTypeSchema(
	config: TypeSchemaConfig,
	outputPath?: string,
): Promise<void> {
	const log = (message: string) => {
		if (config.verbose) {
			console.error(`[CREATE] ${message}`);
		}
	};

	try {
		log("Initializing FHIR canonical manager...");

		// Create canonical manager
		const workingDir =
			config.workingDir ||
			(config.dropCache ? `tmp/fhir-${Date.now()}` : "tmp/fhir");
		const manager = CanonicalManager({
			packages: config.packages,
			workingDir,
		});

		await manager.init();

		// Extract package info from config
		// For now, use the first package as default (could be enhanced to map resources to specific packages)
		const defaultPackageInfo = config.packages.length > 0 ? (() => {
			const pkg = config.packages[0];
			const [name, version] = pkg.includes('@') ? pkg.split('@') : [pkg, 'unknown'];
			return { name, version };
		})() : { name: 'unknown', version: 'unknown' };

		log(`Using default package info: ${defaultPackageInfo.name}@${defaultPackageInfo.version}`);

		// Process all StructureDefinitions
		const allSchemas: any[] = [];

		log("Processing StructureDefinitions...");
		const structureDefinitions = await manager.search({
			resourceType: "StructureDefinition",
		});

		log(`Found ${structureDefinitions.length} StructureDefinitions`);

		for (const sd of structureDefinitions) {
			log(`Processing ${sd.name}...`);

			// Convert to FHIRSchema
			const fhirSchema = translate(sd as any);

			// Use default package info from config
			const packageInfo = defaultPackageInfo;

			// Transform to TypeSchema
			const schemas = await transformFHIRSchema(
				fhirSchema,
				manager,
				packageInfo,
			);
			allSchemas.push(...schemas);
		}

		// Process ValueSets
		log("Processing ValueSets...");
		const valueSets = await manager.search({ resourceType: "ValueSet" });

		for (const vs of valueSets) {
			log(`Processing ValueSet ${vs.id}...`);

			// Use default package info from config
			const packageInfo = defaultPackageInfo;

			const schema = await transformValueSet(vs, manager, packageInfo);
			allSchemas.push(schema);
		}

		// Apply treeshaking if requested
		let finalSchemas = allSchemas;
		if (config.treeshaking && config.treeshaking.length > 0) {
			log(`Treeshaking to include only: ${config.treeshaking.join(", ")}`);
			finalSchemas = applyTreeshaking(allSchemas, config.treeshaking);
		}

		// Output results
		await outputSchemas(finalSchemas, config, outputPath);

		log(`Successfully created ${finalSchemas.length} TypeSchema entries`);

		// Cleanup
		await manager.destroy();
	} catch (error) {
		throw new Error(
			`Failed to create TypeSchema: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Apply treeshaking to include only specified types
 */
function applyTreeshaking(schemas: any[], includeTypes: string[]): any[] {
	const includeSet = new Set(includeTypes);
	const filtered = schemas.filter((schema) => {
		const name = schema.identifier?.name;
		return name && includeSet.has(name);
	});

	console.warn(
		`Treeshaking: filtered ${schemas.length} schemas down to ${filtered.length}`,
	);
	return filtered;
}

/**
 * Output schemas in the specified format
 */
async function outputSchemas(
	schemas: any[],
	config: TypeSchemaConfig,
	outputPath?: string,
): Promise<void> {
	if (!outputPath) {
		// Output to stdout
		for (const schema of schemas) {
			console.log(JSON.stringify(schema));
		}
		return;
	}

	const resolvedPath = resolve(outputPath);

	switch (config.outputFormat) {
		case "ndjson":
			await outputNDJSON(schemas, resolvedPath);
			break;
		case "separate":
			await outputSeparateFiles(schemas, resolvedPath);
			break;
		case "merged":
			await outputMergedFile(schemas, resolvedPath);
			break;
	}
}

/**
 * Output as NDJSON format
 */
async function outputNDJSON(schemas: any[], outputPath: string): Promise<void> {
	const filePath = outputPath.endsWith(".ndjson")
		? outputPath
		: join(outputPath, "schemas.ndjson");
	await mkdir(dirname(filePath), { recursive: true });

	const lines = schemas.map((schema) => JSON.stringify(schema));
	await writeFile(filePath, lines.join("\n"));

	console.log(`✨ Created TypeSchema NDJSON: ${filePath}`);
}

/**
 * Output as separate files
 */
async function outputSeparateFiles(
	schemas: any[],
	outputDir: string,
): Promise<void> {
	await mkdir(outputDir, { recursive: true });

	for (const schema of schemas) {
		const identifier = schema.identifier;
		if (!identifier) continue;

		const packageDir = join(outputDir, identifier.package || "unknown");
		const filePath = join(packageDir, `${identifier.name}.json`);

		await mkdir(packageDir, { recursive: true });
		await writeFile(filePath, JSON.stringify(schema, null, 2));
	}

	console.log(
		`✨ Created ${schemas.length} separate TypeSchema files in: ${outputDir}`,
	);
}

/**
 * Output as merged JSON file
 */
async function outputMergedFile(
	schemas: any[],
	outputPath: string,
): Promise<void> {
	const filePath = outputPath.endsWith(".json")
		? outputPath
		: join(outputPath, "schemas.json");
	await mkdir(dirname(filePath), { recursive: true });

	await writeFile(filePath, JSON.stringify(schemas, null, 2));

	console.log(`✨ Created merged TypeSchema file: ${filePath}`);
}
