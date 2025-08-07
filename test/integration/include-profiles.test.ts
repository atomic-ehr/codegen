import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { APIBuilder } from '../../src/api/builder';

describe('includeProfiles configuration', () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(process.cwd(), 'test-output-profiles');
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(tempDir)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('should not generate profiles directory when includeProfiles is false', async () => {
		const builder = new APIBuilder({
			outputDir: tempDir,
			verbose: false,
			overwrite: true,
			validate: false,
			cache: false,
		});

		// Load a small FHIR package for testing
		builder.fromPackage('hl7.fhir.r4.core', '4.0.1');

		// Configure TypeScript generation with includeProfiles: false
		builder.typescript({
			moduleFormat: 'esm',
			generateIndex: true,
			includeDocuments: false,
			namingConvention: 'PascalCase',
			// strictMode: true, // This option doesn't exist
			generateValidators: false,
			generateGuards: false,
			includeProfiles: false, // This should prevent profiles generation
		});

		// Generate the code
		await builder.generate();

		// Check that profiles directory was NOT created
		const profilesDir = join(tempDir, 'types', 'profiles');
		expect(existsSync(profilesDir)).toBe(false);

		// Check that regular types were still generated
		const typesDir = join(tempDir, 'types');
		expect(existsSync(typesDir)).toBe(true);
	});

	it('should generate profiles directory when includeProfiles is true', async () => {
		const builder = new APIBuilder({
			outputDir: tempDir,
			verbose: false,
			overwrite: true,
			validate: false,
			cache: false,
		});

		// Use mock schemas instead of downloading packages to avoid network hangs
		const mockSchemas = [
			{
				identifier: {
					kind: "resource" as const,
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "Patient",
					url: "http://hl7.org/fhir/StructureDefinition/Patient",
				},
				fields: {},
				dependencies: [],
			},
			{
				identifier: {
					kind: "profile" as const,
					package: "hl7.fhir.r4.core",
					version: "4.0.1",
					name: "USCorePatient",
					url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
				},
				fields: {},
				dependencies: [],
			}
		];
		builder.fromSchemas(mockSchemas);

		// Configure TypeScript generation with includeProfiles: true
		builder.typescript({
			moduleFormat: 'esm',
			generateIndex: true,
			includeDocuments: false,
			namingConvention: 'PascalCase',
			// strictMode: true, // This option doesn't exist
			generateValidators: false,
			generateGuards: false,
			includeProfiles: true, // This should enable profiles generation
		});

		// Generate the code
		await builder.generate();

		// Check that profiles directory was created
		const profilesDir = join(tempDir, 'types', 'profiles');
		expect(existsSync(profilesDir)).toBe(true);

		// Check that regular types were also generated
		const typesDir = join(tempDir, 'types');
		expect(existsSync(typesDir)).toBe(true);
	});
});
