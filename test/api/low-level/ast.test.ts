/**
 * AST Builder and Manipulation Tests
 * 
 * Tests for the core AST building and manipulation functionality including
 * builder patterns, manipulator operations, traversal, and FHIR inheritance support.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	ASTBuilder,
	ASTManipulator,
	ASTTraverser,
	ASTPatterns,
	type InterfaceDeclaration,
	type PropertySignature,
	type TypeNode,
	type ASTNode
} from '../../../src/api/low-level/ast';

describe('ASTBuilder', () => {
	let builder: ASTBuilder;

	beforeEach(() => {
		builder = new ASTBuilder();
	});

	describe('Basic Type Creation', () => {
		it('should create string type', () => {
			const stringType = builder.createStringType();
			expect(stringType.kind).toBe('StringKeyword');
			expect(stringType.id).toBeDefined();
		});

		it('should create number type', () => {
			const numberType = builder.createNumberType();
			expect(numberType.kind).toBe('NumberKeyword');
			expect(numberType.id).toBeDefined();
		});

		it('should create boolean type', () => {
			const booleanType = builder.createBooleanType();
			expect(booleanType.kind).toBe('BooleanKeyword');
			expect(booleanType.id).toBeDefined();
		});

		it('should create array type', () => {
			const stringType = builder.createStringType();
			const arrayType = builder.createArrayType(stringType);
			expect(arrayType.kind).toBe('ArrayType');
			expect((arrayType as any).elementType).toBe(stringType);
		});

		it('should create union type', () => {
			const stringType = builder.createStringType();
			const numberType = builder.createNumberType();
			const unionType = builder.createUnionType([stringType, numberType]);
			expect(unionType.kind).toBe('UnionType');
			expect((unionType as any).types).toHaveLength(2);
		});

		it('should create literal type', () => {
			const literalType = builder.createLiteralType('test');
			expect(literalType.kind).toBe('LiteralType');
			expect((literalType as any).value).toBe('test');
		});

		it('should create type reference', () => {
			const typeRef = builder.createTypeReference('Patient');
			expect(typeRef.kind).toBe('TypeReference');
			expect((typeRef as any).name).toBe('Patient');
		});
	});

	describe('Property Creation', () => {
		it('should create basic property', () => {
			const stringType = builder.createStringType();
			const property = builder.createProperty('name', stringType);
			
			expect(property.kind).toBe('PropertySignature');
			expect(property.name).toBe('name');
			expect(property.type).toBe(stringType);
			expect(property.optional).toBe(false);
		});

		it('should create optional property', () => {
			const stringType = builder.createStringType();
			const property = builder.createProperty('name', stringType, { optional: true });
			
			expect(property.optional).toBe(true);
		});

		it('should create property with documentation', () => {
			const stringType = builder.createStringType();
			const property = builder.createProperty('name', stringType, { 
				documentation: 'Patient name' 
			});
			
			expect(property.metadata?.documentation).toBe('Patient name');
		});
	});

	describe('Interface Creation', () => {
		it('should create basic interface', () => {
			const stringType = builder.createStringType();
			const nameProperty = builder.createProperty('name', stringType);
			
			const interface_ = builder.createInterface('Patient', {
				properties: [nameProperty]
			});

			expect(interface_.kind).toBe('InterfaceDeclaration');
			expect(interface_.name).toBe('Patient');
			expect(interface_.properties).toHaveLength(1);
			expect(interface_.properties[0]).toBe(nameProperty);
		});

		it('should create exported interface', () => {
			const interface_ = builder.createInterface('Patient', {
				exported: true
			});

			expect(interface_.exported).toBe(true);
		});

		it('should create interface with inheritance', () => {
			const baseType = builder.createTypeReference('Resource');
			const interface_ = builder.createInterface('Patient', {
				extends: [baseType]
			});

			expect(interface_.extends).toHaveLength(1);
			expect(interface_.extends?.[0]).toBe(baseType);
		});

		it('should create interface with type parameters', () => {
			const typeParam = builder.createTypeParameter('T');
			const interface_ = builder.createInterface('Generic', {
				typeParameters: [typeParam]
			});

			expect(interface_.typeParameters).toHaveLength(1);
			expect(interface_.typeParameters?.[0]).toBe(typeParam);
		});

		it('should create interface with documentation', () => {
			const interface_ = builder.createInterface('Patient', {
				documentation: 'FHIR Patient resource'
			});

			expect(interface_.metadata?.documentation).toBe('FHIR Patient resource');
		});
	});

	describe('Import/Export Creation', () => {
		it('should create named import', () => {
			const import_ = builder.createImport('./patient', {
				namedImports: ['Patient', 'PatientType']
			});

			expect(import_.kind).toBe('ImportDeclaration');
			expect(import_.moduleSpecifier).toBe('./patient');
			expect(import_.namedImports).toEqual(['Patient', 'PatientType']);
		});

		it('should create default import', () => {
			const import_ = builder.createImport('./patient', {
				defaultImport: 'Patient'
			});

			expect(import_.defaultImport).toBe('Patient');
		});

		it('should create namespace import', () => {
			const import_ = builder.createImport('./patient', {
				namespaceImport: 'PatientTypes'
			});

			expect(import_.namespaceImport).toBe('PatientTypes');
		});

		it('should create type-only import', () => {
			const import_ = builder.createImport('./patient', {
				namedImports: ['Patient'],
				typeOnly: true
			});

			expect(import_.typeOnly).toBe(true);
		});

		it('should create named export', () => {
			const export_ = builder.createExport({
				namedExports: ['Patient', 'PatientType']
			});

			expect(export_.kind).toBe('ExportDeclaration');
			expect(export_.namedExports).toEqual(['Patient', 'PatientType']);
		});

		it('should create re-export', () => {
			const export_ = builder.createExport({
				namedExports: ['Patient'],
				moduleSpecifier: './patient'
			});

			expect(export_.moduleSpecifier).toBe('./patient');
		});
	});
});

describe('ASTManipulator', () => {
	let manipulator: ASTManipulator;
	let builder: ASTBuilder;

	beforeEach(() => {
		manipulator = new ASTManipulator();
		builder = new ASTBuilder();
	});

	describe('Node Cloning', () => {
		it('should clone interface node', () => {
			const original = builder.createInterface('Patient');
			const cloned = manipulator.cloneNode(original);

			expect(cloned).not.toBe(original);
			expect(cloned.kind).toBe(original.kind);
			expect(cloned.name).toBe(original.name);
			expect(cloned.id).not.toBe(original.id); // Should have new ID
		});

		it('should deep clone interface with properties', () => {
			const nameProperty = builder.createProperty('name', builder.createStringType());
			const original = builder.createInterface('Patient', {
				properties: [nameProperty]
			});
			const cloned = manipulator.cloneNode(original);

			expect(cloned.properties[0]).not.toBe(original.properties[0]);
			expect(cloned.properties[0].name).toBe(original.properties[0].name);
		});
	});

	describe('Property Manipulation', () => {
		it('should add property to interface', () => {
			const interface_ = builder.createInterface('Patient');
			const property = builder.createProperty('name', builder.createStringType());

			manipulator.addProperty(interface_, property);

			expect(interface_.properties).toHaveLength(1);
			expect(interface_.properties[0]).toBe(property);
		});

		it('should remove property from interface', () => {
			const property1 = builder.createProperty('name', builder.createStringType());
			const property2 = builder.createProperty('age', builder.createNumberType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property1, property2]
			});

			const removed = manipulator.removeProperty(interface_, 'name');

			expect(removed).toBe(true);
			expect(interface_.properties).toHaveLength(1);
			expect(interface_.properties[0]).toBe(property2);
		});

		it('should update property in interface', () => {
			const oldProperty = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [oldProperty]
			});
			const newProperty = builder.createProperty('name', builder.createArrayType(builder.createStringType()));

			const updated = manipulator.updateProperty(interface_, 'name', newProperty);

			expect(updated).toBe(true);
			expect(interface_.properties[0]).toBe(newProperty);
		});

		it('should find property by name', () => {
			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			const found = manipulator.findProperty(interface_, 'name');

			expect(found).toBe(property);
		});

		it('should return null for non-existent property', () => {
			const interface_ = builder.createInterface('Patient');
			const found = manipulator.findProperty(interface_, 'nonexistent');

			expect(found).toBeNull();
		});
	});

	describe('Type Manipulation', () => {
		it('should replace type in property', () => {
			const oldType = builder.createStringType();
			const newType = builder.createNumberType();
			const property = builder.createProperty('value', oldType);

			manipulator.replaceType(property, oldType, newType);

			expect(property.type).toBe(newType);
		});
	});

	describe('AST Validation', () => {
		it('should validate correct interface', () => {
			const property = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			const validation = manipulator.validateAST(interface_);

			expect(validation.isValid).toBe(true);
			expect(validation.errors).toHaveLength(0);
		});

		it('should detect missing interface name', () => {
			const interface_ = builder.createInterface('Patient');
			(interface_ as any).name = null;

			const validation = manipulator.validateAST(interface_);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.length).toBeGreaterThan(0);
		});

		it('should detect duplicate property names', () => {
			const prop1 = builder.createProperty('name', builder.createStringType());
			const prop2 = builder.createProperty('name', builder.createNumberType());
			const interface_ = builder.createInterface('Patient', {
				properties: [prop1, prop2]
			});

			const validation = manipulator.validateAST(interface_);

			expect(validation.isValid).toBe(false);
			expect(validation.errors.some(error => error.includes('duplicate'))).toBe(true);
		});
	});
});

describe('ASTTraverser', () => {
	let traverser: ASTTraverser;
	let builder: ASTBuilder;

	beforeEach(() => {
		traverser = new ASTTraverser();
		builder = new ASTBuilder();
	});

	it('should traverse interface and visit all nodes', () => {
		const visitedNodes: ASTNode[] = [];
		const property = builder.createProperty('name', builder.createStringType());
		const interface_ = builder.createInterface('Patient', {
			properties: [property]
		});

		traverser.traverse(interface_, {
			enter: (node) => {
				visitedNodes.push(node);
			}
		});

		expect(visitedNodes).toContain(interface_);
		expect(visitedNodes).toContain(property);
		expect(visitedNodes).toContain(property.type);
		expect(visitedNodes.length).toBeGreaterThan(2);
	});

	it('should call exit callback', () => {
		const exitedNodes: ASTNode[] = [];
		const interface_ = builder.createInterface('Patient');

		traverser.traverse(interface_, {
			exit: (node) => {
				exitedNodes.push(node);
			}
		});

		expect(exitedNodes).toContain(interface_);
	});

	it('should allow skipping subtrees', () => {
		const visitedNodes: ASTNode[] = [];
		const property = builder.createProperty('name', builder.createStringType());
		const interface_ = builder.createInterface('Patient', {
			properties: [property]
		});

		traverser.traverse(interface_, {
			enter: (node) => {
				visitedNodes.push(node);
				if (node.kind === 'PropertySignature') {
					return 'skip';
				}
			}
		});

		expect(visitedNodes).toContain(interface_);
		expect(visitedNodes).toContain(property);
		expect(visitedNodes).not.toContain(property.type); // Should be skipped
	});

	it('should collect nodes by type', () => {
		const property1 = builder.createProperty('name', builder.createStringType());
		const property2 = builder.createProperty('age', builder.createNumberType());
		const interface_ = builder.createInterface('Patient', {
			properties: [property1, property2]
		});

		const properties = traverser.collectNodes(interface_, 'PropertySignature');

		expect(properties).toHaveLength(2);
		expect(properties).toContain(property1);
		expect(properties).toContain(property2);
	});

	it('should find first node by predicate', () => {
		const property = builder.createProperty('name', builder.createStringType());
		const interface_ = builder.createInterface('Patient', {
			properties: [property]
		});

		const found = traverser.findNode(interface_, (node) => 
			node.kind === 'PropertySignature' && (node as PropertySignature).name === 'name'
		);

		expect(found).toBe(property);
	});
});

describe('ASTPatterns', () => {
	let patterns: ASTPatterns;
	let builder: ASTBuilder;

	beforeEach(() => {
		patterns = new ASTPatterns();
		builder = new ASTBuilder();
	});

	describe('FHIR Pattern Matching', () => {
		it('should match FHIR resource interface', () => {
			const resourceType = builder.createProperty(
				'resourceType', 
				builder.createLiteralType('Patient')
			);
			const interface_ = builder.createInterface('Patient', {
				properties: [resourceType]
			});

			const isFHIRResource = patterns.isFHIRResourceInterface(interface_);

			expect(isFHIRResource).toBe(true);
		});

		it('should not match non-FHIR interface', () => {
			const interface_ = builder.createInterface('RegularClass');

			const isFHIRResource = patterns.isFHIRResourceInterface(interface_);

			expect(isFHIRResource).toBe(false);
		});

		it('should match FHIR extension pattern', () => {
			const urlProperty = builder.createProperty('url', builder.createStringType());
			const valueProperty = builder.createProperty('value', builder.createStringType());
			const interface_ = builder.createInterface('Extension', {
				properties: [urlProperty, valueProperty]
			});

			const isExtension = patterns.isFHIRExtensionInterface(interface_);

			expect(isExtension).toBe(true);
		});
	});

	describe('Inheritance Pattern Matching', () => {
		it('should detect interface with inheritance', () => {
			const baseType = builder.createTypeReference('Resource');
			const interface_ = builder.createInterface('Patient', {
				extends: [baseType]
			});

			const hasInheritance = patterns.hasInheritance(interface_);

			expect(hasInheritance).toBe(true);
		});

		it('should detect multiple inheritance', () => {
			const base1 = builder.createTypeReference('Resource');
			const base2 = builder.createTypeReference('Trackable');
			const interface_ = builder.createInterface('Patient', {
				extends: [base1, base2]
			});

			const hasMultipleInheritance = patterns.hasMultipleInheritance(interface_);

			expect(hasMultipleInheritance).toBe(true);
		});

		it('should get inheritance chain', () => {
			const base1 = builder.createTypeReference('Resource');
			const base2 = builder.createTypeReference('DomainResource');
			const interface_ = builder.createInterface('Patient', {
				extends: [base1, base2]
			});

			const chain = patterns.getInheritanceChain(interface_);

			expect(chain).toHaveLength(2);
			expect(chain).toContain('Resource');
			expect(chain).toContain('DomainResource');
		});
	});

	describe('Property Pattern Matching', () => {
		it('should match optional properties', () => {
			const property = builder.createProperty('name', builder.createStringType(), { optional: true });
			const interface_ = builder.createInterface('Patient', {
				properties: [property]
			});

			const optionalProps = patterns.findOptionalProperties(interface_);

			expect(optionalProps).toHaveLength(1);
			expect(optionalProps[0]).toBe(property);
		});

		it('should match properties by type', () => {
			const stringProp = builder.createProperty('name', builder.createStringType());
			const numberProp = builder.createProperty('age', builder.createNumberType());
			const interface_ = builder.createInterface('Patient', {
				properties: [stringProp, numberProp]
			});

			const stringProps = patterns.findPropertiesByType(interface_, 'StringKeyword');

			expect(stringProps).toHaveLength(1);
			expect(stringProps[0]).toBe(stringProp);
		});

		it('should match array properties', () => {
			const arrayProp = builder.createProperty('tags', builder.createArrayType(builder.createStringType()));
			const regularProp = builder.createProperty('name', builder.createStringType());
			const interface_ = builder.createInterface('Patient', {
				properties: [arrayProp, regularProp]
			});

			const arrayProps = patterns.findArrayProperties(interface_);

			expect(arrayProps).toHaveLength(1);
			expect(arrayProps[0]).toBe(arrayProp);
		});
	});

	describe('Common Interface Patterns', () => {
		it('should identify empty interface', () => {
			const interface_ = builder.createInterface('Empty');

			const isEmpty = patterns.isEmptyInterface(interface_);

			expect(isEmpty).toBe(true);
		});

		it('should identify generic interface', () => {
			const typeParam = builder.createTypeParameter('T');
			const interface_ = builder.createInterface('Generic', {
				typeParameters: [typeParam]
			});

			const isGeneric = patterns.isGenericInterface(interface_);

			expect(isGeneric).toBe(true);
		});

		it('should count interface complexity', () => {
			const prop1 = builder.createProperty('simple', builder.createStringType());
			const prop2 = builder.createProperty('array', builder.createArrayType(builder.createStringType()));
			const prop3 = builder.createProperty('union', builder.createUnionType([
				builder.createStringType(),
				builder.createNumberType()
			]));
			const interface_ = builder.createInterface('Complex', {
				properties: [prop1, prop2, prop3]
			});

			const complexity = patterns.getComplexityScore(interface_);

			expect(complexity.totalProperties).toBe(3);
			expect(complexity.complexTypes).toBeGreaterThan(0);
			expect(complexity.totalScore).toBeGreaterThan(3);
		});
	});
});

describe('FHIR Integration Tests', () => {
	let builder: ASTBuilder;
	let patterns: ASTPatterns;

	beforeEach(() => {
		builder = new ASTBuilder();
		patterns = new ASTPatterns();
	});

	it('should create Patient extending DomainResource', () => {
		const baseType = builder.createTypeReference('DomainResource');
		const resourceTypeProperty = builder.createProperty(
			'resourceType',
			builder.createLiteralType('Patient')
		);
		const identifierProperty = builder.createProperty(
			'identifier',
			builder.createArrayType(builder.createTypeReference('Identifier')),
			{ optional: true }
		);

		const patientInterface = builder.createInterface('Patient', {
			extends: [baseType],
			properties: [resourceTypeProperty, identifierProperty],
			exported: true,
			documentation: 'FHIR Patient resource'
		});

		// Validate structure
		expect(patientInterface.extends).toHaveLength(1);
		expect(patterns.isFHIRResourceInterface(patientInterface)).toBe(true);
		expect(patterns.hasInheritance(patientInterface)).toBe(true);
		expect(patientInterface.metadata?.documentation).toBe('FHIR Patient resource');

		// Validate properties
		const resourceTypeProp = patterns.findPropertiesByName(patientInterface, 'resourceType');
		expect(resourceTypeProp).toHaveLength(1);
		expect((resourceTypeProp[0].type as any).value).toBe('Patient');
	});

	it('should support complex FHIR inheritance chain', () => {
		// Create Resource base
		const resourceInterface = builder.createInterface('Resource', {
			properties: [
				builder.createProperty('id', builder.createStringType(), { optional: true }),
				builder.createProperty('meta', builder.createTypeReference('Meta'), { optional: true })
			]
		});

		// Create DomainResource extending Resource
		const domainResourceInterface = builder.createInterface('DomainResource', {
			extends: [builder.createTypeReference('Resource')],
			properties: [
				builder.createProperty('text', builder.createTypeReference('Narrative'), { optional: true }),
				builder.createProperty('contained', builder.createArrayType(builder.createTypeReference('Resource')), { optional: true })
			]
		});

		// Create Patient extending DomainResource
		const patientInterface = builder.createInterface('Patient', {
			extends: [builder.createTypeReference('DomainResource')],
			properties: [
				builder.createProperty('resourceType', builder.createLiteralType('Patient')),
				builder.createProperty('identifier', builder.createArrayType(builder.createTypeReference('Identifier')), { optional: true }),
				builder.createProperty('name', builder.createArrayType(builder.createTypeReference('HumanName')), { optional: true })
			]
		});

		// Validate inheritance patterns
		expect(patterns.hasInheritance(patientInterface)).toBe(true);
		expect(patterns.isFHIRResourceInterface(patientInterface)).toBe(true);
		expect(patterns.getInheritanceChain(patientInterface)).toEqual(['DomainResource']);
	});
});