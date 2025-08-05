/**
 * Configuration Manager Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { ConfigManager } from "../../../src/lib/core/config-manager";
import type { AtomicCodegenConfig } from "../../../src/lib/core/config-schema";

describe("ConfigManager", () => {
	let testDir: string;
	let configManager: ConfigManager;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		testDir = join(tmpdir(), `config-test-${Date.now()}`);
		mkdirSync(testDir, { recursive: true });
		configManager = new ConfigManager();
		
		// Backup environment variables
		originalEnv = { ...process.env };
	});

	afterEach(() => {
		try {
			rmSync(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		
		// Restore environment variables
		process.env = originalEnv;
	});

	describe("Configuration File Loading", () => {
		test("should load JSON configuration file", async () => {
			const config = {
				project: { name: "test-project" },
				typeschema: { packages: ["hl7.fhir.r4.core"] },
			};
			
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, JSON.stringify(config, null, 2));

			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			expect(result.project?.name).toBe("test-project");
			expect(result.typeschema?.packages).toEqual(["hl7.fhir.r4.core"]);
		});

		test("should load configuration with default values", async () => {
			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			// Check that defaults are applied
			expect(result.typeschema?.outputFormat).toBe("ndjson");
			expect(result.typeschema?.validation).toBe(true);
			expect(result.generator?.target).toBe("typescript");
			expect(result.global?.verbose).toBe(false);
		});

		test("should handle missing configuration file gracefully", async () => {
			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			// Should return defaults when no config file exists
			expect(result).toBeDefined();
			expect(result.typeschema?.outputFormat).toBe("ndjson");
		});

		test("should throw error for invalid JSON", async () => {
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, "{ invalid json");

			await expect(configManager.loadConfig({
				workingDir: testDir,
			})).rejects.toThrow();
		});

		test("should find configuration file in parent directories", async () => {
			const parentDir = testDir;
			const childDir = join(testDir, "nested", "deeply");
			mkdirSync(childDir, { recursive: true });

			const config = { project: { name: "parent-config" } };
			const configPath = join(parentDir, ".atomic-codegen.json");
			writeFileSync(configPath, JSON.stringify(config));

			const result = await configManager.loadConfig({
				workingDir: childDir,
			});

			expect(result.project?.name).toBe("parent-config");
		});
	});

	describe("Environment Variables", () => {
		test("should load configuration from environment variables", async () => {
			process.env.ATOMIC_CODEGEN_VERBOSE = "true";
			process.env.ATOMIC_CODEGEN_OUTPUT_DIR = "/custom/output";
			process.env.ATOMIC_CODEGEN_TYPESCHEMA_FORMAT = "separate";
			process.env.ATOMIC_CODEGEN_TS_STRICT = "false";

			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			expect(result.global?.verbose).toBe(true);
			expect(result.global?.outputDir).toBe("/custom/output");
			expect(result.typeschema?.outputFormat).toBe("separate");
			expect(result.languages?.typescript?.strict).toBe(false);
		});

		test("should parse boolean environment variables correctly", async () => {
			// Test various boolean representations
			process.env.ATOMIC_CODEGEN_VERBOSE = "1";
			process.env.ATOMIC_CODEGEN_TYPESCHEMA_VALIDATION = "yes";
			process.env.ATOMIC_CODEGEN_DROP_CACHE = "on";
			process.env.ATOMIC_CODEGEN_TS_STRICT = "false";

			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			expect(result.global?.verbose).toBe(true);
			expect(result.typeschema?.validation).toBe(true);
			expect(result.typeschema?.dropCache).toBe(true);
			expect(result.languages?.typescript?.strict).toBe(false);
		});
	});

	describe("Configuration Precedence", () => {
		test("should prioritize CLI args over environment variables", async () => {
			process.env.ATOMIC_CODEGEN_VERBOSE = "false";

			const result = await configManager.loadConfig({
				workingDir: testDir,
				cliArgs: {
					global: { verbose: true },
				},
			});

			expect(result.global?.verbose).toBe(true);
		});

		test("should prioritize environment variables over config file", async () => {
			const config = {
				global: { verbose: false },
				typeschema: { outputFormat: "ndjson" as const },
			};
			
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, JSON.stringify(config));

			process.env.ATOMIC_CODEGEN_VERBOSE = "true";
			process.env.ATOMIC_CODEGEN_TYPESCHEMA_FORMAT = "separate";

			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			expect(result.global?.verbose).toBe(true);
			expect(result.typeschema?.outputFormat).toBe("separate");
		});

		test("should prioritize config file over defaults", async () => {
			const config = {
				typeschema: { 
					outputFormat: "merged" as const,
					validation: false,
				},
			};
			
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, JSON.stringify(config));

			const result = await configManager.loadConfig({
				workingDir: testDir,
			});

			expect(result.typeschema?.outputFormat).toBe("merged");
			expect(result.typeschema?.validation).toBe(false);
		});

		test("should track configuration sources", async () => {
			const config = { project: { name: "file-config" } };
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, JSON.stringify(config));

			process.env.ATOMIC_CODEGEN_VERBOSE = "true";

			await configManager.loadConfig({
				workingDir: testDir,
				cliArgs: { global: { outputDir: "/cli/output" } },
			});

			const sources = configManager.getConfigSources();
			expect(sources.has("default")).toBe(true);
			expect(sources.has("config-file")).toBe(true);
			expect(sources.has("environment")).toBe(true);
			expect(sources.has("cli-args")).toBe(true);
		});
	});

	describe("Configuration Validation", () => {
		test("should validate valid configuration", () => {
			const config: AtomicCodegenConfig = {
				typeschema: {
					packages: ["hl7.fhir.r4.core"],
					outputFormat: "ndjson",
					validation: true,
				},
				generator: {
					target: "typescript",
					outputDir: "./output",
					includeComments: true,
					includeValidation: false,
					namespaceStyle: "nested",
				},
			};

			const result = configManager.validateConfig(config);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("should catch invalid output format", () => {
			const config: AtomicCodegenConfig = {
				typeschema: {
					packages: ["hl7.fhir.r4.core"],
					outputFormat: "invalid" as any,
					validation: true,
				},
			};

			const result = configManager.validateConfig(config);
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].path).toBe("typeschema.outputFormat");
		});

		test("should catch invalid generator target", () => {
			const config: AtomicCodegenConfig = {
				generator: {
					target: "invalid" as any,
					outputDir: "./output",
					includeComments: true,
					includeValidation: false,
					namespaceStyle: "nested",
				},
			};

			const result = configManager.validateConfig(config);
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].path).toBe("generator.target");
		});

		test("should catch invalid TypeScript configuration", () => {
			const config: AtomicCodegenConfig = {
				languages: {
					typescript: {
						target: "INVALID" as any,
						module: "ALSO_INVALID" as any,
					},
				},
			};

			const result = configManager.validateConfig(config);
			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
			
			const targetError = result.errors.find(e => e.path === "languages.typescript.target");
			const moduleError = result.errors.find(e => e.path === "languages.typescript.module");
			
			expect(targetError).toBeDefined();
			expect(moduleError).toBeDefined();
		});

		test("should provide helpful error messages and suggestions", () => {
			const config: AtomicCodegenConfig = {
				typeschema: {
					packages: ["hl7.fhir.r4.core"],
					outputFormat: "xml" as any,
					validation: true,
				},
			};

			const result = configManager.validateConfig(config);
			expect(result.valid).toBe(false);
			expect(result.errors[0].message).toContain("Invalid output format");
			expect(result.errors[0].suggestion).toContain("ndjson");
		});
	});

	describe("Configuration Merging", () => {
		test("should merge nested configurations correctly", async () => {
			const config = {
				languages: {
					typescript: {
						strict: false,
						target: "ES5" as const,
					},
				},
				global: {
					cache: {
						enabled: false,
					},
				},
			};
			
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, JSON.stringify(config));

			process.env.ATOMIC_CODEGEN_TS_TARGET = "ES2020";

			const result = await configManager.loadConfig({
				workingDir: testDir,
				cliArgs: {
					global: {
						cache: { ttl: 7200 },
					},
				},
			});

			// TypeScript config should be merged
			expect(result.languages?.typescript?.strict).toBe(false); // from file
			expect(result.languages?.typescript?.target).toBe("ES2020"); // from env
			expect(result.languages?.typescript?.declaration).toBe(true); // from defaults

			// Cache config should be merged
			expect(result.global?.cache?.enabled).toBe(false); // from file
			expect(result.global?.cache?.ttl).toBe(7200); // from CLI
			expect(result.global?.cache?.maxSize).toBe(100); // from defaults
		});
	});

	describe("Error Handling", () => {
		test("should handle file read errors gracefully", async () => {
			const configPath = join(testDir, "nonexistent", ".atomic-codegen.json");

			await expect(configManager.loadConfig({
				configPath,
			})).rejects.toThrow();
		});

		test("should provide clear error messages for invalid files", async () => {
			const configPath = join(testDir, ".atomic-codegen.json");
			writeFileSync(configPath, "not valid json at all");

			await expect(configManager.loadConfig({
				workingDir: testDir,
			})).rejects.toThrow(/Failed to load configuration file/);
		});
	});
});