/**
 * Test Utilities
 * 
 * Common utilities and helpers for testing across the codebase.
 */

import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { performance } from 'perf_hooks';
import type { AnyTypeSchema } from '../src/typeschema/types';
import type { PackageInfo } from '../src/typeschema/types';

/**
 * Test utilities object containing all helper functions
 */
export const testUtils = {
	// File system utilities
	fs: {
		/**
		 * Create a temporary directory for test isolation
		 */
		createTempDir(name: string): string {
			const tempDir = join(TEST_CONFIG.TEMP_DIR, `test-${Date.now()}-${name}`);
			mkdirSync(tempDir, { recursive: true });
			return tempDir;
		},

		/**
		 * Write content to a file, creating directories as needed
		 */
		writeFile(filePath: string, content: string): void {
			const dir = dirname(filePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			writeFileSync(filePath, content, 'utf-8');
		},

		/**
		 * Read file content as string
		 */
		readFile(filePath: string): string {
			return readFileSync(filePath, 'utf-8');
		},

		/**
		 * Check if file exists
		 */
		exists(filePath: string): boolean {
			return existsSync(filePath);
		},

		/**
		 * Clean up a directory
		 */
		cleanup(dirPath: string): void {
			if (existsSync(dirPath)) {
				rmSync(dirPath, { recursive: true, force: true });
			}
		},

		/**
		 * Create a test fixture file
		 */
		createFixture(name: string, content: string): string {
			const fixturePath = join(TEST_CONFIG.FIXTURES_DIR, name);
			this.writeFile(fixturePath, content);
			return fixturePath;
		}
	},

	// Schema utilities
	schema: {
		/**
		 * Create a minimal valid TypeSchema
		 */
		createMinimal(name: string, kind: string = 'resource'): AnyTypeSchema {
			return {
				identifier: {
					name,
					kind: kind as any,
					url: `http://example.com/${name}`,
					package: 'test-package',
					version: '1.0.0'
				},
				description: `Test ${name} schema`,
				fields: {}
			};
		},

		/**
		 * Create a TypeSchema with fields
		 */
		createWithFields(name: string, fields: Record<string, any>, kind: string = 'resource'): AnyTypeSchema {
			return {
				identifier: {
					name,
					kind: kind as any,
					url: `http://example.com/${name}`,
					package: 'test-package',
					version: '1.0.0'
				},
				description: `Test ${name} schema with fields`,
				fields
			};
		},

		/**
		 * Create a Patient resource schema for testing
		 */
		createPatient(): AnyTypeSchema {
			return this.createWithFields('Patient', {
				id: {
					type: { name: 'id', kind: 'primitive-type', url: 'http://hl7.org/fhir/id', package: 'hl7.fhir.r4.core', version: '4.0.1' },
					required: false,
					description: 'Logical id of this artifact'
				},
				name: {
					type: { name: 'HumanName', kind: 'complex-type', url: 'http://hl7.org/fhir/HumanName', package: 'hl7.fhir.r4.core', version: '4.0.1' },
					array: true,
					required: false,
					description: 'A name associated with the patient'
				},
				gender: {
					type: { name: 'code', kind: 'primitive-type', url: 'http://hl7.org/fhir/code', package: 'hl7.fhir.r4.core', version: '4.0.1' },
					enum: ['male', 'female', 'other', 'unknown'],
					required: false,
					description: 'Administrative Gender'
				}
			});
		},

		/**
		 * Create a collection of test schemas
		 */
		createCollection(): AnyTypeSchema[] {
			return [
				this.createPatient(),
				this.createWithFields('Observation', {
					status: {
						type: { name: 'code', kind: 'primitive-type', url: 'http://hl7.org/fhir/code', package: 'hl7.fhir.r4.core', version: '4.0.1' },
						enum: ['registered', 'preliminary', 'final', 'amended'],
						required: true,
						description: 'Status of the observation'
					},
					subject: {
						reference: [{ name: 'Patient', kind: 'resource', url: 'http://hl7.org/fhir/Patient', package: 'hl7.fhir.r4.core', version: '4.0.1' }],
						required: true,
						description: 'Who and/or what the observation is about'
					}
				}),
				this.createMinimal('string', 'primitive-type'),
				this.createMinimal('id', 'primitive-type')
			];
		}
	},

	// Mock utilities
	mock: {
		/**
		 * Create mock package info
		 */
		createPackageInfo(name: string = 'test-package', version: string = '1.0.0'): PackageInfo {
			return {
				name,
				version,
				canonical: `http://example.com/${name}`,
				fhirVersions: ['4.0.1']
			};
		},

		/**
		 * Create a mock console that captures output
		 */
		createConsole() {
			const logs: string[] = [];
			const warnings: string[] = [];
			const errors: string[] = [];

			return {
				log: (...args: any[]) => logs.push(args.join(' ')),
				warn: (...args: any[]) => warnings.push(args.join(' ')),
				error: (...args: any[]) => errors.push(args.join(' ')),
				getLogs: () => logs,
				getWarnings: () => warnings,
				getErrors: () => errors,
				clear: () => {
					logs.length = 0;
					warnings.length = 0;
					errors.length = 0;
				}
			};
		}
	},

	// Performance utilities
	performance: {
		/**
		 * Measure execution time of a function
		 */
		async measure<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
			const start = performance.now();
			const result = await fn();
			const end = performance.now();
			const duration = Math.round(end - start);
			
			console.log(`⏱️  ${name}: ${duration}ms`);
			return { result, duration };
		},

		/**
		 * Measure synchronous function execution
		 */
		measureSync<T>(name: string, fn: () => T): { result: T; duration: number } {
			const start = performance.now();
			const result = fn();
			const end = performance.now();
			const duration = Math.round(end - start);
			
			console.log(`⏱️  ${name}: ${duration}ms`);
			return { result, duration };
		},

		/**
		 * Assert that a function executes within a time threshold
		 */
		async assertPerformance<T>(
			name: string,
			fn: () => Promise<T>,
			thresholdMs: number
		): Promise<T> {
			const { result, duration } = await this.measure(name, fn);
			
			if (duration > thresholdMs) {
				throw new Error(`Performance threshold exceeded: ${name} took ${duration}ms (threshold: ${thresholdMs}ms)`);
			}
			
			return result;
		}
	},

	// Snapshot utilities
	snapshot: {
		/**
		 * Save a snapshot for comparison
		 */
		save(name: string, content: string): void {
			const snapshotPath = join(TEST_CONFIG.SNAPSHOTS_DIR, `${name}.snap`);
			testUtils.fs.writeFile(snapshotPath, content);
		},

		/**
		 * Load a snapshot for comparison
		 */
		load(name: string): string | null {
			const snapshotPath = join(TEST_CONFIG.SNAPSHOTS_DIR, `${name}.snap`);
			try {
				return testUtils.fs.readFile(snapshotPath);
			} catch {
				return null;
			}
		},

		/**
		 * Compare content with saved snapshot
		 */
		compare(name: string, content: string): boolean {
			const savedSnapshot = this.load(name);
			if (!savedSnapshot) {
				this.save(name, content);
				return true;
			}
			return savedSnapshot === content;
		},

		/**
		 * Assert content matches snapshot
		 */
		expectToMatchSnapshot(name: string, content: string): void {
			const savedSnapshot = this.load(name);
			
			if (!savedSnapshot) {
				// First run - save the snapshot
				this.save(name, content);
				console.log(`📸 Snapshot saved: ${name}`);
				return;
			}
			
			if (savedSnapshot !== content) {
				// Save actual for debugging
				this.save(`${name}.actual`, content);
				throw new Error(`Snapshot mismatch for ${name}. Run with UPDATE_SNAPSHOTS=1 to update.`);
			}
		},

		/**
		 * Update snapshot if UPDATE_SNAPSHOTS environment variable is set
		 */
		maybeUpdate(name: string, content: string): void {
			if (process.env.UPDATE_SNAPSHOTS === '1') {
				this.save(name, content);
				console.log(`📸 Snapshot updated: ${name}`);
			} else {
				this.expectToMatchSnapshot(name, content);
			}
		}
	},

	// Validation utilities
	validation: {
		/**
		 * Assert that a value is a valid TypeScript identifier
		 */
		assertValidTSIdentifier(identifier: string): void {
			const tsIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
			if (!tsIdentifierRegex.test(identifier)) {
				throw new Error(`Invalid TypeScript identifier: "${identifier}"`);
			}
		},

		/**
		 * Assert that generated code is syntactically valid TypeScript
		 */
		assertValidTypeScript(code: string): void {
			// Basic validation - check for common syntax issues
			const openBraces = (code.match(/\{/g) || []).length;
			const closeBraces = (code.match(/\}/g) || []).length;
			
			if (openBraces !== closeBraces) {
				throw new Error('Mismatched braces in generated TypeScript code');
			}
			
			const openParens = (code.match(/\(/g) || []).length;
			const closeParens = (code.match(/\)/g) || []).length;
			
			if (openParens !== closeParens) {
				throw new Error('Mismatched parentheses in generated TypeScript code');
			}
		}
	},

	// Async utilities
	async: {
		/**
		 * Wait for a specified amount of time
		 */
		sleep(ms: number): Promise<void> {
			return new Promise(resolve => setTimeout(resolve, ms));
		},

		/**
		 * Retry an async operation with backoff
		 */
		async retry<T>(
			fn: () => Promise<T>,
			maxAttempts: number = 3,
			delay: number = 100
		): Promise<T> {
			let lastError: Error;
			
			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				try {
					return await fn();
				} catch (error) {
					lastError = error as Error;
					
					if (attempt < maxAttempts) {
						await this.sleep(delay * attempt); // Exponential backoff
					}
				}
			}
			
			throw lastError!;
		}
	}
};