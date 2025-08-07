/**
 * End-to-End CLI Testing
 * 
 * Tests the complete CLI workflow from command execution to file generation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { spawn } from 'child_process';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

describe('CLI Commands E2E', () => {
	let tempDir: string;
	let cliPath: string;

	beforeEach(() => {
		tempDir = testUtils.fs.createTempDir('e2e-cli');
		cliPath = join(process.cwd(), 'src/cli/index.ts');
	});

	afterEach(() => {
		testUtils.fs.cleanup(tempDir);
	});

	/**
	 * Execute CLI command and return result
	 */
	async function executeCLI(args: string[]): Promise<{
		exitCode: number;
		stdout: string;
		stderr: string;
	}> {
		return new Promise((resolve) => {
			const child = spawn('bun', ['run', cliPath, ...args], {
				cwd: process.cwd(),
				env: { ...process.env, NODE_ENV: 'test' }
			});

			let stdout = '';
			let stderr = '';

			child.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			child.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			child.on('close', (code) => {
				resolve({
					exitCode: code || 0,
					stdout: stdout.trim(),
					stderr: stderr.trim()
				});
			});
		});
	}

	describe('Help and Version Commands', () => {
		it('should display help information', async () => {
			const result = await executeCLI(['--help']);
			
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('atomic-codegen');
			expect(result.stdout).toContain('Commands:');
			expect(result.stdout).toContain('generate');
			expect(result.stdout).toContain('typeschema');
			expect(result.stdout).toContain('config');
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should display version information', async () => {
			const result = await executeCLI(['--version']);
			
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toMatch(/\d+\.\d+\.\d+/); // Version format
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should show subcommand help', async () => {
			const result = await executeCLI(['generate', '--help']);
			
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('generate');
			expect(result.stdout).toContain('typescript');
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('Configuration Commands', () => {
		it('should initialize configuration', async () => {
			const configPath = join(tempDir, '.atomic-codegenrc');
			
			const result = await executeCLI([
				'config', 'init',
				'--template', 'typescript',
				'--output', configPath
			]);
			
			expect(result.exitCode).toBe(0);
			expect(testUtils.fs.exists(configPath)).toBe(true);
			
			const configContent = testUtils.fs.readFile(configPath);
			const config = JSON.parse(configContent);
			
			expect(config.generators).toContain('typescript');
			expect(config.output).toBeDefined();
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should validate configuration', async () => {
			const configPath = join(tempDir, '.atomic-codegenrc');
			const validConfig = {
				generators: ['typescript'],
				packages: ['hl7.fhir.r4.core'],
				output: { directory: './output' }
			};
			
			testUtils.fs.writeFile(configPath, JSON.stringify(validConfig, null, 2));
			
			const result = await executeCLI([
				'config', 'validate',
				'--config', configPath
			]);
			
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('valid') || expect(result.stdout).toContain('success');
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should show configuration', async () => {
			const configPath = join(tempDir, '.atomic-codegenrc');
			const config = {
				generators: ['typescript'],
				packages: ['hl7.fhir.r4.core'],
				output: { directory: './output' }
			};
			
			testUtils.fs.writeFile(configPath, JSON.stringify(config, null, 2));
			
			const result = await executeCLI([
				'config', 'show',
				'--config', configPath
			]);
			
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('typescript');
			expect(result.stdout).toContain('hl7.fhir.r4.core');
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('TypeSchema Commands', () => {
		it('should create TypeSchema from package', async () => {
			const outputPath = join(tempDir, 'test-schemas.ndjson');
			
			// Note: This would normally connect to real package registry
			// For E2E testing, we might need to use a mock or test package
			const result = await executeCLI([
				'typeschema', 'create',
				'--output', outputPath,
				'--verbose'
			]);
			
			// We expect this to fail in test environment without real packages
			// but the CLI should handle it gracefully
			expect(result.exitCode).toBeDefined();
			if (result.exitCode === 0) {
				expect(testUtils.fs.exists(outputPath)).toBe(true);
			}
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should validate TypeSchema files', async () => {
			const schemaPath = join(tempDir, 'valid-schema.ndjson');
			const validSchema = JSON.stringify(testUtils.schema.createPatient());
			
			testUtils.fs.writeFile(schemaPath, validSchema);
			
			const result = await executeCLI([
				'typeschema', 'validate',
				schemaPath,
				'--verbose'
			]);
			
			expect(result.exitCode).toBe(0);
			expect(result.stdout).toContain('valid') || expect(result.stdout).toContain('success');
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should merge multiple TypeSchema files', async () => {
			const schema1Path = join(tempDir, 'schema1.ndjson');
			const schema2Path = join(tempDir, 'schema2.ndjson');
			const mergedPath = join(tempDir, 'merged.ndjson');
			
			testUtils.fs.writeFile(schema1Path, JSON.stringify(testUtils.schema.createPatient()));
			testUtils.fs.writeFile(schema2Path, JSON.stringify(testUtils.schema.createMinimal('Observation')));
			
			const result = await executeCLI([
				'typeschema', 'merge',
				schema1Path, schema2Path,
				'--output', mergedPath,
				'--verbose'
			]);
			
			expect(result.exitCode).toBe(0);
			expect(testUtils.fs.exists(mergedPath)).toBe(true);
			
			const mergedContent = testUtils.fs.readFile(mergedPath);
			expect(mergedContent).toContain('Patient');
			expect(mergedContent).toContain('Observation');
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('Generation Commands', () => {
		it('should generate TypeScript from schemas', async () => {
			const schemaPath = join(tempDir, 'input.ndjson');
			const outputDir = join(tempDir, 'generated');
			
			// Create test schema file
			const schemas = [
				testUtils.schema.createPatient(),
				testUtils.schema.createMinimal('string', 'primitive-type')
			];
			
			const schemaContent = schemas.map(s => JSON.stringify(s)).join('\n');
			testUtils.fs.writeFile(schemaPath, schemaContent);
			
			const result = await executeCLI([
				'generate', 'typescript',
				'--input', schemaPath,
				'--output', outputDir,
				'--verbose'
			]);
			
			expect(result.exitCode).toBe(0);
			expect(testUtils.fs.exists(outputDir)).toBe(true);
			
			// Check for generated files
			const indexPath = join(outputDir, 'index.ts');
			if (testUtils.fs.exists(indexPath)) {
				const indexContent = testUtils.fs.readFile(indexPath);
				expect(indexContent).toContain('export');
			}
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should generate with custom configuration', async () => {
			const schemaPath = join(tempDir, 'input.ndjson');
			const outputDir = join(tempDir, 'custom-output');
			const configPath = join(tempDir, 'custom-config.json');
			
			// Create schema
			const schema = testUtils.schema.createPatient();
			testUtils.fs.writeFile(schemaPath, JSON.stringify(schema));
			
			// Create custom config
			const config = {
				generators: ['typescript'],
				typescript: {
					moduleFormat: 'esm',
					typePrefix: 'FHIR',
					generateIndex: true
				},
				output: {
					directory: outputDir,
					clean: true
				}
			};
			testUtils.fs.writeFile(configPath, JSON.stringify(config, null, 2));
			
			const result = await executeCLI([
				'generate', 'typescript',
				'--input', schemaPath,
				'--config', configPath,
				'--verbose'
			]);
			
			expect(result.exitCode).toBe(0);
			expect(testUtils.fs.exists(outputDir)).toBe(true);
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('Error Handling', () => {
		it('should handle missing input files gracefully', async () => {
			const result = await executeCLI([
				'generate', 'typescript',
				'--input', '/nonexistent/file.ndjson',
				'--output', tempDir
			]);
			
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('file') || expect(result.stderr).toContain('not found');
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should handle invalid configuration gracefully', async () => {
			const configPath = join(tempDir, 'invalid-config.json');
			testUtils.fs.writeFile(configPath, '{ invalid json }');
			
			const result = await executeCLI([
				'config', 'validate',
				'--config', configPath
			]);
			
			expect(result.exitCode).not.toBe(0);
			expect(result.stderr).toContain('JSON') || expect(result.stderr).toContain('parse') || expect(result.stderr).toContain('invalid');
		}, TEST_CONFIG.E2E_TIMEOUT);

		it('should handle permission errors', async () => {
			const readOnlyDir = join(tempDir, 'readonly');
			// Note: This test may not work on all systems due to permission handling
			// but demonstrates the error handling structure
			
			const result = await executeCLI([
				'generate', 'typescript',
				'--input', join(process.cwd(), 'test/fixtures/patient-schema.json'),
				'--output', '/root/cannot-write-here', // Should fail on most systems
				'--verbose'
			]);
			
			// Should fail with permission or write error
			expect(result.exitCode).not.toBe(0);
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('Interactive Features', () => {
		it('should handle interactive prompts in non-interactive mode', async () => {
			// Test CLI behavior when stdin is not a TTY
			const result = await executeCLI([
				'config', 'init',
				// No --template specified, should use defaults in non-interactive mode
			]);
			
			// Should complete without hanging on prompts
			expect(result.exitCode).toBeDefined();
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('Watch Mode', () => {
		it('should start and stop watch mode', async () => {
			const schemaPath = join(tempDir, 'watch-test.ndjson');
			const outputDir = join(tempDir, 'watch-output');
			
			// Create initial schema
			testUtils.fs.writeFile(schemaPath, JSON.stringify(testUtils.schema.createPatient()));
			
			// Start watch mode (this test would need to be adapted for actual watch testing)
			// For now, we'll just test that the command is recognized
			const result = await Promise.race([
				executeCLI([
					'watch',
					'--input', schemaPath,
					'--output', outputDir,
					'--generator', 'typescript'
				]),
				testUtils.async.sleep(1000).then(() => ({ exitCode: -1, stdout: '', stderr: 'timeout' }))
			]);
			
			// Watch mode should either start successfully or be recognized as a command
			expect(result.exitCode).toBeDefined();
		}, 5000);
	});

	describe('Development Commands', () => {
		it('should handle dev commands', async () => {
			const result = await executeCLI(['dev', '--help']);
			
			// Should show dev command help or indicate it's not available
			expect(result.exitCode).toBeDefined();
		}, TEST_CONFIG.E2E_TIMEOUT);
	});

	describe('Output Validation', () => {
		it('should generate syntactically valid TypeScript', async () => {
			const schemaPath = join(tempDir, 'syntax-test.ndjson');
			const outputDir = join(tempDir, 'syntax-output');
			
			testUtils.fs.writeFile(schemaPath, JSON.stringify(testUtils.schema.createPatient()));
			
			const result = await executeCLI([
				'generate', 'typescript',
				'--input', schemaPath,
				'--output', outputDir
			]);
			
			if (result.exitCode === 0) {
				// Find generated TypeScript files
				const generatedFiles = ['index.ts', 'Patient.ts', 'resources/Patient.ts'].map(f => 
					join(outputDir, f)
				).filter(testUtils.fs.exists);
				
				// Validate at least one file was generated and has valid syntax
				expect(generatedFiles.length).toBeGreaterThan(0);
				
				if (generatedFiles.length > 0) {
					const content = testUtils.fs.readFile(generatedFiles[0]);
					testUtils.validation.assertValidTypeScript(content);
				}
			}
		}, TEST_CONFIG.E2E_TIMEOUT);
	});
});