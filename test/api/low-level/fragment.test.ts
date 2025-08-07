/**
 * Code Fragment Composition Tests
 * 
 * Tests for code fragment composition utilities including fragment builders,
 * composers, AST renderers, and template systems.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	CodeFragmentBuilder,
	CodeFragmentComposer,
	ASTRenderer,
	CommonTemplates,
	type CodeFragment,
	type FragmentTemplate,
	type FragmentCompositionOptions
} from '../../../src/api/low-level/fragment';
import { ASTBuilder } from '../../../src/api/low-level/ast';

describe('CodeFragmentBuilder', () => {
	let builder: CodeFragmentBuilder;

	beforeEach(() => {
		builder = new CodeFragmentBuilder();
	});

	describe('Basic Fragment Creation', () => {
		it('should create simple code fragment', () => {
			const fragment = builder.create('export interface Patient {}', {
				language: 'typescript',
				category: 'interface'
			});

			expect(fragment.content).toBe('export interface Patient {}');
			expect(fragment.metadata.language).toBe('typescript');
			expect(fragment.metadata.category).toBe('interface');
			expect(fragment.id).toBeDefined();
		});

		it('should create fragment with source location', () => {
			const fragment = builder.create('interface Patient {}', {
				sourceRange: {
					filename: 'patient.ts',
					start: { line: 1, column: 0, offset: 0 },
					end: { line: 1, column: 20, offset: 20 }
				}
			});

			expect(fragment.sourceRange).toBeDefined();
			expect(fragment.sourceRange?.filename).toBe('patient.ts');
			expect(fragment.sourceRange?.start.line).toBe(1);
		});

		it('should create fragment with dependencies', () => {
			const fragment = builder.create('Patient extends Resource {}', {
				dependencies: ['Resource', 'Meta']
			});

			expect(fragment.metadata.dependencies).toEqual(['Resource', 'Meta']);
		});
	});

	describe('Template-based Creation', () => {
		it('should create fragment from template', () => {
			const template = 'export interface {{name}} {\n{{properties}}\n}';
			const data = {
				name: 'Patient',
				properties: '  id?: string;'
			};

			const fragment = builder.fromTemplate(template, data, {
				language: 'typescript'
			});

			expect(fragment.content).toBe('export interface Patient {\n  id?: string;\n}');
			expect(fragment.metadata.template).toBe(template);
		});

		it('should handle nested template variables', () => {
			const template = '{{#each items}}export const {{name}} = "{{value}}";{{/each}}';
			const data = {
				items: [
					{ name: 'PATIENT', value: 'Patient' },
					{ name: 'DOCTOR', value: 'Practitioner' }
				]
			};

			const fragment = builder.fromTemplate(template, data);

			expect(fragment.content).toContain('export const PATIENT = "Patient";');
			expect(fragment.content).toContain('export const DOCTOR = "Practitioner";');
		});

		it('should handle conditional template blocks', () => {
			const template = 'export interface {{name}}{{#if extends}} extends {{extends}}{{/if}} {\n{{properties}}\n}';
			const data = {
				name: 'Patient',
				extends: 'DomainResource',
				properties: '  resourceType: "Patient";'
			};

			const fragment = builder.fromTemplate(template, data);

			expect(fragment.content).toBe('export interface Patient extends DomainResource {\n  resourceType: "Patient";\n}');
		});
	});

	describe('Fragment Modification', () => {
		it('should append content to fragment', () => {
			const fragment = builder.create('interface Patient {');
			builder.append(fragment, '\n  id?: string;\n}');

			expect(fragment.content).toBe('interface Patient {\n  id?: string;\n}');
		});

		it('should prepend content to fragment', () => {
			const fragment = builder.create('interface Patient {}');
			builder.prepend(fragment, 'export ');

			expect(fragment.content).toBe('export interface Patient {}');
		});

		it('should replace content in fragment', () => {
			const fragment = builder.create('interface Patient {}');
			builder.replace(fragment, 'Patient', 'Practitioner');

			expect(fragment.content).toBe('interface Practitioner {}');
		});

		it('should wrap fragment content', () => {
			const fragment = builder.create('Patient');
			builder.wrap(fragment, 'interface ', ' {}');

			expect(fragment.content).toBe('interface Patient {}');
		});
	});

	describe('Fragment Metadata', () => {
		it('should set fragment metadata', () => {
			const fragment = builder.create('interface Patient {}');
			builder.setMetadata(fragment, 'category', 'resource-interface');

			expect(fragment.metadata.category).toBe('resource-interface');
		});

		it('should get fragment metadata', () => {
			const fragment = builder.create('interface Patient {}', {
				category: 'interface'
			});

			const category = builder.getMetadata(fragment, 'category');

			expect(category).toBe('interface');
		});

		it('should check if fragment has metadata', () => {
			const fragment = builder.create('interface Patient {}', {
				category: 'interface'
			});

			expect(builder.hasMetadata(fragment, 'category')).toBe(true);
			expect(builder.hasMetadata(fragment, 'nonexistent')).toBe(false);
		});
	});

	describe('Fragment Validation', () => {
		it('should validate TypeScript fragment', () => {
			const fragment = builder.create('export interface Patient { id: string; }', {
				language: 'typescript'
			});

			const validation = builder.validate(fragment);

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect invalid TypeScript syntax', () => {
			const fragment = builder.create('export interface Patient { id: }', {
				language: 'typescript'
			});

			const validation = builder.validate(fragment);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.length).toBeGreaterThan(0);
		});

		it('should validate fragment dependencies', () => {
			const fragment = builder.create('interface Patient extends Resource {}', {
				dependencies: ['Resource']
			});

			const validation = builder.validate(fragment, {
				checkDependencies: true,
				availableTypes: ['Resource', 'Meta']
			});

			expect(validation.isValid).toBe(true);
		});

		it('should detect missing dependencies', () => {
			const fragment = builder.create('interface Patient extends UnknownType {}', {
				dependencies: ['UnknownType']
			});

			const validation = builder.validate(fragment, {
				checkDependencies: true,
				availableTypes: ['Resource', 'Meta']
			});

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(e => e.includes('UnknownType'))).toBe(true);
		});
	});
});

describe('CodeFragmentComposer', () => {
	let composer: CodeFragmentComposer;
	let builder: CodeFragmentBuilder;

	beforeEach(() => {
		composer = new CodeFragmentComposer();
		builder = new CodeFragmentBuilder();
	});

	describe('Fragment Composition', () => {
		it('should compose multiple fragments', () => {
			const fragment1 = builder.create('export interface Patient {');
			const fragment2 = builder.create('  id?: string;');
			const fragment3 = builder.create('}');

			const composed = composer.compose([fragment1, fragment2, fragment3]);

			expect(composed.content).toBe('export interface Patient {\n  id?: string;\n}');
		});

		it('should compose with custom separator', () => {
			const fragment1 = builder.create('Patient');
			const fragment2 = builder.create('Practitioner');

			const composed = composer.compose([fragment1, fragment2], {
				separator: ' | '
			});

			expect(composed.content).toBe('Patient | Practitioner');
		});

		it('should compose with prefix and suffix', () => {
			const fragment1 = builder.create('Patient');
			const fragment2 = builder.create('Practitioner');

			const composed = composer.compose([fragment1, fragment2], {
				prefix: 'type ResourceTypes = ',
				suffix: ';',
				separator: ' | '
			});

			expect(composed.content).toBe('type ResourceTypes = Patient | Practitioner;');
		});

		it('should preserve metadata during composition', () => {
			const fragment1 = builder.create('export interface Patient {}', {
				category: 'interface',
				dependencies: ['Resource']
			});
			const fragment2 = builder.create('export interface Practitioner {}', {
				category: 'interface',
				dependencies: ['Resource', 'ContactPoint']
			});

			const composed = composer.compose([fragment1, fragment2], {
				preserveMetadata: true
			});

			expect(composed.metadata.dependencies).toContain('Resource');
			expect(composed.metadata.dependencies).toContain('ContactPoint');
		});
	});

	describe('Fragment Merging', () => {
		it('should merge fragments by category', () => {
			const interface1 = builder.create('interface Patient {}', { category: 'interface' });
			const interface2 = builder.create('interface Practitioner {}', { category: 'interface' });
			const type1 = builder.create('type ID = string;', { category: 'type' });

			const fragments = [interface1, interface2, type1];
			const merged = composer.mergeByCategory(fragments);

			expect(merged.size).toBe(2);
			expect(merged.get('interface')?.content).toContain('interface Patient');
			expect(merged.get('interface')?.content).toContain('interface Practitioner');
			expect(merged.get('type')?.content).toContain('type ID = string;');
		});

		it('should merge imports and exports', () => {
			const import1 = builder.create('import { Patient } from "./patient";', { category: 'import' });
			const import2 = builder.create('import { Practitioner } from "./practitioner";', { category: 'import' });

			const merged = composer.mergeImports([import1, import2]);

			expect(merged.content).toContain('import { Patient } from "./patient";');
			expect(merged.content).toContain('import { Practitioner } from "./practitioner";');
		});
	});

	describe('Dependency Resolution', () => {
		it('should resolve fragment dependencies', () => {
			const fragment1 = builder.create('interface Patient extends Resource {}', {
				dependencies: ['Resource']
			});
			const fragment2 = builder.create('interface Resource { id: string; }', {
				provides: ['Resource']
			});

			const fragments = [fragment1, fragment2];
			const resolved = composer.resolveDependencies(fragments);

			expect(resolved.success).toBe(true);
			expect(resolved.sorted).toHaveLength(2);
			expect(resolved.sorted[0]).toBe(fragment2); // Resource should come first
			expect(resolved.sorted[1]).toBe(fragment1); // Patient should come second
		});

		it('should detect circular dependencies', () => {
			const fragment1 = builder.create('interface A extends B {}', {
				provides: ['A'],
				dependencies: ['B']
			});
			const fragment2 = builder.create('interface B extends A {}', {
				provides: ['B'],
				dependencies: ['A']
			});

			const fragments = [fragment1, fragment2];
			const resolved = composer.resolveDependencies(fragments);

			expect(resolved.success).toBe(false);
			expect(resolved.circularDependencies.length).toBeGreaterThan(0);
		});

		it('should detect missing dependencies', () => {
			const fragment = builder.create('interface Patient extends Resource {}', {
				dependencies: ['Resource']
			});

			const resolved = composer.resolveDependencies([fragment]);

			expect(resolved.success).toBe(false);
			expect(resolved.missingDependencies).toContain('Resource');
		});
	});

	describe('File Organization', () => {
		it('should organize fragments by file', () => {
			const fragment1 = builder.create('interface Patient {}', { targetFile: 'patient.ts' });
			const fragment2 = builder.create('interface Practitioner {}', { targetFile: 'practitioner.ts' });
			const fragment3 = builder.create('export * from "./patient";', { targetFile: 'index.ts' });

			const fragments = [fragment1, fragment2, fragment3];
			const organized = composer.organizeByFile(fragments);

			expect(organized.size).toBe(3);
			expect(organized.get('patient.ts')?.content).toContain('interface Patient');
			expect(organized.get('practitioner.ts')?.content).toContain('interface Practitioner');
			expect(organized.get('index.ts')?.content).toContain('export * from "./patient";');
		});

		it('should generate barrel exports', () => {
			const fragment1 = builder.create('export interface Patient {}', {
				provides: ['Patient'],
				targetFile: 'patient.ts'
			});
			const fragment2 = builder.create('export interface Practitioner {}', {
				provides: ['Practitioner'],
				targetFile: 'practitioner.ts'
			});

			const fragments = [fragment1, fragment2];
			const barrel = composer.generateBarrelExports(fragments, 'index.ts');

			expect(barrel.content).toContain('export * from "./patient";');
			expect(barrel.content).toContain('export * from "./practitioner";');
			expect(barrel.metadata.targetFile).toBe('index.ts');
		});
	});
});

describe('ASTRenderer', () => {
	let renderer: ASTRenderer;
	let astBuilder: ASTBuilder;

	beforeEach(() => {
		renderer = new ASTRenderer();
		astBuilder = new ASTBuilder();
	});

	describe('TypeScript Rendering', () => {
		it('should render interface declaration', () => {
			const property = astBuilder.createProperty('id', astBuilder.createStringType(), { optional: true });
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [property],
				exported: true
			});

			const fragment = renderer.renderToFragment(interface_);

			expect(fragment.content).toContain('export interface Patient');
			expect(fragment.content).toContain('id?: string');
		});

		it('should render interface with inheritance', () => {
			const baseType = astBuilder.createTypeReference('Resource');
			const property = astBuilder.createProperty('resourceType', astBuilder.createLiteralType('Patient'));
			const interface_ = astBuilder.createInterface('Patient', {
				extends: [baseType],
				properties: [property],
				exported: true
			});

			const fragment = renderer.renderToFragment(interface_);

			expect(fragment.content).toContain('export interface Patient extends Resource');
			expect(fragment.content).toContain('resourceType: "Patient"');
		});

		it('should render complex types', () => {
			const arrayType = astBuilder.createArrayType(astBuilder.createStringType());
			const unionType = astBuilder.createUnionType([
				astBuilder.createStringType(),
				astBuilder.createNumberType()
			]);
			const properties = [
				astBuilder.createProperty('tags', arrayType),
				astBuilder.createProperty('value', unionType)
			];
			const interface_ = astBuilder.createInterface('Complex', {
				properties
			});

			const fragment = renderer.renderToFragment(interface_);

			expect(fragment.content).toContain('tags: string[]');
			expect(fragment.content).toContain('value: string | number');
		});

		it('should render with JSDoc comments', () => {
			const property = astBuilder.createProperty('id', astBuilder.createStringType(), {
				documentation: 'Unique identifier'
			});
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [property],
				documentation: 'FHIR Patient resource'
			});

			const fragment = renderer.renderToFragment(interface_, {
				includeDocumentation: true
			});

			expect(fragment.content).toContain('/**\n * FHIR Patient resource\n */');
			expect(fragment.content).toContain('/**\n   * Unique identifier\n   */');
		});
	});

	describe('Import/Export Rendering', () => {
		it('should render import declaration', () => {
			const import_ = astBuilder.createImport('./patient', {
				namedImports: ['Patient', 'PatientType'],
				typeOnly: true
			});

			const fragment = renderer.renderToFragment(import_);

			expect(fragment.content).toBe('import type { Patient, PatientType } from "./patient";');
		});

		it('should render export declaration', () => {
			const export_ = astBuilder.createExport({
				namedExports: ['Patient', 'Practitioner'],
				moduleSpecifier: './resources'
			});

			const fragment = renderer.renderToFragment(export_);

			expect(fragment.content).toBe('export { Patient, Practitioner } from "./resources";');
		});

		it('should render namespace import', () => {
			const import_ = astBuilder.createImport('./types', {
				namespaceImport: 'Types'
			});

			const fragment = renderer.renderToFragment(import_);

			expect(fragment.content).toBe('import * as Types from "./types";');
		});

		it('should render default import', () => {
			const import_ = astBuilder.createImport('./patient', {
				defaultImport: 'Patient'
			});

			const fragment = renderer.renderToFragment(import_);

			expect(fragment.content).toBe('import Patient from "./patient";');
		});
	});

	describe('Rendering Options', () => {
		it('should respect indentation settings', () => {
			const property = astBuilder.createProperty('id', astBuilder.createStringType());
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [property]
			});

			const fragment = renderer.renderToFragment(interface_, {
				indent: '    ' // 4 spaces
			});

			expect(fragment.content).toContain('    id: string;');
		});

		it('should respect quote style settings', () => {
			const literalType = astBuilder.createLiteralType('Patient');
			const property = astBuilder.createProperty('type', literalType);
			const interface_ = astBuilder.createInterface('Resource', {
				properties: [property]
			});

			const fragment = renderer.renderToFragment(interface_, {
				quotes: 'single'
			});

			expect(fragment.content).toContain("type: 'Patient'");
		});

		it('should control semicolon usage', () => {
			const property = astBuilder.createProperty('id', astBuilder.createStringType());
			const interface_ = astBuilder.createInterface('Patient', {
				properties: [property]
			});

			const fragment = renderer.renderToFragment(interface_, {
				semicolons: false
			});

			expect(fragment.content).toContain('id: string');
			expect(fragment.content).not.toContain('id: string;');
		});

		it('should control trailing commas', () => {
			const properties = [
				astBuilder.createProperty('id', astBuilder.createStringType()),
				astBuilder.createProperty('name', astBuilder.createStringType())
			];
			const interface_ = astBuilder.createInterface('Patient', {
				properties
			});

			const fragment = renderer.renderToFragment(interface_, {
				trailingCommas: true
			});

			// Check that the last property has a trailing comma
			expect(fragment.content).toMatch(/name: string[,;]\s*}/);
		});
	});
});

describe('CommonTemplates', () => {
	let builder: CodeFragmentBuilder;

	beforeEach(() => {
		builder = new CodeFragmentBuilder();
	});

	it('should have TypeScript interface template', () => {
		expect(CommonTemplates.TYPESCRIPT_INTERFACE).toBeDefined();
		expect(typeof CommonTemplates.TYPESCRIPT_INTERFACE).toBe('string');
		expect(CommonTemplates.TYPESCRIPT_INTERFACE).toContain('{{interfaceName}}');
		expect(CommonTemplates.TYPESCRIPT_INTERFACE).toContain('{{properties}}');
	});

	it('should use TypeScript interface template', () => {
		const data = {
			interfaceName: 'Patient',
			properties: '  id?: string;\n  name?: string;'
		};

		const fragment = builder.fromTemplate(CommonTemplates.TYPESCRIPT_INTERFACE, data);

		expect(fragment.content).toContain('export interface Patient');
		expect(fragment.content).toContain('id?: string;');
		expect(fragment.content).toContain('name?: string;');
	});

	it('should have FHIR resource template', () => {
		expect(CommonTemplates.FHIR_RESOURCE).toBeDefined();
		expect(CommonTemplates.FHIR_RESOURCE).toContain('{{resourceName}}');
		expect(CommonTemplates.FHIR_RESOURCE).toContain('resourceType');
	});

	it('should use FHIR resource template', () => {
		const data = {
			resourceName: 'Patient',
			properties: '  identifier?: Identifier[];\n  name?: HumanName[];'
		};

		const fragment = builder.fromTemplate(CommonTemplates.FHIR_RESOURCE, data);

		expect(fragment.content).toContain('export interface Patient');
		expect(fragment.content).toContain("resourceType: 'Patient'");
		expect(fragment.content).toContain('identifier?: Identifier[]');
	});

	it('should have import statement template', () => {
		expect(CommonTemplates.IMPORT_STATEMENT).toBeDefined();
		expect(CommonTemplates.IMPORT_STATEMENT).toContain('{{imports}}');
		expect(CommonTemplates.IMPORT_STATEMENT).toContain('{{module}}');
	});

	it('should use import statement template', () => {
		const data = {
			imports: 'Patient, Practitioner',
			module: './resources'
		};

		const fragment = builder.fromTemplate(CommonTemplates.IMPORT_STATEMENT, data);

		expect(fragment.content).toBe('import { Patient, Practitioner } from "./resources";');
	});

	it('should have export statement template', () => {
		expect(CommonTemplates.EXPORT_STATEMENT).toBeDefined();
		expect(CommonTemplates.EXPORT_STATEMENT).toContain('{{exports}}');
	});

	it('should use export statement template', () => {
		const data = {
			exports: 'Patient, Practitioner',
			module: './resources'
		};

		const fragment = builder.fromTemplate(CommonTemplates.EXPORT_STATEMENT, data);

		expect(fragment.content).toBe('export { Patient, Practitioner } from "./resources";');
	});
});

describe('Integration Tests', () => {
	let builder: CodeFragmentBuilder;
	let composer: CodeFragmentComposer;
	let renderer: ASTRenderer;
	let astBuilder: ASTBuilder;

	beforeEach(() => {
		builder = new CodeFragmentBuilder();
		composer = new CodeFragmentComposer();
		renderer = new ASTRenderer();
		astBuilder = new ASTBuilder();
	});

	it('should create complete FHIR resource file', () => {
		// Create imports
		const imports = [
			builder.fromTemplate(CommonTemplates.IMPORT_STATEMENT, {
				imports: 'Resource, Meta',
				module: './base'
			}),
			builder.fromTemplate(CommonTemplates.IMPORT_STATEMENT, {
				imports: 'Identifier, HumanName',
				module: './datatypes'
			})
		];

		// Create interface using AST builder
		const baseType = astBuilder.createTypeReference('Resource');
		const properties = [
			astBuilder.createProperty('resourceType', astBuilder.createLiteralType('Patient')),
			astBuilder.createProperty('identifier', astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), { optional: true }),
			astBuilder.createProperty('name', astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')), { optional: true })
		];
		const patientInterface = astBuilder.createInterface('Patient', {
			extends: [baseType],
			properties,
			exported: true,
			documentation: 'FHIR Patient resource'
		});

		// Render interface to fragment
		const interfaceFragment = renderer.renderToFragment(patientInterface, {
			includeDocumentation: true
		});

		// Create export
		const exportFragment = builder.create('export default Patient;');

		// Compose all fragments
		const allFragments = [...imports, interfaceFragment, exportFragment];
		const finalFile = composer.compose(allFragments, {
			separator: '\n\n'
		});

		// Validate the final result
		expect(finalFile.content).toContain('import { Resource, Meta } from "./base";');
		expect(finalFile.content).toContain('import { Identifier, HumanName } from "./datatypes";');
		expect(finalFile.content).toContain('/**\n * FHIR Patient resource\n */');
		expect(finalFile.content).toContain('export interface Patient extends Resource');
		expect(finalFile.content).toContain('resourceType: "Patient"');
		expect(finalFile.content).toContain('identifier?: Identifier[]');
		expect(finalFile.content).toContain('name?: HumanName[]');
		expect(finalFile.content).toContain('export default Patient;');
	});

	it('should handle complex multi-file generation', () => {
		// Create multiple resource fragments
		const patientFragment = builder.fromTemplate(CommonTemplates.FHIR_RESOURCE, {
			resourceName: 'Patient',
			properties: '  identifier?: Identifier[];'
		});
		patientFragment.metadata.targetFile = 'patient.ts';
		patientFragment.metadata.provides = ['Patient'];

		const practitionerFragment = builder.fromTemplate(CommonTemplates.FHIR_RESOURCE, {
			resourceName: 'Practitioner',
			properties: '  identifier?: Identifier[];'
		});
		practitionerFragment.metadata.targetFile = 'practitioner.ts';
		practitionerFragment.metadata.provides = ['Practitioner'];

		// Organize by file
		const fragments = [patientFragment, practitionerFragment];
		const organized = composer.organizeByFile(fragments);

		// Generate barrel export
		const barrel = composer.generateBarrelExports(fragments, 'index.ts');

		// Validate organization
		expect(organized.size).toBe(2);
		expect(organized.get('patient.ts')?.content).toContain('interface Patient');
		expect(organized.get('practitioner.ts')?.content).toContain('interface Practitioner');

		// Validate barrel export
		expect(barrel.content).toContain('export * from "./patient";');
		expect(barrel.content).toContain('export * from "./practitioner";');
	});
});