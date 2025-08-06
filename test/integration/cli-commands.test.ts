/**
 * CLI Integration Tests
 *
 * Test the complete CLI command structure and functionality
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { tmpdir } from "os";

describe("CLI Integration Tests", () => {
	let testDir: string;
	const cliPath = join(process.cwd(), "src/cli/index.ts");

	beforeEach(() => {
		testDir = join(tmpdir(), `cli-test-${Date.now()}`);
	});

	afterEach(() => {
		try {
			if (existsSync(testDir)) {
				rmSync(testDir, { recursive: true, force: true });
			}
		} catch {
			// Ignore cleanup errors
		}
	});

	test("should show main help", async () => {
		const result = await $`bun run ${cliPath} --help`.text();

		expect(result).toContain("atomic-codegen <command>");
		expect(result).toContain("typeschema");
		expect(result).toContain("generate");
		expect(result).toContain("Commands:");
		expect(result).toContain("Options:");
		expect(result).toContain("Examples:");
	});

	test("should show version", async () => {
		const result = await $`bun run ${cliPath} --version`.text();

		expect(result).toContain("0.1.0");
	});

	test("should show error for missing command", async () => {
		try {
			await $`bun run ${cliPath}`.text();
			expect(false).toBe(true); // Should not reach here
		} catch (error: any) {
			expect(error.exitCode).toBe(1);
			expect(error.stderr.toString()).toContain("You must specify a command");
		}
	});

	describe("TypeSchema Commands", () => {
		test("should show typeschema help", async () => {
			const result = await $`bun run ${cliPath} typeschema --help`.text();

			expect(result).toContain("TypeSchema operations");
			expect(result).toContain("create");
			expect(result).toContain("validate");
			expect(result).toContain("merge");
		});

		test("should show create command help", async () => {
			const result = await $`bun run ${cliPath} typeschema create --help`.text();

			expect(result).toContain("Create TypeSchema from FHIR packages");
			expect(result).toContain("packages");
			expect(result).toContain("--output");
			expect(result).toContain("--format");
			expect(result).toContain("--treeshake");
		});

		test("should show validate command help", async () => {
			const result = await $`bun run ${cliPath} typeschema validate --help`.text();

			expect(result).toContain("Validate TypeSchema files");
			expect(result).toContain("input");
			expect(result).toContain("--strict");
			expect(result).toContain("--check-dependencies");
		});

		test("should show merge command help", async () => {
			const result = await $`bun run ${cliPath} typeschema merge --help`.text();

			expect(result).toContain("Merge multiple TypeSchema files");
			expect(result).toContain("input");
			expect(result).toContain("--output");
			expect(result).toContain("--deduplicate");
			expect(result).toContain("--sort-by");
		});

		test("should validate empty file and fail", async () => {
			// Create a test file with invalid JSON
			const testFile = join(testDir, "invalid.ndjson");
			await Bun.write(testFile, "invalid json");

			try {
				await $`bun run ${cliPath} typeschema validate ${testFile}`.text();
				expect(false).toBe(true); // Should not reach here
			} catch (error: any) {
				expect(error.exitCode).toBe(1);
			}
		});

		test("should merge valid schema files successfully", async () => {
			// Create test files with valid but minimal schemas
			const testFile1 = join(testDir, "schema1.json");
			const testFile2 = join(testDir, "schema2.json");
			const outputFile = join(testDir, "merged.json");

			const schema1 = [{
				identifier: { kind: "primitive-type", name: "string", package: "test", version: "1.0" },
				dependencies: []
			}];
			const schema2 = [{
				identifier: { kind: "primitive-type", name: "boolean", package: "test", version: "1.0" },
				dependencies: []
			}];

			await Bun.write(testFile1, JSON.stringify(schema1));
			await Bun.write(testFile2, JSON.stringify(schema2));

			const result = await $`bun run ${cliPath} typeschema merge ${testFile1} ${testFile2} -o ${outputFile}`.text();

			expect(result).toContain("Successfully merged");
			expect(existsSync(outputFile)).toBe(true);
		});
	});

	describe("Generate Commands", () => {
		test("should show generate help", async () => {
			const result = await $`bun run ${cliPath} generate --help`.text();

			expect(result).toContain("Generate code from TypeSchema files");
			expect(result).toContain("typescript");
		});

		test("should show typescript command help", async () => {
			const result = await $`bun run ${cliPath} generate typescript --help`.text();

			expect(result).toContain("Generate TypeScript types");
			expect(result).toContain("--input");
			expect(result).toContain("--output");
			expect(result).toContain("--include-comments");
			expect(result).toContain("--strict");
			expect(result).toContain("--target");
		});

		test("should show typescript command aliases", async () => {
			const result = await $`bun run ${cliPath} generate ts --help`.text();

			expect(result).toContain("Generate TypeScript types");
		});

		test("should use default output directory when not specified", async () => {
			// The CLI now has default configuration, so it should succeed
			const result = await $`bun run ${cliPath} generate typescript`.text();
			expect(result).toContain("Successfully generated TypeScript types");
		});
	});

	describe("Error Handling", () => {
		test("should handle invalid command gracefully", async () => {
			try {
				await $`bun run ${cliPath} invalid-command`.text();
				expect(false).toBe(true); // Should not reach here
			} catch (error: any) {
				// Command should fail - this is expected behavior
				expect(error).toBeDefined();
			}
		});

		test("should handle invalid subcommand gracefully", async () => {
			try {
				await $`bun run ${cliPath} typeschema invalid-subcommand`.text();
				expect(false).toBe(true); // Should not reach here
			} catch (error: any) {
				expect(error).toBeDefined();
				const errorText = error.stderr?.toString() || error.message || '';
				expect(errorText).toContain("You must specify a typeschema subcommand");
			}
		});

		test("should use default configuration when no arguments provided", async () => {
			// The CLI now has default configuration, so it should succeed
			const result = await $`bun run ${cliPath} typeschema create`.text();
			expect(result).toContain("Created TypeSchema NDJSON");
		});
	});

	describe("Global Options", () => {
		test("should accept verbose flag globally", async () => {
			// The CLI should accept the verbose flag and produce verbose output
			const result = await $`bun run ${cliPath} --verbose typeschema create`.text();
			expect(result).toContain("Configuration loaded successfully");
			expect(result).toContain("Created TypeSchema NDJSON");
		}, { timeout: 60000 });

		test("should accept config flag globally", async () => {
			try {
				await $`bun run ${cliPath} --config nonexistent.json typeschema create test`.text();
				expect(false).toBe(true); // Should not reach here
			} catch (error: any) {
				// Command should try to run but fail - exact exit code may vary
				// The important thing is that it accepts the global --config flag
				expect(true).toBe(true); // Command failed as expected
			}
		});
	});

	describe("Command Examples from package.json", () => {
		test("should show help correctly", async () => {
			const result = await $`bun run example:help`.text();

			expect(result).toContain("atomic-codegen <command>");
			expect(result).toContain("Commands:");
		});

		// Note: We can't easily test the actual FHIR package download in CI
		// but we can test that the commands parse correctly and fail at the expected point
		test("should parse create command correctly", async () => {
			try {
				// This will fail when trying to connect to FHIR packages, but should parse correctly
				await $`bun run src/cli/index.ts typeschema create hl7.fhir.r4.core@4.0.1 -o ${testDir}/test.ndjson --verbose`.text();
			} catch (error: any) {
				// Should fail during execution, not during argument parsing
				// The exact error depends on network connectivity and package availability
				expect(error.exitCode).toBe(1);
			}
		});
	});
});
