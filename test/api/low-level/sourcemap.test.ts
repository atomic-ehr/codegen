/**
 * Source Map Generation Tests
 * 
 * Tests for source map generation support including source map generators,
 * builders, VLQ encoding, and multi-file source map management.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	SourceMapGenerator,
	SourceMapBuilder,
	SourceMapUtils,
	type SourceMap,
	type SourceMapMapping,
	type SourceMapOptions,
	type MappingContext
} from '../../../src/api/low-level/sourcemap';
import { ASTBuilder, type InterfaceDeclaration } from '../../../src/api/low-level/ast';
import { CodeFragmentBuilder, type CodeFragment } from '../../../src/api/low-level/fragment';

describe('SourceMapGenerator', () => {
	let generator: SourceMapGenerator;
	let builder: ASTBuilder;
	let fragmentBuilder: CodeFragmentBuilder;

	beforeEach(() => {
		generator = new SourceMapGenerator({
			file: 'generated.ts',
			sourceRoot: 'src'
		});
		builder = new ASTBuilder();
		fragmentBuilder = new CodeFragmentBuilder();
	});

	describe('Basic Mapping', () => {
		it('should add mapping between generated and original code', () => {
			generator.addMapping(1, 0, 'original.ts', 1, 0, 'interfaceName');

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.sources).toContain('original.ts');
			expect(sourceMap.names).toContain('interfaceName');
			expect(sourceMap.mappings).toBeDefined();
		});

		it('should handle mappings without source information', () => {
			generator.addMapping(1, 0);

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.mappings).toBeDefined();
			expect(sourceMap.sources).toHaveLength(0);
			expect(sourceMap.names).toHaveLength(0);
		});

		it('should track multiple sources', () => {
			generator.addMapping(1, 0, 'file1.ts', 1, 0);
			generator.addMapping(2, 0, 'file2.ts', 1, 0);
			generator.addMapping(3, 0, 'file1.ts', 2, 0);

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.sources).toHaveLength(2);
			expect(sourceMap.sources).toContain('file1.ts');
			expect(sourceMap.sources).toContain('file2.ts');
		});

		it('should track multiple names', () => {
			generator.addMapping(1, 0, 'file.ts', 1, 0, 'name1');
			generator.addMapping(2, 0, 'file.ts', 2, 0, 'name2');
			generator.addMapping(3, 0, 'file.ts', 3, 0, 'name1'); // Duplicate

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.names).toHaveLength(2);
			expect(sourceMap.names).toContain('name1');
			expect(sourceMap.names).toContain('name2');
		});
	});

	describe('AST Node Mapping', () => {
		it('should add mapping from AST node', () => {
			const interface_ = builder.createInterface('Patient');
			interface_.sourceRange = {
				filename: 'patient.ts',
				start: { line: 1, column: 0, offset: 0 },
				end: { line: 3, column: 1, offset: 50 }
			};

			generator.addNodeMapping(interface_, 10, 5);

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.sources).toContain('patient.ts');
			expect(sourceMap.names).toContain('Patient');
		});

		it('should handle nodes without source range', () => {
			const interface_ = builder.createInterface('Patient');
			// No sourceRange set

			generator.addNodeMapping(interface_, 10, 5);

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.sources).toHaveLength(0);
		});
	});

	describe('Fragment Mapping', () => {
		it('should add mapping from code fragment', () => {
			const fragment = fragmentBuilder.create('interface Patient {}', {
				sourceRange: {
					filename: 'schema.json',
					start: { line: 5, column: 2, offset: 100 },
					end: { line: 10, column: 3, offset: 200 }
				}
			});

			generator.addFragmentMapping(fragment, 1, 0);

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.sources).toContain('schema.json');
		});
	});

	describe('Generated Code Tracking', () => {
		it('should track single line code', () => {
			generator.addGeneratedCode('interface Patient {}');

			const position = generator.getCurrentPosition();

			expect(position.line).toBe(1);
			expect(position.column).toBe(19); // Length of the string
		});

		it('should track multi-line code', () => {
			const code = `interface Patient {
  id: string;
  name: string;
}`;

			generator.addGeneratedCode(code);

			const position = generator.getCurrentPosition();

			expect(position.line).toBe(4);
			expect(position.column).toBe(1); // After the closing brace
		});

		it('should handle mixed single and multi-line additions', () => {
			generator.addGeneratedCode('interface Patient {');
			generator.addGeneratedCode('\n  id: string;');
			generator.addGeneratedCode('\n}');

			const position = generator.getCurrentPosition();

			expect(position.line).toBe(3);
			expect(position.column).toBe(1);
		});
	});

	describe('Source Map Generation', () => {
		it('should generate complete source map', () => {
			generator.addMapping(1, 0, 'input.ts', 1, 0, 'Patient');
			generator.addMapping(1, 10, 'input.ts', 1, 10, 'interface');
			generator.addMapping(2, 2, 'input.ts', 2, 2, 'id');

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.version).toBe(3);
			expect(sourceMap.file).toBe('generated.ts');
			expect(sourceMap.sourceRoot).toBe('src');
			expect(sourceMap.sources).toHaveLength(1);
			expect(sourceMap.names).toHaveLength(3);
			expect(sourceMap.mappings).toBeDefined();
		});

		it('should respect source map options', () => {
			const generatorWithoutContent = new SourceMapGenerator({
				file: 'test.ts',
				includeSourcesContent: false,
				includeNames: false
			});

			generatorWithoutContent.addMapping(1, 0, 'input.ts', 1, 0, 'test');

			const sourceMap = generatorWithoutContent.generateSourceMap();

			expect(sourceMap.sourcesContent).toBeUndefined();
			expect(sourceMap.names).toHaveLength(0);
		});
	});

	describe('Inline Source Map', () => {
		it('should generate inline source map comment', () => {
			generator.addMapping(1, 0, 'input.ts', 1, 0);

			const inline = generator.generateInlineSourceMap();

			expect(inline).toMatch(/^\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,/);
		});
	});

	describe('Source Map Comment', () => {
		it('should generate source map file reference comment', () => {
			const comment = generator.generateSourceMapComment();

			expect(comment).toBe('//# sourceMappingURL=generated.ts.map');
		});

		it('should use custom output file name', () => {
			const customGenerator = new SourceMapGenerator({
				file: 'output.ts',
				outputSourceMapFile: 'custom.map'
			});

			const comment = customGenerator.generateSourceMapComment();

			expect(comment).toBe('//# sourceMappingURL=custom.map');
		});
	});

	describe('Generator Reset', () => {
		it('should reset generator state', () => {
			generator.addMapping(1, 0, 'input.ts', 1, 0, 'test');
			generator.addGeneratedCode('test code');

			generator.reset();

			const sourceMap = generator.generateSourceMap();
			const position = generator.getCurrentPosition();

			expect(sourceMap.sources).toHaveLength(0);
			expect(sourceMap.names).toHaveLength(0);
			expect(position.line).toBe(1);
			expect(position.column).toBe(0);
		});
	});

	describe('Child Generator', () => {
		it('should create child generator with inherited options', () => {
			const child = generator.createChild({ file: 'child.ts' });

			expect(child).toBeInstanceOf(SourceMapGenerator);
			// Child should have different file but same sourceRoot
		});
	});
});

describe('SourceMapBuilder', () => {
	let builder: SourceMapBuilder;
	let fragmentBuilder: CodeFragmentBuilder;

	beforeEach(() => {
		builder = new SourceMapBuilder('main.ts', { sourceRoot: 'src' });
		fragmentBuilder = new CodeFragmentBuilder();
	});

	describe('Generator Management', () => {
		it('should create generator for specific file', () => {
			const generator = builder.createGenerator('component.ts', {
				includeSourcesContent: false
			});

			expect(generator).toBeInstanceOf(SourceMapGenerator);

			const retrieved = builder.getGenerator('component.ts');
			expect(retrieved).toBe(generator);
		});

		it('should get main generator', () => {
			const main = builder.getMainGenerator();

			expect(main).toBeInstanceOf(SourceMapGenerator);
		});
	});

	describe('Multi-File Source Maps', () => {
		it('should generate source maps for multiple files', () => {
			const gen1 = builder.createGenerator('file1.ts');
			const gen2 = builder.createGenerator('file2.ts');

			gen1.addMapping(1, 0, 'input1.ts', 1, 0);
			gen2.addMapping(1, 0, 'input2.ts', 1, 0);

			const sourceMaps = builder.generateAll();

			expect(sourceMaps.size).toBe(3); // main + 2 created
			expect(sourceMaps.has('main.ts')).toBe(true);
			expect(sourceMaps.has('file1.ts')).toBe(true);
			expect(sourceMaps.has('file2.ts')).toBe(true);
		});
	});

	describe('Fragment-based Generation', () => {
		it('should generate source maps for fragments', () => {
			const fragment1 = fragmentBuilder.create('interface Patient {}', {
				targetFile: 'patient.ts',
				sourceRange: {
					filename: 'schema1.json',
					start: { line: 1, column: 0, offset: 0 },
					end: { line: 1, column: 19, offset: 19 }
				}
			});

			const fragment2 = fragmentBuilder.create('interface Doctor {}', {
				targetFile: 'doctor.ts',
				sourceRange: {
					filename: 'schema2.json',
					start: { line: 1, column: 0, offset: 0 },
					end: { line: 1, column: 18, offset: 18 }
				}
			});

			const sourceMaps = builder.generateForFragments([fragment1, fragment2]);

			expect(sourceMaps.size).toBe(2);
			expect(sourceMaps.has('patient.ts')).toBe(true);
			expect(sourceMaps.has('doctor.ts')).toBe(true);

			const patientMap = sourceMaps.get('patient.ts');
			expect(patientMap?.sources).toContain('schema1.json');
		});

		it('should handle fragments without target file', () => {
			const fragment = fragmentBuilder.create('interface Test {}');

			const sourceMaps = builder.generateForFragments([fragment]);

			expect(sourceMaps.size).toBe(1);
			expect(sourceMaps.has('generated.ts')).toBe(true);
		});

		it('should group fragments by target file', () => {
			const fragment1 = fragmentBuilder.create('interface A {}', {
				targetFile: 'shared.ts'
			});

			const fragment2 = fragmentBuilder.create('interface B {}', {
				targetFile: 'shared.ts'
			});

			const sourceMaps = builder.generateForFragments([fragment1, fragment2]);

			expect(sourceMaps.size).toBe(1);
			expect(sourceMaps.has('shared.ts')).toBe(true);
		});
	});

	describe('Combined Source Maps', () => {
		it('should create combined source map for multiple files', () => {
			const gen1 = builder.createGenerator('file1.ts');
			const gen2 = builder.createGenerator('file2.ts');

			gen1.addMapping(1, 0, 'input1.ts', 1, 0);
			gen2.addMapping(1, 0, 'input2.ts', 1, 0);

			const combined = builder.createCombinedSourceMap('combined.ts');

			expect(combined.file).toBe('combined.ts');
			expect(combined.sources.length).toBeGreaterThan(0);
		});
	});
});

describe('SourceMapUtils', () => {
	describe('Source Map Parsing', () => {
		it('should parse valid source map JSON', () => {
			const sourceMapJson = JSON.stringify({
				version: 3,
				file: 'output.ts',
				sources: ['input.ts'],
				names: ['test'],
				mappings: 'AAAA'
			});

			const parsed = SourceMapUtils.parseSourceMap(sourceMapJson);

			expect(parsed.version).toBe(3);
			expect(parsed.file).toBe('output.ts');
			expect(parsed.sources).toEqual(['input.ts']);
		});

		it('should throw error for unsupported version', () => {
			const invalidSourceMap = JSON.stringify({
				version: 2, // Unsupported
				file: 'output.ts',
				sources: [],
				names: [],
				mappings: ''
			});

			expect(() => SourceMapUtils.parseSourceMap(invalidSourceMap)).toThrow();
		});
	});

	describe('Source Map Merging', () => {
		it('should merge multiple source maps', () => {
			const sourceMap1: SourceMap = {
				version: 3,
				file: 'output1.ts',
				sources: ['input1.ts'],
				names: ['name1'],
				mappings: 'AAAA'
			};

			const sourceMap2: SourceMap = {
				version: 3,
				file: 'output2.ts',
				sources: ['input2.ts'],
				names: ['name2'],
				mappings: 'BBBB'
			};

			const merged = SourceMapUtils.mergeSourceMaps([sourceMap1, sourceMap2]);

			expect(merged.sources).toContain('input1.ts');
			expect(merged.sources).toContain('input2.ts');
			expect(merged.names).toContain('name1');
			expect(merged.names).toContain('name2');
		});

		it('should handle single source map', () => {
			const sourceMap: SourceMap = {
				version: 3,
				file: 'output.ts',
				sources: ['input.ts'],
				names: ['test'],
				mappings: 'AAAA'
			};

			const merged = SourceMapUtils.mergeSourceMaps([sourceMap]);

			expect(merged).toEqual(sourceMap);
		});

		it('should throw error for empty array', () => {
			expect(() => SourceMapUtils.mergeSourceMaps([])).toThrow();
		});
	});

	describe('Source Map Validation', () => {
		it('should validate correct source map', () => {
			const validSourceMap: SourceMap = {
				version: 3,
				file: 'output.ts',
				sources: ['input.ts'],
				names: ['test'],
				mappings: 'AAAA'
			};

			const validation = SourceMapUtils.validateSourceMap(validSourceMap);

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect invalid version', () => {
			const invalidSourceMap = {
				version: 2, // Invalid
				file: 'output.ts',
				sources: ['input.ts'],
				names: ['test'],
				mappings: 'AAAA'
			} as SourceMap;

			const validation = SourceMapUtils.validateSourceMap(invalidSourceMap);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(e => e.includes('version'))).toBe(true);
		});

		it('should detect missing file', () => {
			const invalidSourceMap = {
				version: 3,
				// file: missing
				sources: ['input.ts'],
				names: ['test'],
				mappings: 'AAAA'
			} as SourceMap;

			const validation = SourceMapUtils.validateSourceMap(invalidSourceMap);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(e => e.includes('file'))).toBe(true);
		});

		it('should detect invalid sources array', () => {
			const invalidSourceMap = {
				version: 3,
				file: 'output.ts',
				sources: 'not-array', // Invalid
				names: ['test'],
				mappings: 'AAAA'
			} as any;

			const validation = SourceMapUtils.validateSourceMap(invalidSourceMap);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(e => e.includes('Sources'))).toBe(true);
		});

		it('should detect invalid mappings', () => {
			const invalidSourceMap = {
				version: 3,
				file: 'output.ts',
				sources: ['input.ts'],
				names: ['test'],
				mappings: 123 // Invalid
			} as any;

			const validation = SourceMapUtils.validateSourceMap(invalidSourceMap);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(e => e.includes('Mappings'))).toBe(true);
		});
	});

	describe('Original Position Lookup', () => {
		it('should return null for placeholder implementation', () => {
			const sourceMap: SourceMap = {
				version: 3,
				file: 'output.ts',
				sources: ['input.ts'],
				names: ['test'],
				mappings: 'AAAA'
			};

			const position = SourceMapUtils.getOriginalPosition(sourceMap, 1, 0);

			expect(position).toBeNull();
		});
	});
});

describe('VLQ Encoding', () => {
	let generator: SourceMapGenerator;

	beforeEach(() => {
		generator = new SourceMapGenerator({ file: 'test.ts' });
	});

	describe('Basic VLQ Functionality', () => {
		it('should generate mappings with VLQ encoding', () => {
			generator.addMapping(1, 0, 'input.ts', 1, 0);
			generator.addMapping(1, 10, 'input.ts', 1, 5);
			generator.addMapping(2, 0, 'input.ts', 2, 0);

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.mappings).toBeDefined();
			expect(typeof sourceMap.mappings).toBe('string');
			expect(sourceMap.mappings.length).toBeGreaterThan(0);
		});

		it('should handle mappings across multiple lines', () => {
			// Line 1
			generator.addMapping(1, 0, 'input.ts', 1, 0);
			generator.addMapping(1, 10, 'input.ts', 1, 10);
			
			// Line 2
			generator.addMapping(2, 0, 'input.ts', 2, 0);
			generator.addMapping(2, 5, 'input.ts', 2, 5);
			
			// Line 3 (empty)
			// Line 4
			generator.addMapping(4, 0, 'input.ts', 4, 0);

			const sourceMap = generator.generateSourceMap();

			// Should contain semicolons for line separators
			expect(sourceMap.mappings).toContain(';');
		});

		it('should handle mappings with names', () => {
			generator.addMapping(1, 0, 'input.ts', 1, 0, 'functionName');
			generator.addMapping(1, 15, 'input.ts', 1, 10, 'variableName');

			const sourceMap = generator.generateSourceMap();

			expect(sourceMap.names).toContain('functionName');
			expect(sourceMap.names).toContain('variableName');
			expect(sourceMap.mappings).toBeDefined();
		});
	});
});

describe('Integration Tests', () => {
	let astBuilder: ASTBuilder;
	let fragmentBuilder: CodeFragmentBuilder;

	beforeEach(() => {
		astBuilder = new ASTBuilder();
		fragmentBuilder = new CodeFragmentBuilder();
	});

	it('should create complete source map for generated TypeScript file', () => {
		const builder = new SourceMapBuilder('patient.ts', {
			sourceRoot: 'src/schemas',
			includeSourcesContent: true
		});

		// Create fragments from different sources
		const baseFragment = fragmentBuilder.create('import { Resource } from "./base";', {
			sourceRange: {
				filename: 'base.schema.json',
				start: { line: 1, column: 0, offset: 0 },
				end: { line: 1, column: 30, offset: 30 }
			}
		});

		const interfaceFragment = fragmentBuilder.create(`export interface Patient extends Resource {
  resourceType: 'Patient';
  identifier?: Identifier[];
}`, {
			sourceRange: {
				filename: 'patient.schema.json',
				start: { line: 5, column: 0, offset: 100 },
				end: { line: 8, column: 1, offset: 200 }
			}
		});

		const fragments = [baseFragment, interfaceFragment];
		const sourceMaps = builder.generateForFragments(fragments);

		expect(sourceMaps.size).toBe(1);
		
		const sourceMap = sourceMaps.get('generated.ts')!;
		expect(sourceMap.version).toBe(3);
		expect(sourceMap.sources).toContain('base.schema.json');
		expect(sourceMap.sources).toContain('patient.schema.json');
		expect(sourceMap.mappings).toBeDefined();
	});

	it('should handle complex FHIR resource generation with source maps', () => {
		const mainBuilder = new SourceMapBuilder('index.ts');
		
		// Create multiple generators for different output files
		const patientGen = mainBuilder.createGenerator('resources/patient.ts');
		const practitionerGen = mainBuilder.createGenerator('resources/practitioner.ts');
		const indexGen = mainBuilder.getMainGenerator();

		// Simulate generating Patient resource
		const patientInterface = astBuilder.createInterface('Patient', {
			properties: [
				astBuilder.createProperty('resourceType', astBuilder.createLiteralType('Patient')),
				astBuilder.createProperty('identifier', astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), { optional: true })
			]
		});

		patientInterface.sourceRange = {
			filename: 'schemas/patient.json',
			start: { line: 10, column: 2, offset: 250 },
			end: { line: 20, column: 3, offset: 450 }
		};

		// Add mappings for Patient
		patientGen.addNodeMapping(patientInterface, 1, 0);
		patientGen.addGeneratedCode('export interface Patient extends DomainResource {\n');
		patientGen.addMapping(2, 2, 'schemas/patient.json', 11, 4, 'resourceType');
		patientGen.addGeneratedCode('  resourceType: "Patient";\n');
		patientGen.addGeneratedCode('}');

		// Simulate generating Practitioner resource
		practitionerGen.addMapping(1, 0, 'schemas/practitioner.json', 1, 0);
		practitionerGen.addGeneratedCode('export interface Practitioner extends DomainResource {}');

		// Generate index file
		indexGen.addMapping(1, 0, 'generated', 1, 0);
		indexGen.addGeneratedCode('export * from "./resources/patient";\n');
		indexGen.addMapping(2, 0, 'generated', 2, 0);
		indexGen.addGeneratedCode('export * from "./resources/practitioner";');

		// Generate all source maps
		const allSourceMaps = mainBuilder.generateAll();

		expect(allSourceMaps.size).toBe(3);
		expect(allSourceMaps.has('index.ts')).toBe(true);
		expect(allSourceMaps.has('resources/patient.ts')).toBe(true);
		expect(allSourceMaps.has('resources/practitioner.ts')).toBe(true);

		// Validate Patient source map
		const patientMap = allSourceMaps.get('resources/patient.ts')!;
		expect(patientMap.sources).toContain('schemas/patient.json');
		expect(patientMap.names).toContain('Patient');

		// Create combined source map
		const combined = mainBuilder.createCombinedSourceMap('all-resources.ts');
		expect(combined.file).toBe('all-resources.ts');
		expect(combined.sources.length).toBeGreaterThan(0);
	});

	it('should handle source map generation with transformations', () => {
		const generator = new SourceMapGenerator({
			file: 'transformed.ts',
			sourceRoot: 'original'
		});

		// Simulate original code positions
		const originalInterface = astBuilder.createInterface('OriginalName', {
			properties: [
				astBuilder.createProperty('oldProperty', astBuilder.createStringType())
			]
		});

		originalInterface.sourceRange = {
			filename: 'original.ts',
			start: { line: 5, column: 0, offset: 100 },
			end: { line: 7, column: 1, offset: 150 }
		};

		// Simulate transformation that renames interface and properties
		generator.addNodeMapping(originalInterface, 1, 0); // Map interface declaration
		generator.addGeneratedCode('export interface TransformedName {\n');

		generator.addMapping(2, 2, 'original.ts', 6, 2, 'oldProperty'); // Map property
		generator.addGeneratedCode('  newProperty: string;\n');
		generator.addGeneratedCode('}');

		const sourceMap = generator.generateSourceMap();

		// Verify mapping preserves original location information
		expect(sourceMap.sources).toContain('original.ts');
		expect(sourceMap.names).toContain('OriginalName');
		expect(sourceMap.names).toContain('oldProperty');

		// Verify inline source map generation
		const inline = generator.generateInlineSourceMap();
		expect(inline).toMatch(/^\/\/# sourceMappingURL=data:application\/json/);

		// Verify source map file reference
		const reference = generator.generateSourceMapComment();
		expect(reference).toBe('//# sourceMappingURL=transformed.ts.map');
	});

	it('should handle validation of generated source maps', () => {
		const generator = new SourceMapGenerator({ file: 'test.ts' });

		generator.addMapping(1, 0, 'input.ts', 1, 0, 'test');
		generator.addMapping(2, 5, 'input.ts', 2, 3);

		const sourceMap = generator.generateSourceMap();

		// Validate the generated source map
		const validation = SourceMapUtils.validateSourceMap(sourceMap);

		expect(validation.isValid).toBe(true);
		expect(validation.errors).toHaveLength(0);

		// Test merging with another source map
		const generator2 = new SourceMapGenerator({ file: 'test2.ts' });
		generator2.addMapping(1, 0, 'input2.ts', 1, 0);
		const sourceMap2 = generator2.generateSourceMap();

		const merged = SourceMapUtils.mergeSourceMaps([sourceMap, sourceMap2]);

		expect(merged.sources).toContain('input.ts');
		expect(merged.sources).toContain('input2.ts');
		
		const mergedValidation = SourceMapUtils.validateSourceMap(merged);
		expect(mergedValidation.isValid).toBe(true);
	});
});