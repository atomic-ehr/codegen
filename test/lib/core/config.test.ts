/**
 * Unit tests for configuration interfaces and defaults
 */

import { describe, test, expect } from "bun:test";
import {
	type TypeSchemaConfig,
	type GeneratorConfig,
	type TypeScriptConfig,
	DEFAULT_TYPESCHEMA_CONFIG,
	DEFAULT_GENERATOR_CONFIG,
	DEFAULT_TYPESCRIPT_CONFIG,
} from "../../../src/lib/core/config";

describe("Configuration Types", () => {
	test("TypeSchemaConfig should have required properties", () => {
		const config: TypeSchemaConfig = {
			packages: ["hl7.fhir.r4.core"],
			outputFormat: "ndjson",
			validation: true,
		};

		expect(config.packages).toEqual(["hl7.fhir.r4.core"]);
		expect(config.outputFormat).toBe("ndjson");
		expect(config.validation).toBe(true);
	});

	test("TypeSchemaConfig should support optional properties", () => {
		const config: TypeSchemaConfig = {
			packages: ["hl7.fhir.r4.core"],
			profiles: ["hl7.fhir.us.core"],
			outputFormat: "separate",
			validation: false,
			treeshaking: ["Patient", "Observation"],
			workingDir: "/tmp/fhir",
			dropCache: true,
			verbose: true,
		};

		expect(config.profiles).toEqual(["hl7.fhir.us.core"]);
		expect(config.treeshaking).toEqual(["Patient", "Observation"]);
		expect(config.workingDir).toBe("/tmp/fhir");
		expect(config.dropCache).toBe(true);
		expect(config.verbose).toBe(true);
	});

	test("GeneratorConfig should have required properties", () => {
		const config: GeneratorConfig = {
			target: "typescript",
			outputDir: "./generated",
			includeComments: true,
			includeValidation: false,
			namespaceStyle: "nested",
		};

		expect(config.target).toBe("typescript");
		expect(config.outputDir).toBe("./generated");
		expect(config.includeComments).toBe(true);
		expect(config.includeValidation).toBe(false);
		expect(config.namespaceStyle).toBe("nested");
	});

	test("GeneratorConfig should support optional properties", () => {
		const config: GeneratorConfig = {
			target: "python",
			outputDir: "./output",
			includeComments: false,
			includeValidation: true,
			namespaceStyle: "flat",
			fileNaming: "snake_case",
			format: true,
			fileHeader: "// Auto-generated",
			overwrite: false,
			verbose: true,
		};

		expect(config.fileNaming).toBe("snake_case");
		expect(config.format).toBe(true);
		expect(config.fileHeader).toBe("// Auto-generated");
		expect(config.overwrite).toBe(false);
		expect(config.verbose).toBe(true);
	});

	test("TypeScriptConfig should extend LanguageConfig", () => {
		const config: TypeScriptConfig = {
			strict: true,
			target: "ES2020",
			module: "ES2020",
			declaration: true,
			baseTypesModule: "@types/fhir",
			useEnums: false,
			preferInterfaces: true,
		};

		expect(config.strict).toBe(true);
		expect(config.target).toBe("ES2020");
		expect(config.module).toBe("ES2020");
		expect(config.declaration).toBe(true);
		expect(config.baseTypesModule).toBe("@types/fhir");
		expect(config.useEnums).toBe(false);
		expect(config.preferInterfaces).toBe(true);
	});
});

describe("Default Configurations", () => {
	test("DEFAULT_TYPESCHEMA_CONFIG should have sensible defaults", () => {
		expect(DEFAULT_TYPESCHEMA_CONFIG.outputFormat).toBe("ndjson");
		expect(DEFAULT_TYPESCHEMA_CONFIG.validation).toBe(true);
		expect(DEFAULT_TYPESCHEMA_CONFIG.verbose).toBe(false);
		expect(DEFAULT_TYPESCHEMA_CONFIG.dropCache).toBe(false);
	});

	test("DEFAULT_GENERATOR_CONFIG should have sensible defaults", () => {
		expect(DEFAULT_GENERATOR_CONFIG.target).toBe("typescript");
		expect(DEFAULT_GENERATOR_CONFIG.includeComments).toBe(true);
		expect(DEFAULT_GENERATOR_CONFIG.includeValidation).toBe(false);
		expect(DEFAULT_GENERATOR_CONFIG.namespaceStyle).toBe("nested");
		expect(DEFAULT_GENERATOR_CONFIG.fileNaming).toBe("PascalCase");
		expect(DEFAULT_GENERATOR_CONFIG.format).toBe(true);
		expect(DEFAULT_GENERATOR_CONFIG.overwrite).toBe(true);
		expect(DEFAULT_GENERATOR_CONFIG.verbose).toBe(false);
	});

	test("DEFAULT_TYPESCRIPT_CONFIG should have TypeScript-specific defaults", () => {
		expect(DEFAULT_TYPESCRIPT_CONFIG.strict).toBe(true);
		expect(DEFAULT_TYPESCRIPT_CONFIG.target).toBe("ES2020");
		expect(DEFAULT_TYPESCRIPT_CONFIG.module).toBe("ES2020");
		expect(DEFAULT_TYPESCRIPT_CONFIG.declaration).toBe(true);
		expect(DEFAULT_TYPESCRIPT_CONFIG.useEnums).toBe(true);
		expect(DEFAULT_TYPESCRIPT_CONFIG.preferInterfaces).toBe(true);
	});

	test("defaults should be mergeable with user configs", () => {
		const userConfig: Partial<GeneratorConfig> = {
			target: "python",
			verbose: true,
		};

		const mergedConfig = {
			...DEFAULT_GENERATOR_CONFIG,
			...userConfig,
		};

		expect(mergedConfig.target).toBe("python"); // User override
		expect(mergedConfig.verbose).toBe(true); // User override
		expect(mergedConfig.includeComments).toBe(true); // Default value
		expect(mergedConfig.format).toBe(true); // Default value
	});
});