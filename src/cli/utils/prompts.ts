/**
 * CLI Prompts Utility
 *
 * Interactive prompts for better CLI user experience
 */

import { checkbox, confirm, input, select } from "@inquirer/prompts";
import pc from "picocolors";

/**
 * Prompt for project initialization
 */
export async function promptInitConfig(): Promise<{
	projectName: string;
	description?: string;
	outputDir: string;
	generators: string[];
	packageManager: "npm" | "yarn" | "pnpm" | "bun";
	typescript: boolean;
}> {
	console.log(pc.bold(pc.blue("\n🚀 Initialize Atomic Codegen Project\n")));

	const projectName = await input({
		message: "Project name:",
		default: "my-fhir-types",
		validate: (value) => {
			if (!value.trim()) return "Project name is required";
			if (!/^[a-z0-9-_]+$/i.test(value)) {
				return "Project name can only contain letters, numbers, hyphens, and underscores";
			}
			return true;
		},
	});

	const description = await input({
		message: "Project description (optional):",
		default: "",
	});

	const outputDir = await input({
		message: "Output directory for generated code:",
		default: "./generated",
	});

	const generators = await checkbox({
		message: "Select generators to use:",
		choices: [
			{ name: "TypeScript", value: "typescript", checked: true },
			{ name: "Python", value: "python" },
			{ name: "REST Client", value: "rest-client" },
		],
	});

	const packageManager = (await select({
		message: "Package manager:",
		choices: [
			{ name: "Bun", value: "bun" },
			{ name: "npm", value: "npm" },
			{ name: "Yarn", value: "yarn" },
			{ name: "pnpm", value: "pnpm" },
		],
		default: "bun",
	})) as "npm" | "yarn" | "pnpm" | "bun";

	const typescript = await confirm({
		message: "Use TypeScript for configuration?",
		default: true,
	});

	return {
		projectName,
		description,
		outputDir,
		generators,
		packageManager,
		typescript,
	};
}

/**
 * Prompt for FHIR package selection
 */
export async function promptFHIRPackage(): Promise<{
	packageId: string;
	version?: string;
	profiles?: string[];
}> {
	const packageId = await select({
		message: "Select FHIR package:",
		choices: [
			{ name: "FHIR R4 Core", value: "hl7.fhir.r4.core" },
			{ name: "FHIR R5 Core", value: "hl7.fhir.r5.core" },
			{ name: "US Core", value: "hl7.fhir.us.core" },
			{ name: "Custom package...", value: "custom" },
		],
	});

	let finalPackageId = packageId;
	let version: string | undefined;

	if (packageId === "custom") {
		finalPackageId = await input({
			message: "Enter package ID (e.g., hl7.fhir.us.core):",
			validate: (value) => {
				if (!value.trim()) return "Package ID is required";
				return true;
			},
		});

		version = await input({
			message: "Package version (optional):",
			default: "",
		});
	}

	const includeProfiles = await confirm({
		message: "Include profiles in generation?",
		default: false,
	});

	let profiles: string[] = [];
	if (includeProfiles) {
		const profileSelection = await select({
			message: "Profile selection:",
			choices: [
				{ name: "All profiles", value: "all" },
				{ name: "None", value: "none" },
			],
			default: "none",
		});

		if (profileSelection === "all") {
			profiles = ["*"];
		}
	}

	return {
		packageId: finalPackageId,
		version: version || undefined,
		profiles,
	};
}

/**
 * Prompt for generator configuration
 */
export async function promptGeneratorConfig(
	generatorId: string,
): Promise<Record<string, any>> {
	const config: Record<string, any> = {};

	switch (generatorId) {
		case "typescript":
			config.moduleFormat = await select({
				message: "Module format:",
				choices: [
					{ name: "ESM", value: "esm" },
					{ name: "CommonJS", value: "cjs" },
					{ name: "Both", value: "both" },
				],
				default: "esm",
			});

			config.strict = await confirm({
				message: "Enable strict TypeScript checks?",
				default: true,
			});

			config.generateIndex = await confirm({
				message: "Generate index files?",
				default: true,
			});
			break;

		case "python":
			config.style = await select({
				message: "Python style:",
				choices: [
					{ name: "Dataclasses", value: "dataclass" },
					{ name: "Pydantic", value: "pydantic" },
					{ name: "Plain classes", value: "plain" },
				],
				default: "dataclass",
			});

			config.typeHints = await confirm({
				message: "Include type hints?",
				default: true,
			});
			break;

		case "rest-client":
			config.httpClient = await select({
				message: "HTTP client library:",
				choices: [
					{ name: "Fetch (native)", value: "fetch" },
					{ name: "Axios", value: "axios" },
					{ name: "Node fetch", value: "node-fetch" },
				],
				default: "fetch",
			});

			config.authentication = await select({
				message: "Authentication type:",
				choices: [
					{ name: "None", value: "none" },
					{ name: "Bearer token", value: "bearer" },
					{ name: "Basic auth", value: "basic" },
					{ name: "OAuth2", value: "oauth2" },
				],
				default: "none",
			});
			break;
	}

	return config;
}

/**
 * Prompt for confirmation with custom message
 */
export async function promptConfirm(
	message: string,
	defaultValue = false,
): Promise<boolean> {
	return await confirm({
		message,
		default: defaultValue,
	});
}

/**
 * Prompt for text input with validation
 */
export async function promptInput(
	message: string,
	options?: {
		default?: string;
		validate?: (value: string) => boolean | string;
		transform?: (value: string) => string;
	},
): Promise<string> {
	return await input({
		message,
		default: options?.default,
		validate: options?.validate,
		transformer: options?.transform,
	});
}

/**
 * Show success message
 */
export function showSuccess(message: string): void {
	console.log(pc.green(`✅ ${message}`));
}

/**
 * Show error message
 */
export function showError(message: string): void {
	console.log(pc.red(`❌ ${message}`));
}

/**
 * Show warning message
 */
export function showWarning(message: string): void {
	console.log(pc.yellow(`⚠️  ${message}`));
}

/**
 * Show info message
 */
export function showInfo(message: string): void {
	console.log(pc.blue(`ℹ️  ${message}`));
}
