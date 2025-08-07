/**
 * Python Compatibility Layer Integration Tests
 * 
 * Tests for Python class generation from TypeScript interfaces,
 * language-agnostic visitor patterns, and cross-language compatibility.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import {
	createASTBuilder,
	createFragmentBuilder,
	createVisitorEngine,
	createTransformationEngine,
	LanguageVisitors,
	PythonHelpers,
	BuiltInVisitors,
	type InterfaceDeclaration,
	type VisitorContext
} from '../../../src/api/low-level';

describe('Python Class Generation', () => {
	let astBuilder: any;
	let visitorEngine: any;

	beforeEach(() => {
		astBuilder = createASTBuilder();
		visitorEngine = createVisitorEngine();
	});

	describe('Basic Python Class Generation', () => {
		it('should generate Python class from simple TypeScript interface', async () => {
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
			visitorEngine.registerVisitor(pythonVisitor);

			const personInterface = astBuilder.createInterface('Person', {
				properties: [
					astBuilder.createProperty('name', astBuilder.createStringType()),
					astBuilder.createProperty('age', astBuilder.createNumberType(), { optional: true }),
					astBuilder.createProperty('email', astBuilder.createStringType(), { optional: true })
				],
				documentation: 'A simple Person class'
			});

			const result = await visitorEngine.execute(personInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const pythonCode = result.results.get('PythonClassVisitor_' + personInterface.id);
			expect(pythonCode).toContain('class Person:');
			expect(pythonCode).toContain('"""');
			expect(pythonCode).toContain('A simple Person class');
			expect(pythonCode).toContain('def __init__(self):');
			expect(pythonCode).toContain('self.name: str = None');
			expect(pythonCode).toContain('self.age: float | None = None');
			expect(pythonCode).toContain('self.email: str | None = None');
		});

		it('should generate Python class with inheritance', async () => {
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
			visitorEngine.registerVisitor(pythonVisitor);

			const employeeInterface = astBuilder.createInterface('Employee', {
				extends: [astBuilder.createTypeReference('Person')],
				properties: [
					astBuilder.createProperty('employeeId', astBuilder.createStringType()),
					astBuilder.createProperty('department', astBuilder.createStringType(), { optional: true }),
					astBuilder.createProperty('salary', astBuilder.createNumberType(), { optional: true })
				],
				documentation: 'An Employee extending Person'
			});

			const result = await visitorEngine.execute(employeeInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const pythonCode = result.results.get('PythonClassVisitor_' + employeeInterface.id);
			expect(pythonCode).toContain('class Employee:');
			expect(pythonCode).toContain('An Employee extending Person');
			expect(pythonCode).toContain('self.employeeId: str = None');
			expect(pythonCode).toContain('self.department: str | None = None');
			expect(pythonCode).toContain('self.salary: float | None = None');
		});

		it('should handle complex TypeScript types in Python', async () => {
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
			visitorEngine.registerVisitor(pythonVisitor);

			const complexInterface = astBuilder.createInterface('ComplexType', {
				properties: [
					astBuilder.createProperty('tags', astBuilder.createArrayType(astBuilder.createStringType())),
					astBuilder.createProperty('metadata', astBuilder.createTypeReference('Record'), { optional: true }),
					astBuilder.createProperty('status', astBuilder.createUnionType([
						astBuilder.createLiteralType('active'),
						astBuilder.createLiteralType('inactive'),
						astBuilder.createLiteralType('pending')
					])),
					astBuilder.createProperty('nested', astBuilder.createArrayType(astBuilder.createTypeReference('NestedType')), { optional: true })
				]
			});

			const result = await visitorEngine.execute(complexInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const pythonCode = result.results.get('PythonClassVisitor_' + complexInterface.id);
			expect(pythonCode).toContain('class ComplexType:');
			expect(pythonCode).toContain('self.tags: List[str] = None');
			expect(pythonCode).toContain('self.metadata: Record | None = None');
			expect(pythonCode).toContain('self.status: str = None'); // Union types become str in basic mapping
			expect(pythonCode).toContain('self.nested: List[NestedType] | None = None');
		});

		it('should generate empty Python class for interface without properties', async () => {
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
			visitorEngine.registerVisitor(pythonVisitor);

			const emptyInterface = astBuilder.createInterface('EmptyClass', {
				documentation: 'An empty class for testing'
			});

			const result = await visitorEngine.execute(emptyInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const pythonCode = result.results.get('PythonClassVisitor_' + emptyInterface.id);
			expect(pythonCode).toContain('class EmptyClass:');
			expect(pythonCode).toContain('An empty class for testing');
			expect(pythonCode).toContain('pass');
		});
	});

	describe('PythonHelpers Namespace', () => {
		it('should create Python class interface using helper', () => {
			const pythonClass = PythonHelpers.createPythonClassInterface('DataModel', ['BaseModel'], {
				properties: [
					{ name: 'id', type: 'int', optional: false, documentation: 'Unique identifier' },
					{ name: 'name', type: 'str', optional: false, documentation: 'Model name' },
					{ name: 'description', type: 'str', optional: true, documentation: 'Optional description' }
				],
				documentation: 'A data model class',
				decorators: ['@dataclass', '@validate_args']
			});

			expect(pythonClass.kind).toBe('InterfaceDeclaration');
			expect(pythonClass.name).toBe('DataModel');
			expect(pythonClass.metadata?.languageTarget).toBe('python');
			expect(pythonClass.metadata?.decorators).toEqual(['@dataclass', '@validate_args']);
			expect(pythonClass.extends).toHaveLength(1);
			expect(pythonClass.extends?.[0]).toEqual(expect.objectContaining({ name: 'BaseModel' }));
			expect(pythonClass.properties).toHaveLength(3);
		});

		it('should use Python class template', () => {
			const fragmentBuilder = createFragmentBuilder();

			const templateData = {
				className: 'Patient',
				baseClasses: ['BaseModel', 'Serializable'],
				documentation: 'FHIR Patient model for Python',
				decorators: ['@dataclass', '@validate_assignment'],
				properties: [
					{ name: 'id', type: 'str', optional: true },
					{ name: 'name', type: 'List[HumanName]', optional: true },
					{ name: 'active', type: 'bool', optional: true }
				]
			};

			const fragment = fragmentBuilder.fromTemplate(PythonHelpers.PYTHON_CLASS_TEMPLATE, templateData);

			expect(fragment.content).toContain('@dataclass');
			expect(fragment.content).toContain('@validate_assignment');
			expect(fragment.content).toContain('class Patient(BaseModel, Serializable):');
			expect(fragment.content).toContain('FHIR Patient model for Python');
			expect(fragment.content).toContain('def __init__(self, id: str | None, name: List[HumanName] | None, active: bool | None):');
			expect(fragment.content).toContain('self.id: str | None = id if id is not None else None');
			expect(fragment.content).toContain('self.name: List[HumanName] | None = name if name is not None else None');
			expect(fragment.content).toContain('self.active: bool | None = active if active is not None else None');
		});
	});

	describe('Advanced Python Generation Features', () => {
		it('should generate Pydantic model with validation', async () => {
			const pydanticVisitor = {
				name: 'PydanticModelVisitor',
				languageTarget: 'python' as const,
				visitClassLike: async (node: any, context: VisitorContext) => {
					if (node.kind === 'InterfaceDeclaration') {
						const lines = [];
						
						// Add imports
						lines.push('from pydantic import BaseModel, Field, validator');
						lines.push('from typing import Optional, List, Union');
						lines.push('');
						
						// Class definition
						lines.push(`class ${node.name}(BaseModel):`);
						lines.push('    """');
						lines.push(`    ${node.metadata?.documentation || `${node.name} Pydantic model`}`);
						lines.push('    """');
						lines.push('');
						
						// Add properties with Pydantic fields
						if (node.properties && node.properties.length > 0) {
							node.properties.forEach((prop: any) => {
								const pythonType = mapPropTypeToPydantic(prop);
								const fieldInfo = generatePydanticField(prop);
								lines.push(`    ${prop.name}: ${pythonType} = ${fieldInfo}`);
							});
						} else {
							lines.push('    pass');
						}
						
						// Add validators
						lines.push('');
						lines.push('    class Config:');
						lines.push('        validate_assignment = True');
						lines.push('        extra = "forbid"');
						
						return lines.join('\n');
					}
					return '';
				}
			};

			function mapPropTypeToPydantic(prop: any): string {
				const baseType = mapTypeToPython(prop.type);
				return prop.optional ? `Optional[${baseType}]` : baseType;
			}

			function mapTypeToPython(typeNode: any): string {
				switch (typeNode.kind) {
					case 'StringKeyword': return 'str';
					case 'BooleanKeyword': return 'bool';
					case 'NumberKeyword': return 'float';
					case 'ArrayType': return `List[${mapTypeToPython(typeNode.elementType)}]`;
					case 'UnionType': return `Union[${typeNode.types.map(mapTypeToPython).join(', ')}]`;
					case 'TypeReference': return typeNode.name;
					case 'LiteralType': return 'str'; // Literals become str for simplicity
					default: return 'Any';
				}
			}

			function generatePydanticField(prop: any): string {
				if (prop.optional) {
					return `Field(None, description="${prop.metadata?.documentation || ''}")`;
				} else {
					return `Field(..., description="${prop.metadata?.documentation || ''}")`;
				}
			}

			visitorEngine.registerVisitor(pydanticVisitor);

			const userInterface = astBuilder.createInterface('User', {
				properties: [
					astBuilder.createProperty('id', astBuilder.createStringType(), { documentation: 'User ID' }),
					astBuilder.createProperty('email', astBuilder.createStringType(), { documentation: 'User email address' }),
					astBuilder.createProperty('roles', astBuilder.createArrayType(astBuilder.createStringType()), { optional: true, documentation: 'User roles' }),
					astBuilder.createProperty('active', astBuilder.createBooleanType(), { optional: true, documentation: 'Whether user is active' })
				],
				documentation: 'User model with Pydantic validation'
			});

			const result = await visitorEngine.execute(userInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const pydanticCode = result.results.get('PydanticModelVisitor_' + userInterface.id);
			expect(pydanticCode).toContain('from pydantic import BaseModel, Field, validator');
			expect(pydanticCode).toContain('class User(BaseModel):');
			expect(pydanticCode).toContain('id: str = Field(..., description="User ID")');
			expect(pydanticCode).toContain('email: str = Field(..., description="User email address")');
			expect(pydanticCode).toContain('roles: Optional[List[str]] = Field(None, description="User roles")');
			expect(pydanticCode).toContain('active: Optional[bool] = Field(None, description="Whether user is active")');
			expect(pydanticCode).toContain('class Config:');
			expect(pydanticCode).toContain('validate_assignment = True');
		});

		it('should generate SQLAlchemy model with relationships', async () => {
			const sqlalchemyVisitor = {
				name: 'SQLAlchemyModelVisitor',
				languageTarget: 'python' as const,
				visitClassLike: async (node: any) => {
					if (node.kind === 'InterfaceDeclaration') {
						const lines = [];
						
						// Imports
						lines.push('from sqlalchemy import Column, Integer, String, Boolean, ForeignKey');
						lines.push('from sqlalchemy.ext.declarative import declarative_base');
						lines.push('from sqlalchemy.orm import relationship');
						lines.push('');
						lines.push('Base = declarative_base()');
						lines.push('');
						
						// Table class
						lines.push(`class ${node.name}(Base):`);
						lines.push(`    __tablename__ = '${node.name.toLowerCase()}'`);
						lines.push('');
						
						// Add columns
						if (node.properties && node.properties.length > 0) {
							node.properties.forEach((prop: any, index: number) => {
								const sqlType = mapTypeToSQLAlchemy(prop.type);
								const nullable = prop.optional ? ', nullable=True' : ', nullable=False';
								const primary = prop.name === 'id' ? ', primary_key=True' : '';
								lines.push(`    ${prop.name} = Column(${sqlType}${primary}${nullable})`);
							});
						}
						
						lines.push('');
						lines.push('    def __repr__(self):');
						lines.push(`        return f"<${node.name}({self.id if hasattr(self, 'id') else 'unknown'})>"`);
						
						return lines.join('\n');
					}
					return '';
				}
			};

			function mapTypeToSQLAlchemy(typeNode: any): string {
				switch (typeNode.kind) {
					case 'StringKeyword': return 'String(255)';
					case 'BooleanKeyword': return 'Boolean';
					case 'NumberKeyword': return 'Integer';
					case 'TypeReference': 
						if (typeNode.name.endsWith('Id')) return 'Integer, ForeignKey("table.id")';
						return 'String(255)';
					default: return 'String(255)';
				}
			}

			visitorEngine.registerVisitor(sqlalchemyVisitor);

			const orderInterface = astBuilder.createInterface('Order', {
				properties: [
					astBuilder.createProperty('id', astBuilder.createNumberType()),
					astBuilder.createProperty('customerId', astBuilder.createTypeReference('CustomerId')),
					astBuilder.createProperty('status', astBuilder.createStringType()),
					astBuilder.createProperty('total', astBuilder.createNumberType(), { optional: true })
				]
			});

			const result = await visitorEngine.execute(orderInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const sqlCode = result.results.get('SQLAlchemyModelVisitor_' + orderInterface.id);
			expect(sqlCode).toContain('from sqlalchemy import Column, Integer, String, Boolean, ForeignKey');
			expect(sqlCode).toContain('class Order(Base):');
			expect(sqlCode).toContain("__tablename__ = 'order'");
			expect(sqlCode).toContain('id = Column(Integer, primary_key=True, nullable=False)');
			expect(sqlCode).toContain('customerId = Column(Integer, ForeignKey("table.id"), nullable=False)');
			expect(sqlCode).toContain('status = Column(String(255), nullable=False)');
			expect(sqlCode).toContain('total = Column(Integer, nullable=True)');
		});
	});

	describe('Python Type Mapping and Validation', () => {
		it('should correctly map TypeScript types to Python types', async () => {
			const typeMapper = {
				name: 'PythonTypeMapperVisitor',
				languageTarget: 'python' as const,
				visitTypeLike: async (node: any) => {
					return mapDetailedTypeToPython(node);
				}
			};

			function mapDetailedTypeToPython(typeNode: any): string {
				switch (typeNode.kind) {
					case 'StringKeyword': return 'str';
					case 'NumberKeyword': return 'float';
					case 'BooleanKeyword': return 'bool';
					case 'ArrayType': return `List[${mapDetailedTypeToPython(typeNode.elementType)}]`;
					case 'UnionType': 
						const types = typeNode.types.map(mapDetailedTypeToPython);
						return `Union[${types.join(', ')}]`;
					case 'LiteralType': 
						if (typeof typeNode.value === 'string') return `Literal["${typeNode.value}"]`;
						if (typeof typeNode.value === 'number') return `Literal[${typeNode.value}]`;
						return 'Any';
					case 'TypeReference': return typeNode.name;
					default: return 'Any';
				}
			}

			visitorEngine.registerVisitor(typeMapper);

			// Test various TypeScript types
			const stringType = astBuilder.createStringType();
			const numberType = astBuilder.createNumberType();
			const booleanType = astBuilder.createBooleanType();
			const arrayType = astBuilder.createArrayType(astBuilder.createStringType());
			const unionType = astBuilder.createUnionType([astBuilder.createStringType(), astBuilder.createNumberType()]);
			const literalType = astBuilder.createLiteralType('active');
			const typeRef = astBuilder.createTypeReference('CustomType');

			const types = [stringType, numberType, booleanType, arrayType, unionType, literalType, typeRef];

			for (const type of types) {
				const result = await visitorEngine.execute(type, { languageTarget: 'python' });
				expect(result.success).toBe(true);
			}
		});

		it('should handle nested generic types', async () => {
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();
			visitorEngine.registerVisitor(pythonVisitor);

			const nestedInterface = astBuilder.createInterface('NestedGenerics', {
				properties: [
					astBuilder.createProperty('matrix', astBuilder.createArrayType(
						astBuilder.createArrayType(astBuilder.createNumberType())
					)),
					astBuilder.createProperty('keyValue', astBuilder.createTypeReference('Map'), { optional: true }),
					astBuilder.createProperty('optional', astBuilder.createArrayType(
						astBuilder.createUnionType([
							astBuilder.createStringType(),
							astBuilder.createTypeReference('CustomType')
						])
					), { optional: true })
				]
			});

			const result = await visitorEngine.execute(nestedInterface, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);

			const pythonCode = result.results.get('PythonClassVisitor_' + nestedInterface.id);
			expect(pythonCode).toContain('class NestedGenerics:');
			expect(pythonCode).toContain('self.matrix: List[List[float]] = None');
			expect(pythonCode).toContain('self.keyValue: Map | None = None');
			expect(pythonCode).toContain('self.optional: List[str | CustomType] | None = None');
		});
	});

	describe('Language-Agnostic Visitor Patterns', () => {
		it('should use generic visitor methods for cross-language compatibility', async () => {
			const crossLanguageVisitor = {
				name: 'CrossLanguageVisitor',
				languageTarget: 'generic' as const,
				visitClassLike: async (node: any, context: VisitorContext) => {
					return `Found class-like node: ${node.name}`;
				},
				visitFieldLike: async (node: any, context: VisitorContext) => {
					return `Found field-like node: ${node.name}`;
				},
				visitTypeLike: async (node: any, context: VisitorContext) => {
					return `Found type-like node: ${node.kind}`;
				}
			};

			visitorEngine.registerVisitor(crossLanguageVisitor);

			const testInterface = astBuilder.createInterface('TestClass', {
				properties: [
					astBuilder.createProperty('testField', astBuilder.createStringType())
				]
			});

			const result = await visitorEngine.execute(testInterface, {
				languageTarget: 'python' // Should still work with generic visitor
			});

			expect(result.success).toBe(true);
			expect(result.results.get('CrossLanguageVisitor_' + testInterface.id)).toBe('Found class-like node: TestClass');
		});

		it('should fallback from specific to generic visitor methods', async () => {
			const fallbackVisitor = {
				name: 'FallbackVisitor',
				languageTarget: 'python' as const,
				// No visitInterface method, should fallback to visitClassLike
				visitClassLike: async (node: any) => {
					return `Fallback to class-like for ${node.name}`;
				}
			};

			visitorEngine.registerVisitor(fallbackVisitor);

			const interface_ = astBuilder.createInterface('FallbackTest');
			const result = await visitorEngine.execute(interface_, {
				languageTarget: 'python'
			});

			expect(result.success).toBe(true);
			expect(result.results.get('FallbackVisitor_' + interface_.id)).toBe('Fallback to class-like for FallbackTest');
		});
	});

	describe('Python Integration with Transformations', () => {
		it('should transform TypeScript interface and generate Python code', async () => {
			const transformationEngine = createTransformationEngine();
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();

			// Create transformer to add Python-specific metadata
			const pythonTransformer = {
				name: 'PythonMetadataTransformer',
				canTransform: (node: any) => node.kind === 'InterfaceDeclaration',
				transform: async (node: any) => {
					const cloned = { ...node };
					cloned.metadata = {
						...cloned.metadata,
						pythonClassName: 'Py' + cloned.name,
						pythonModule: cloned.name.toLowerCase(),
						generateInit: true,
						generateRepr: true
					};
					return cloned;
				}
			};

			transformationEngine.registerTransformer(pythonTransformer);
			visitorEngine.registerVisitor(pythonVisitor);

			const originalInterface = astBuilder.createInterface('DataClass', {
				properties: [
					astBuilder.createProperty('value', astBuilder.createStringType()),
					astBuilder.createProperty('count', astBuilder.createNumberType(), { optional: true })
				]
			});

			// Transform first
			const transformResult = await transformationEngine.transform(originalInterface);
			expect(transformResult.success).toBe(true);

			// Then generate Python
			const pythonResult = await visitorEngine.execute(transformResult.transformedNode, {
				languageTarget: 'python'
			});

			expect(pythonResult.success).toBe(true);
			expect(transformResult.transformedNode.metadata.pythonClassName).toBe('PyDataClass');
			expect(transformResult.transformedNode.metadata.pythonModule).toBe('dataclass');

			const pythonCode = pythonResult.results.get('PythonClassVisitor_' + transformResult.transformedNode.id);
			expect(pythonCode).toContain('class DataClass:'); // Original name still used in visitor
			expect(pythonCode).toContain('self.value: str = None');
			expect(pythonCode).toContain('self.count: float | None = None');
		});
	});

	describe('Python Statistics and Analysis', () => {
		it('should collect statistics about Python generation', async () => {
			const statisticsVisitor = new BuiltInVisitors.StatisticsVisitor();
			const pythonVisitor = LanguageVisitors.createPythonClassVisitor();

			visitorEngine.registerVisitors([statisticsVisitor, pythonVisitor]);

			const complexInterface = astBuilder.createInterface('ComplexInterface', {
				properties: [
					astBuilder.createProperty('stringProp', astBuilder.createStringType()),
					astBuilder.createProperty('arrayProp', astBuilder.createArrayType(astBuilder.createNumberType())),
					astBuilder.createProperty('unionProp', astBuilder.createUnionType([
						astBuilder.createStringType(),
						astBuilder.createBooleanType()
					])),
					astBuilder.createProperty('refProp', astBuilder.createTypeReference('CustomType'))
				]
			});

			const result = await visitorEngine.execute(complexInterface, {
				languageTarget: 'python',
				enableStatistics: true
			});

			expect(result.success).toBe(true);

			const stats = statisticsVisitor.getStatistics();
			expect(stats.interfaces).toBe(1);
			expect(stats.properties).toBe(4);
			expect(stats.primitiveTypes).toBeGreaterThan(0);
			expect(stats.complexTypes).toBeGreaterThan(0);

			// Python code should be generated
			const pythonCode = result.results.get('PythonClassVisitor_' + complexInterface.id);
			expect(pythonCode).toBeDefined();
			expect(pythonCode).toContain('class ComplexInterface:');
		});
	});

	describe('End-to-End Python Workflow', () => {
		it('should complete full TypeScript to Python conversion workflow', async () => {
			const astBuilder = createASTBuilder();
			const transformationEngine = createTransformationEngine();
			const visitorEngine = createVisitorEngine();

			// 1. Create TypeScript interface
			const apiInterface = astBuilder.createInterface('APIResponse', {
				properties: [
					astBuilder.createProperty('success', astBuilder.createBooleanType()),
					astBuilder.createProperty('data', astBuilder.createUnionType([
						astBuilder.createTypeReference('UserData'),
						astBuilder.createArrayType(astBuilder.createTypeReference('UserData'))
					]), { optional: true }),
					astBuilder.createProperty('errors', astBuilder.createArrayType(astBuilder.createStringType()), { optional: true }),
					astBuilder.createProperty('metadata', astBuilder.createTypeReference('ResponseMetadata'), { optional: true })
				],
				documentation: 'API response wrapper'
			});

			// 2. Add Python-specific transformations
			const pythonEnhancementTransformer = {
				name: 'PythonEnhancementTransformer',
				canTransform: (node: any) => node.kind === 'InterfaceDeclaration',
				transform: async (node: any) => {
					const cloned = { ...node };
					
					// Add Python-specific metadata
					cloned.metadata = {
						...cloned.metadata,
						pythonGenerateDataclass: true,
						pythonGenerateJSON: true,
						pythonGenerateValidation: true
					};

					// Modify properties for Python conventions
					if (cloned.properties) {
						cloned.properties = cloned.properties.map((prop: any) => {
							const enhancedProp = { ...prop };
							
							// Convert camelCase to snake_case for Python
							if (prop.name === 'apiResponse') {
								enhancedProp.name = 'api_response';
							}
							
							return enhancedProp;
						});
					}

					return cloned;
				}
			};

			// 3. Create enhanced Python visitor
			const enhancedPythonVisitor = {
				name: 'EnhancedPythonVisitor',
				languageTarget: 'python' as const,
				visitClassLike: async (node: any) => {
					if (node.kind === 'InterfaceDeclaration') {
						const lines = [];
						
						// Imports based on metadata
						lines.push('from dataclasses import dataclass');
						lines.push('from typing import Optional, Union, List');
						lines.push('import json');
						lines.push('');
						
						// Decorator if requested
						if (node.metadata?.pythonGenerateDataclass) {
							lines.push('@dataclass');
						}
						
						lines.push(`class ${node.name}:`);
						lines.push('    """');
						lines.push(`    ${node.metadata?.documentation || `${node.name} class`}`);
						lines.push('    """');
						
						// Properties
						if (node.properties && node.properties.length > 0) {
							node.properties.forEach((prop: any) => {
								const pythonType = mapComplexTypeToPython(prop.type);
								const optional = prop.optional ? ' | None = None' : ' = None';
								lines.push(`    ${prop.name}: ${pythonType}${optional}`);
							});
						}
						
						// Add JSON methods if requested
						if (node.metadata?.pythonGenerateJSON) {
							lines.push('');
							lines.push('    def to_json(self) -> str:');
							lines.push('        """Convert to JSON string"""');
							lines.push('        return json.dumps(self.__dict__)');
							lines.push('');
							lines.push('    @classmethod');
							lines.push('    def from_json(cls, json_str: str):');
							lines.push('        """Create instance from JSON string"""');
							lines.push('        data = json.loads(json_str)');
							lines.push('        return cls(**data)');
						}
						
						return lines.join('\n');
					}
					return '';
				}
			};

			function mapComplexTypeToPython(typeNode: any): string {
				switch (typeNode.kind) {
					case 'StringKeyword': return 'str';
					case 'BooleanKeyword': return 'bool';
					case 'NumberKeyword': return 'float';
					case 'ArrayType': return `List[${mapComplexTypeToPython(typeNode.elementType)}]`;
					case 'UnionType': return `Union[${typeNode.types.map(mapComplexTypeToPython).join(', ')}]`;
					case 'TypeReference': return typeNode.name;
					default: return 'Any';
				}
			}

			// 4. Execute the workflow
			transformationEngine.registerTransformer(pythonEnhancementTransformer);
			visitorEngine.registerVisitor(enhancedPythonVisitor);

			// Transform
			const transformResult = await transformationEngine.transform(apiInterface);
			expect(transformResult.success).toBe(true);

			// Generate Python
			const pythonResult = await visitorEngine.execute(transformResult.transformedNode, {
				languageTarget: 'python'
			});

			expect(pythonResult.success).toBe(true);

			// 5. Validate complete output
			const pythonCode = pythonResult.results.get('EnhancedPythonVisitor_' + transformResult.transformedNode.id);
			
			expect(pythonCode).toContain('from dataclasses import dataclass');
			expect(pythonCode).toContain('from typing import Optional, Union, List');
			expect(pythonCode).toContain('@dataclass');
			expect(pythonCode).toContain('class APIResponse:');
			expect(pythonCode).toContain('API response wrapper');
			expect(pythonCode).toContain('success: bool = None');
			expect(pythonCode).toContain('data: Union[UserData, List[UserData]] | None = None');
			expect(pythonCode).toContain('errors: List[str] | None = None');
			expect(pythonCode).toContain('def to_json(self) -> str:');
			expect(pythonCode).toContain('def from_json(cls, json_str: str):');

			// 6. Verify transformation metadata
			expect(transformResult.transformedNode.metadata.pythonGenerateDataclass).toBe(true);
			expect(transformResult.transformedNode.metadata.pythonGenerateJSON).toBe(true);
		});
	});
});