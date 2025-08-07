/**
 * FHIR Inheritance Pattern Integration Tests
 * 
 * Tests for FHIR-specific inheritance patterns, resource generation,
 * profile constraints, and extension support using the low-level API.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	createASTBuilder,
	createFragmentBuilder,
	createTransformationEngine,
	createVisitorEngine,
	createModuleManager,
	FHIRHelpers,
	ASTPatterns,
	BuiltInTransformers,
	LanguageVisitors,
	type InterfaceDeclaration,
	type PropertySignature
} from '../../../src/api/low-level';

describe('FHIR Resource Generation', () => {
	let astBuilder: any;
	let fragmentBuilder: any;
	let patterns: ASTPatterns;

	beforeEach(() => {
		astBuilder = createASTBuilder();
		fragmentBuilder = createFragmentBuilder();
		patterns = new ASTPatterns();
	});

	describe('Basic FHIR Resource Structure', () => {
		it('should create Patient resource with proper FHIR structure', () => {
			const patientInterface = FHIRHelpers.createFHIRResourceInterface('Patient', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true },
					{ name: 'name', type: astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')), optional: true },
					{ name: 'gender', type: astBuilder.createUnionType([
						astBuilder.createLiteralType('male'),
						astBuilder.createLiteralType('female'),
						astBuilder.createLiteralType('other'),
						astBuilder.createLiteralType('unknown')
					]), optional: true }
				],
				documentation: 'FHIR Patient resource'
			});

			// Validate FHIR resource structure
			expect(patientInterface.kind).toBe('InterfaceDeclaration');
			expect(patientInterface.name).toBe('Patient');
			expect(patientInterface.exported).toBe(true);
			expect(patterns.isFHIRResourceInterface(patientInterface)).toBe(true);
			expect(patterns.hasInheritance(patientInterface)).toBe(true);

			// Validate extends DomainResource
			const inheritance = patterns.getInheritanceChain(patientInterface);
			expect(inheritance).toContain('DomainResource');

			// Validate resourceType property
			const resourceTypeProperty = patterns.findPropertiesByName(patientInterface, 'resourceType');
			expect(resourceTypeProperty).toHaveLength(1);
			expect((resourceTypeProperty[0].type as any).value).toBe('Patient');

			// Validate FHIR-specific properties
			const identifierProperty = patterns.findPropertiesByName(patientInterface, 'identifier');
			expect(identifierProperty).toHaveLength(1);
			expect(identifierProperty[0].optional).toBe(true);
			expect(identifierProperty[0].type.kind).toBe('ArrayType');
		});

		it('should create Practitioner resource extending DomainResource', () => {
			const practitionerInterface = FHIRHelpers.createFHIRResourceInterface('Practitioner', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true },
					{ name: 'name', type: astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')), optional: true },
					{ name: 'telecom', type: astBuilder.createArrayType(astBuilder.createTypeReference('ContactPoint')), optional: true },
					{ name: 'qualification', type: astBuilder.createArrayType(astBuilder.createTypeReference('PractitionerQualification')), optional: true }
				]
			});

			expect(practitionerInterface.name).toBe('Practitioner');
			expect(patterns.isFHIRResourceInterface(practitionerInterface)).toBe(true);
			
			// Validate qualification property (Practitioner-specific)
			const qualificationProperty = patterns.findPropertiesByName(practitionerInterface, 'qualification');
			expect(qualificationProperty).toHaveLength(1);
			expect(qualificationProperty[0].optional).toBe(true);
		});

		it('should create Organization resource with complex properties', () => {
			const organizationInterface = FHIRHelpers.createFHIRResourceInterface('Organization', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true },
					{ name: 'type', type: astBuilder.createArrayType(astBuilder.createTypeReference('CodeableConcept')), optional: true },
					{ name: 'name', type: astBuilder.createStringType(), optional: true },
					{ name: 'alias', type: astBuilder.createArrayType(astBuilder.createStringType()), optional: true },
					{ name: 'telecom', type: astBuilder.createArrayType(astBuilder.createTypeReference('ContactPoint')), optional: true },
					{ name: 'address', type: astBuilder.createArrayType(astBuilder.createTypeReference('Address')), optional: true }
				]
			});

			expect(patterns.isFHIRResourceInterface(organizationInterface)).toBe(true);
			
			// Validate array of primitives (alias)
			const aliasProperty = patterns.findPropertiesByName(organizationInterface, 'alias');
			expect(aliasProperty).toHaveLength(1);
			expect(aliasProperty[0].type.kind).toBe('ArrayType');
			expect((aliasProperty[0].type as any).elementType.kind).toBe('StringKeyword');
		});
	});

	describe('FHIR Inheritance Hierarchy', () => {
		it('should create complete Resource hierarchy', () => {
			// Create base Resource
			const resourceInterface = astBuilder.createInterface('Resource', {
				properties: [
					astBuilder.createProperty('id', astBuilder.createStringType(), { optional: true }),
					astBuilder.createProperty('meta', astBuilder.createTypeReference('Meta'), { optional: true }),
					astBuilder.createProperty('implicitRules', astBuilder.createStringType(), { optional: true }),
					astBuilder.createProperty('language', astBuilder.createStringType(), { optional: true })
				],
				exported: true,
				documentation: 'Base Resource type'
			});

			// Create DomainResource extending Resource
			const domainResourceInterface = astBuilder.createInterface('DomainResource', {
				extends: [astBuilder.createTypeReference('Resource')],
				properties: [
					astBuilder.createProperty('text', astBuilder.createTypeReference('Narrative'), { optional: true }),
					astBuilder.createProperty('contained', astBuilder.createArrayType(astBuilder.createTypeReference('Resource')), { optional: true }),
					astBuilder.createProperty('extension', astBuilder.createArrayType(astBuilder.createTypeReference('Extension')), { optional: true }),
					astBuilder.createProperty('modifierExtension', astBuilder.createArrayType(astBuilder.createTypeReference('Extension')), { optional: true })
				],
				exported: true,
				documentation: 'Base DomainResource type'
			});

			// Create Patient extending DomainResource
			const patientInterface = FHIRHelpers.createFHIRResourceInterface('Patient', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true }
				]
			});

			// Validate inheritance patterns
			expect(patterns.hasInheritance(domainResourceInterface)).toBe(true);
			expect(patterns.hasInheritance(patientInterface)).toBe(true);
			
			// Validate inheritance chains
			const domainResourceChain = patterns.getInheritanceChain(domainResourceInterface);
			expect(domainResourceChain).toContain('Resource');
			
			const patientChain = patterns.getInheritanceChain(patientInterface);
			expect(patientChain).toContain('DomainResource');

			// Validate FHIR resource identification
			expect(patterns.isFHIRResourceInterface(resourceInterface)).toBe(false); // Base Resource doesn't have resourceType
			expect(patterns.isFHIRResourceInterface(domainResourceInterface)).toBe(false); // DomainResource doesn't have resourceType
			expect(patterns.isFHIRResourceInterface(patientInterface)).toBe(true); // Patient has resourceType
		});

		it('should handle multiple inheritance for profiles', () => {
			const patientInterface = FHIRHelpers.createFHIRResourceInterface('Patient', 'DomainResource', {
				profiles: ['USCorePatient', 'InternationalPatient']
			});

			expect(patterns.hasMultipleInheritance(patientInterface)).toBe(true);
			
			const inheritanceChain = patterns.getInheritanceChain(patientInterface);
			expect(inheritanceChain).toContain('DomainResource');
			expect(inheritanceChain).toContain('USCorePatient');
			expect(inheritanceChain).toContain('InternationalPatient');
		});
	});

	describe('FHIR Profiles and Constraints', () => {
		it('should create FHIR profile with constraints', () => {
			const usCorePatientProfile = FHIRHelpers.createFHIRProfileInterface('USCorePatient', 'Patient', [
				{
					propertyName: 'identifier',
					type: astBuilder.createArrayType(astBuilder.createTypeReference('USCoreIdentifier')),
					required: true,
					cardinality: { min: 1, max: '*' },
					documentation: 'US Core Patient identifier (required)'
				},
				{
					propertyName: 'name',
					type: astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')),
					required: true,
					cardinality: { min: 1, max: '*' },
					documentation: 'US Core Patient name (required)'
				},
				{
					propertyName: 'gender',
					type: astBuilder.createUnionType([
						astBuilder.createLiteralType('male'),
						astBuilder.createLiteralType('female'),
						astBuilder.createLiteralType('other'),
						astBuilder.createLiteralType('unknown')
					]),
					required: true,
					documentation: 'US Core Patient gender (required)'
				}
			]);

			expect(usCorePatientProfile.name).toBe('USCorePatient');
			expect(patterns.hasInheritance(usCorePatientProfile)).toBe(true);
			expect(patterns.getInheritanceChain(usCorePatientProfile)).toContain('Patient');

			// Validate constraint properties
			const constrainedProperties = usCorePatientProfile.properties;
			expect(constrainedProperties.length).toBeGreaterThan(0);

			// Check cardinality metadata
			const identifierProperty = constrainedProperties.find(p => p.name === 'identifier');
			expect(identifierProperty?.metadata?.cardinality).toEqual({ min: 1, max: '*' });
			expect(identifierProperty?.optional).toBe(false); // Required by profile
		});

		it('should create profile with slicing constraints', () => {
			const patientWithSlicing = FHIRHelpers.createFHIRProfileInterface('PatientWithSlices', 'Patient', [
				{
					propertyName: 'identifier',
					type: astBuilder.createUnionType([
						astBuilder.createTypeReference('SSNIdentifier'),
						astBuilder.createTypeReference('MRNIdentifier'),
						astBuilder.createTypeReference('Identifier')
					]),
					cardinality: { min: 1, max: '*' },
					documentation: 'Sliced identifier: SSN, MRN, or other'
				}
			]);

			const identifierProperty = patientWithSlicing.properties.find(p => p.name === 'identifier');
			expect(identifierProperty?.type.kind).toBe('UnionType');
			expect((identifierProperty?.type as any).types).toHaveLength(3);
		});
	});

	describe('FHIR Extensions', () => {
		it('should create FHIR extension interface', () => {
			const birthSexExtension = FHIRHelpers.createFHIRExtensionInterface('USCoreBirthSex', astBuilder.createStringType(), {
				url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex',
				documentation: 'US Core Birth Sex Extension'
			});

			expect(birthSexExtension.name).toBe('USCoreBirthSex');
			expect(patterns.hasInheritance(birthSexExtension)).toBe(true);
			expect(patterns.getInheritanceChain(birthSexExtension)).toContain('Extension');
			expect(patterns.isFHIRExtensionInterface(birthSexExtension)).toBe(true);

			// Validate extension structure
			const urlProperty = patterns.findPropertiesByName(birthSexExtension, 'url');
			expect(urlProperty).toHaveLength(1);
			expect((urlProperty[0].type as any).value).toBe('http://hl7.org/fhir/us/core/StructureDefinition/us-core-birthsex');

			const valueProperty = patterns.findPropertiesByName(birthSexExtension, 'value');
			expect(valueProperty).toHaveLength(1);
			expect(valueProperty[0].type.kind).toBe('StringKeyword');
		});

		it('should create complex extension with nested structure', () => {
			const addressExtension = FHIRHelpers.createFHIRExtensionInterface('DetailedAddress', 
				astBuilder.createTypeReference('DetailedAddressValue'), 
				{
					url: 'http://example.org/fhir/StructureDefinition/detailed-address',
					documentation: 'Detailed address extension with nested components'
				}
			);

			expect(addressExtension.name).toBe('DetailedAddress');
			expect(patterns.isFHIRExtensionInterface(addressExtension)).toBe(true);

			const valueProperty = patterns.findPropertiesByName(addressExtension, 'value');
			expect(valueProperty[0].type.kind).toBe('TypeReference');
			expect((valueProperty[0].type as any).name).toBe('DetailedAddressValue');
		});
	});

	describe('FHIR Code Generation Templates', () => {
		it('should use FHIR resource template for generation', () => {
			const fragment = fragmentBuilder.fromTemplate(FHIRHelpers.FHIR_RESOURCE_WITH_INHERITANCE, {
				resourceName: 'Patient',
				baseType: 'DomainResource',
				description: 'FHIR Patient resource',
				properties: '  identifier?: Identifier[];\n  active?: boolean;',
				extensions: '  birthSex?: USCoreBirthSex;'
			});

			expect(fragment.content).toContain('export interface Patient extends DomainResource');
			expect(fragment.content).toContain("resourceType: 'Patient'");
			expect(fragment.content).toContain('identifier?: Identifier[]');
			expect(fragment.content).toContain('birthSex?: USCoreBirthSex');
			expect(fragment.content).toContain('FHIR Patient resource');
		});

		it('should use FHIR profile template', () => {
			const fragment = fragmentBuilder.fromTemplate(FHIRHelpers.FHIR_PROFILE_TEMPLATE, {
				profileName: 'USCorePatient',
				baseResource: 'Patient',
				profileUrl: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
				description: 'US Core Patient Profile',
				constraintProperties: '  identifier: USCoreIdentifier[]; // Required\n  name: HumanName[]; // Required',
				additionalProperties: '  race?: USCoreRace;\n  ethnicity?: USCoreEthnicity;'
			});

			expect(fragment.content).toContain('export interface USCorePatient extends Patient');
			expect(fragment.content).toContain('FHIR Profile: http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
			expect(fragment.content).toContain('identifier: USCoreIdentifier[]');
			expect(fragment.content).toContain('race?: USCoreRace');
		});

		it('should generate complex inheritance chain template', () => {
			const inheritanceChain = FHIRHelpers.generateInheritanceChain('Patient', ['DomainResource', 'Resource']);
			expect(inheritanceChain).toBe('Patient → Resource → DomainResource');

			const fragment = fragmentBuilder.fromTemplate(FHIRHelpers.FHIR_INHERITANCE_CHAIN, {
				typeName: 'Patient',
				description: 'FHIR Patient with full inheritance chain',
				inheritanceChain,
				extends: ['DomainResource', 'PatientProfile'],
				properties: [
					{
						name: 'resourceType',
						type: '"Patient"',
						documentation: 'Resource type identifier'
					},
					{
						name: 'identifier',
						type: 'Identifier[]',
						optional: true,
						cardinality: { min: 0, max: '*' }
					}
				]
			});

			expect(fragment.content).toContain('export interface Patient extends DomainResource, PatientProfile');
			expect(fragment.content).toContain('Inheritance: Patient → Resource → DomainResource');
			expect(fragment.content).toContain('Cardinality: 0..*');
		});
	});
});

describe('FHIR Resource Transformation', () => {
	let transformationEngine: any;
	let astBuilder: any;

	beforeEach(() => {
		transformationEngine = createTransformationEngine();
		astBuilder = createASTBuilder();
	});

	describe('FHIR-Specific Transformations', () => {
		it('should transform interface to add FHIR metadata', () => {
			const fhirDocTransformer = new BuiltInTransformers.DocumentationTransformer((node) => {
				if (node.kind === 'InterfaceDeclaration') {
					const interface_ = node as InterfaceDeclaration;
					if (interface_.name.endsWith('Resource') || interface_.name === 'Patient') {
						return `FHIR ${interface_.name} - Generated from FHIR specification`;
					}
				}
				return null;
			});

			transformationEngine.registerTransformer(fhirDocTransformer);

			const patientInterface = astBuilder.createInterface('Patient', {
				properties: [
					astBuilder.createProperty('resourceType', astBuilder.createLiteralType('Patient'))
				]
			});

			return transformationEngine.transform(patientInterface).then((result: any) => {
				expect(result.success).toBe(true);
				expect(result.transformedNode.metadata?.documentation).toBe('FHIR Patient - Generated from FHIR specification');
			});
		});

		it('should add FHIR resource type property transformer', () => {
			const fhirResourceTypeTransformer = new BuiltInTransformers.PropertyTransformer((property) => {
				if (property.name === 'resourceType') {
					// Ensure resourceType is not optional for FHIR resources
					const cloned = { ...property };
					cloned.optional = false;
					cloned.metadata = {
						...cloned.metadata,
						fhirRequired: true,
						description: 'FHIR resource type - always required'
					};
					return cloned;
				}
				return property;
			});

			transformationEngine.registerTransformer(fhirResourceTypeTransformer);

			const resourceTypeProperty = astBuilder.createProperty('resourceType', astBuilder.createLiteralType('Patient'), { optional: true });
			const patientInterface = astBuilder.createInterface('Patient', {
				properties: [resourceTypeProperty]
			});

			return transformationEngine.transform(patientInterface).then((result: any) => {
				expect(result.success).toBe(true);
				const transformedProperty = result.transformedNode.properties.find((p: any) => p.name === 'resourceType');
				expect(transformedProperty.optional).toBe(false);
				expect(transformedProperty.metadata?.fhirRequired).toBe(true);
			});
		});

		it('should transform FHIR types to specific implementations', () => {
			const fhirTypeMapper = new BuiltInTransformers.TypeMappingTransformer({
				'string': 'FHIRString',
				'boolean': 'FHIRBoolean',
				'number': 'FHIRDecimal',
				'Date': 'FHIRDateTime'
			});

			transformationEngine.registerTransformer(fhirTypeMapper);

			const properties = [
				astBuilder.createProperty('id', astBuilder.createTypeReference('string')),
				astBuilder.createProperty('active', astBuilder.createTypeReference('boolean')),
				astBuilder.createProperty('multipleBirthInteger', astBuilder.createTypeReference('number')),
				astBuilder.createProperty('birthDate', astBuilder.createTypeReference('Date'))
			];

			const patientInterface = astBuilder.createInterface('Patient', { properties });

			return transformationEngine.transform(patientInterface).then((result: any) => {
				expect(result.success).toBe(true);
				
				const idProperty = result.transformedNode.properties.find((p: any) => p.name === 'id');
				expect(idProperty.type.name).toBe('FHIRString');

				const activeProperty = result.transformedNode.properties.find((p: any) => p.name === 'active');
				expect(activeProperty.type.name).toBe('FHIRBoolean');

				const birthDateProperty = result.transformedNode.properties.find((p: any) => p.name === 'birthDate');
				expect(birthDateProperty.type.name).toBe('FHIRDateTime');
			});
		});
	});

	describe('FHIR Profile Constraint Transformation', () => {
		it('should apply profile constraints to base resource', () => {
			const profileConstraintTransformer = new BuiltInTransformers.PropertyTransformer((property) => {
				// US Core Patient profile constraints
				if (property.name === 'identifier' || property.name === 'name' || property.name === 'gender') {
					const cloned = { ...property };
					cloned.optional = false; // Make required by profile
					cloned.metadata = {
						...cloned.metadata,
						profileConstraint: 'USCore',
						cardinality: property.name === 'gender' ? '1..1' : '1..*'
					};
					return cloned;
				}
				return property;
			});

			transformationEngine.registerTransformer(profileConstraintTransformer);

			const patientInterface = FHIRHelpers.createFHIRResourceInterface('Patient', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'name', type: astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')), optional: true },
					{ name: 'gender', type: astBuilder.createStringType(), optional: true }
				]
			});

			return transformationEngine.transform(patientInterface).then((result: any) => {
				expect(result.success).toBe(true);
				
				const identifierProperty = result.transformedNode.properties.find((p: any) => p.name === 'identifier');
				expect(identifierProperty.optional).toBe(false);
				expect(identifierProperty.metadata?.cardinality).toBe('1..*');

				const genderProperty = result.transformedNode.properties.find((p: any) => p.name === 'gender');
				expect(genderProperty.optional).toBe(false);
				expect(genderProperty.metadata?.cardinality).toBe('1..1');
			});
		});
	});
});

describe('FHIR Multi-Language Generation', () => {
	let visitorEngine: any;
	let astBuilder: any;

	beforeEach(() => {
		visitorEngine = createVisitorEngine();
		astBuilder = createASTBuilder();
	});

	describe('FHIR to Python Generation', () => {
		it('should generate Python class from FHIR interface', () => {
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
			visitorEngine.registerVisitor(pythonVisitor);

			const patientInterface = FHIRHelpers.createFHIRResourceInterface('Patient', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true },
					{ name: 'name', type: astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')), optional: true }
				],
				documentation: 'FHIR Patient resource for Python'
			});

			return visitorEngine.execute(patientInterface, { languageTarget: 'python' }).then((result: any) => {
				expect(result.success).toBe(true);
				
				const pythonCode = result.results.get('PythonClassVisitor_' + patientInterface.id);
				expect(pythonCode).toContain('class Patient:');
				expect(pythonCode).toContain('FHIR Patient resource for Python');
				expect(pythonCode).toContain('def __init__(self):');
				expect(pythonCode).toContain('self.resourceType: str = None');
				expect(pythonCode).toContain('self.identifier: List[Identifier] | None = None');
				expect(pythonCode).toContain('self.active: bool | None = None');
				expect(pythonCode).toContain('self.name: List[HumanName] | None = None');
			});
		});

		it('should generate Python Pydantic model from FHIR resource', () => {
			const pydanticVisitor: any = {
				name: 'PydanticModelVisitor',
				languageTarget: 'python',
				visitClassLike: async (node: any) => {
					if (node.kind === 'InterfaceDeclaration') {
						const lines = [];
						lines.push(`class ${node.name}(BaseModel):`);
						lines.push('    """');
						lines.push(`    ${node.metadata?.documentation || `${node.name} model`}`);
						lines.push('    """');
						
						if (node.properties && node.properties.length > 0) {
							node.properties.forEach((prop: any) => {
								const pythonType = mapTypeToPython(prop.type);
								const optional = prop.optional ? ' | None = None' : '';
								const field = prop.name === 'resourceType' ? ` = "${node.name}"` : optional;
								lines.push(`    ${prop.name}: ${pythonType}${field}`);
							});
						} else {
							lines.push('    pass');
						}
						
						return lines.join('\n');
					}
					return '';
				}
			};

			function mapTypeToPython(typeNode: any): string {
				switch (typeNode.kind) {
					case 'StringKeyword': return 'str';
					case 'BooleanKeyword': return 'bool';
					case 'NumberKeyword': return 'float';
					case 'ArrayType': return `List[${mapTypeToPython(typeNode.elementType)}]`;
					case 'TypeReference': return typeNode.name;
					case 'LiteralType': return `Literal["${typeNode.value}"]`;
					default: return 'Any';
				}
			}

			visitorEngine.registerVisitor(pydanticVisitor);

			const practitionerInterface = FHIRHelpers.createFHIRResourceInterface('Practitioner', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true }
				],
				documentation: 'FHIR Practitioner as Pydantic model'
			});

			return visitorEngine.execute(practitionerInterface, { languageTarget: 'python' }).then((result: any) => {
				expect(result.success).toBe(true);
				
				const pydanticCode = result.results.get('PydanticModelVisitor_' + practitionerInterface.id);
				expect(pydanticCode).toContain('class Practitioner(BaseModel):');
				expect(pydanticCode).toContain('resourceType: Literal["Practitioner"] = "Practitioner"');
				expect(pydanticCode).toContain('identifier: List[Identifier] | None = None');
				expect(pydanticCode).toContain('active: bool | None = None');
			});
		});
	});

	describe('FHIR to Java Generation', () => {
		it('should generate Java class from FHIR interface', () => {
			const javaVisitor = LanguageVisitors.createJavaClassVisitor();
			visitorEngine.registerVisitor(javaVisitor);

			const organizationInterface = FHIRHelpers.createFHIRResourceInterface('Organization', 'DomainResource', {
				properties: [
					{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
					{ name: 'active', type: astBuilder.createBooleanType(), optional: true },
					{ name: 'name', type: astBuilder.createStringType(), optional: true }
				]
			});

			return visitorEngine.execute(organizationInterface, { languageTarget: 'java' }).then((result: any) => {
				expect(result.success).toBe(true);
				
				const javaCode = result.results.get('JavaClassVisitor_' + organizationInterface.id);
				expect(javaCode).toContain('public class Organization {');
				expect(javaCode).toContain('private String resourceType;');
				expect(javaCode).toContain('private List<Identifier> identifier;');
				expect(javaCode).toContain('private Boolean active;');
				expect(javaCode).toContain('private String name;');
			});
		});
	});
});

describe('FHIR Module Management', () => {
	let moduleManager: any;
	let astBuilder: any;

	beforeEach(() => {
		moduleManager = createModuleManager();
		astBuilder = createASTBuilder();
	});

	describe('FHIR Resource Module Organization', () => {
		it('should organize FHIR resources into proper module structure', () => {
			// Register base modules
			const baseModule = moduleManager.registerModule('fhir/base.ts', {
				exports: [astBuilder.createExport({ namedExports: ['Resource', 'DomainResource'] })]
			});

			const datatypesModule = moduleManager.registerModule('fhir/datatypes.ts', {
				exports: [astBuilder.createExport({ namedExports: ['Identifier', 'HumanName', 'ContactPoint', 'Address'] })]
			});

			// Register resource modules with dependencies
			const patientModule = moduleManager.registerModule('fhir/resources/patient.ts', {
				imports: [
					astBuilder.createImport('../base', { namedImports: ['DomainResource'] }),
					astBuilder.createImport('../datatypes', { namedImports: ['Identifier', 'HumanName'] })
				],
				exports: [astBuilder.createExport({ namedExports: ['Patient'] })]
			});

			const practitionerModule = moduleManager.registerModule('fhir/resources/practitioner.ts', {
				imports: [
					astBuilder.createImport('../base', { namedImports: ['DomainResource'] }),
					astBuilder.createImport('../datatypes', { namedImports: ['Identifier', 'HumanName', 'ContactPoint'] })
				],
				exports: [astBuilder.createExport({ namedExports: ['Practitioner'] })]
			});

			// Adjust dependency targets
			patientModule.dependencies[0].target = 'fhir/base.ts';
			patientModule.dependencies[1].target = 'fhir/datatypes.ts';
			practitionerModule.dependencies[0].target = 'fhir/base.ts';
			practitionerModule.dependencies[1].target = 'fhir/datatypes.ts';

			// Resolve dependencies
			const resolution = moduleManager.resolveDependencies();

			expect(resolution.success).toBe(true);
			expect(resolution.circularDependencies).toHaveLength(0);
			expect(resolution.missingDependencies).toHaveLength(0);

			// Validate topological order
			const order = moduleManager.getTopologicalOrder();
			const baseIndex = order.indexOf('fhir/base.ts');
			const datatypesIndex = order.indexOf('fhir/datatypes.ts');
			const patientIndex = order.indexOf('fhir/resources/patient.ts');

			expect(baseIndex).toBeLessThan(patientIndex);
			expect(datatypesIndex).toBeLessThan(patientIndex);
		});

		it('should generate FHIR resource barrel exports', () => {
			// Register FHIR resource modules
			moduleManager.registerModule('fhir/resources/patient.ts', {
				exports: [astBuilder.createExport({ namedExports: ['Patient'] })]
			});

			moduleManager.registerModule('fhir/resources/practitioner.ts', {
				exports: [astBuilder.createExport({ namedExports: ['Practitioner'] })]
			});

			moduleManager.registerModule('fhir/resources/organization.ts', {
				exports: [astBuilder.createExport({ namedExports: ['Organization'] })]
			});

			// Generate barrel exports
			const barrels = moduleManager.generateBarrels(['fhir/resources']);

			expect(barrels.has('fhir/resources/index.ts')).toBe(true);
			
			const resourceBarrel = barrels.get('fhir/resources/index.ts');
			expect(resourceBarrel?.length).toBe(3);
			expect(resourceBarrel?.some((exp: any) => exp.namedExports?.includes('Patient'))).toBe(true);
			expect(resourceBarrel?.some((exp: any) => exp.namedExports?.includes('Practitioner'))).toBe(true);
			expect(resourceBarrel?.some((exp: any) => exp.namedExports?.includes('Organization'))).toBe(true);
		});

		it('should optimize FHIR module imports', () => {
			// Create module with multiple imports from same FHIR modules
			const import1 = astBuilder.createImport('../datatypes', { namedImports: ['Identifier'] });
			const import2 = astBuilder.createImport('../datatypes', { namedImports: ['HumanName'] });
			const import3 = astBuilder.createImport('../datatypes', { namedImports: ['ContactPoint'] });

			moduleManager.registerModule('fhir/resources/patient.ts', {
				imports: [import1, import2, import3]
			});

			// Optimize imports
			const optimized = moduleManager.optimizeImports({
				mergeNamedImports: true,
				sortImports: true
			});

			const patientOptimized = optimized.get('fhir/resources/patient.ts');
			expect(patientOptimized).toHaveLength(1);
			expect(patientOptimized?.[0].namedImports).toContain('Identifier');
			expect(patientOptimized?.[0].namedImports).toContain('HumanName');
			expect(patientOptimized?.[0].namedImports).toContain('ContactPoint');
		});
	});
});

describe('FHIR End-to-End Integration', () => {
	it('should generate complete FHIR resource with all components', async () => {
		const astBuilder = createASTBuilder();
		const fragmentBuilder = createFragmentBuilder();
		const transformationEngine = createTransformationEngine();
		const visitorEngine = createVisitorEngine();
		const moduleManager = createModuleManager();

		// 1. Create FHIR Patient resource with inheritance
		const patientInterface = FHIRHelpers.createFHIRResourceInterface('Patient', 'DomainResource', {
			properties: [
				{ name: 'identifier', type: astBuilder.createArrayType(astBuilder.createTypeReference('Identifier')), optional: true },
				{ name: 'active', type: astBuilder.createBooleanType(), optional: true },
				{ name: 'name', type: astBuilder.createArrayType(astBuilder.createTypeReference('HumanName')), optional: true },
				{ name: 'gender', type: astBuilder.createUnionType([
					astBuilder.createLiteralType('male'),
					astBuilder.createLiteralType('female'),
					astBuilder.createLiteralType('other'),
					astBuilder.createLiteralType('unknown')
				]), optional: true }
			],
			documentation: 'FHIR Patient resource'
		});

		// 2. Apply FHIR transformations
		const fhirTransformer = new BuiltInTransformers.DocumentationTransformer((node) => {
			if (node.kind === 'InterfaceDeclaration') {
				return `Generated FHIR ${(node as InterfaceDeclaration).name} - Compliant with FHIR R4`;
			}
			return null;
		});

		transformationEngine.registerTransformer(fhirTransformer);
		const transformationResult = await transformationEngine.transform(patientInterface);

		expect(transformationResult.success).toBe(true);

		// 3. Generate multi-language output
		const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
		const javaVisitor = LanguageVisitors.createJavaClassVisitor();

		visitorEngine.registerVisitors([pythonVisitor, javaVisitor]);

		const pythonResult = await visitorEngine.execute(transformationResult.transformedNode, {
			languageTarget: 'python'
		});

		const javaResult = await visitorEngine.execute(transformationResult.transformedNode, {
			languageTarget: 'java'
		});

		expect(pythonResult.success).toBe(true);
		expect(javaResult.success).toBe(true);

		// 4. Manage module dependencies
		const patientModule = moduleManager.registerModule('src/resources/patient.ts', {
			imports: [
				astBuilder.createImport('../base/domain-resource', { namedImports: ['DomainResource'] }),
				astBuilder.createImport('../datatypes', { namedImports: ['Identifier', 'HumanName'] })
			],
			exports: [astBuilder.createExport({ namedExports: ['Patient'] })]
		});

		// Fix dependencies
		patientModule.dependencies[0].target = 'src/base/domain-resource.ts';
		patientModule.dependencies[1].target = 'src/datatypes.ts';

		moduleManager.registerModule('src/base/domain-resource.ts', {
			exports: [astBuilder.createExport({ namedExports: ['DomainResource'] })]
		});

		moduleManager.registerModule('src/datatypes.ts', {
			exports: [astBuilder.createExport({ namedExports: ['Identifier', 'HumanName'] })]
		});

		const resolution = moduleManager.resolveDependencies();
		expect(resolution.success).toBe(true);

		// 5. Validate complete integration
		const patterns = new ASTPatterns();
		expect(patterns.isFHIRResourceInterface(transformationResult.transformedNode as InterfaceDeclaration)).toBe(true);
		expect(patterns.hasInheritance(transformationResult.transformedNode as InterfaceDeclaration)).toBe(true);

		// Validate Python output
		const pythonCode = pythonResult.results.get('PythonClassVisitor_' + transformationResult.transformedNode.id);
		expect(pythonCode).toContain('class Patient:');
		expect(pythonCode).toContain('self.resourceType: str = None');

		// Validate Java output
		const javaCode = javaResult.results.get('JavaClassVisitor_' + transformationResult.transformedNode.id);
		expect(javaCode).toContain('public class Patient {');
		expect(javaCode).toContain('private String resourceType;');
	});
});