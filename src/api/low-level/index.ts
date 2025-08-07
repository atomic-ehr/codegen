/**
 * Low-Level API Module
 *
 * Main entry point for the atomic-codegen low-level API.
 * Provides direct AST manipulation, transformation, and advanced code generation
 * capabilities for fine-grained control over the generation process.
 *
 * @packageDocumentation
 */

// Core AST building and manipulation
export type {
	ArrayType,
	// AST Builder and Manipulation
	ASTBuilder,
	ASTManipulator,
	// AST Node Types
	ASTNode,
	ASTPatterns,
	ASTTraverser,
	ExportDeclaration,
	ImportDeclaration,
	InterfaceDeclaration,
	LiteralType,
	Position,
	PropertySignature,
	SourceRange,
	TypeNode,
	TypeParameterDeclaration,
	TypeReference,
	UnionType,
} from "./ast";

// Code fragment composition
export type {
	ASTRenderer,
	// Fragment Types
	CodeFragment,
	// Fragment Builder and Composer
	CodeFragmentBuilder,
	CodeFragmentComposer,
	// Common Templates
	CommonTemplates,
	FragmentCompositionOptions,
	FragmentTemplate,
} from "./fragment";
// Module management
export type {
	DependencyGraph,
	DependencyResolutionResult,
	ImportOptimizationOptions,
	// Module Types
	ModuleDependency,
	ModuleExport,
	ModuleInfo,
	// Module Manager
	ModuleManager,
	ModuleResolutionOptions,
} from "./module-manager";
// Source map support
export type {
	MappingContext,
	// Source Map Types
	SourceMap,
	SourceMapBuilder,
	// Source Map Generator
	SourceMapGenerator,
	SourceMapMapping,
	SourceMapOptions,
	SourceMapSource,
	SourceMapUtils,
} from "./sourcemap";
// Transformation system
export type {
	BuiltInMiddleware,
	// Built-in Transformers
	BuiltInTransformers,
	TransformationContext,
	// Transformation Engine
	TransformationEngine,
	TransformationError,
	TransformationPipelineBuilder,
	TransformationPipelineConfig,
	TransformationResult,
	TransformationWarning,
	// Transformer Types
	Transformer,
	TransformerMiddleware,
} from "./transformer";
// Visitor pattern
export type {
	BuiltInVisitors,
	// Language-specific Visitors
	LanguageVisitors,
	// Visitor Types
	Visitor,
	VisitorContext,
	// Visitor Engine
	VisitorEngine,
	VisitorError,
	VisitorOptions,
	VisitorPatternBuilder,
	VisitorResult,
} from "./visitor";

/**
 * Quick start examples and factory functions
 */

import { ASTBuilder, ASTPatterns } from "./ast";
import { CodeFragmentBuilder } from "./fragment";
import { ModuleManager } from "./module-manager";
import { TransformationEngine } from "./transformer";
import { VisitorEngine } from "./visitor";

/**
 * Create a new AST builder instance
 */
export function createASTBuilder(): ASTBuilder {
	return new ASTBuilder();
}

/**
 * Create a new AST patterns helper
 */
export function createASTPatterns(): ASTPatterns {
	return new ASTPatterns();
}

/**
 * Create a new code fragment builder
 */
export function createFragmentBuilder(): CodeFragmentBuilder {
	return new CodeFragmentBuilder();
}

/**
 * Create a new transformation engine
 */
export function createTransformationEngine(): TransformationEngine {
	return new TransformationEngine();
}

/**
 * Create a new visitor engine
 */
export function createVisitorEngine(): VisitorEngine {
	return new VisitorEngine();
}

/**
 * Create a new module manager
 */
export function createModuleManager(): ModuleManager {
	return new ModuleManager();
}

/**
 * FHIR-specific helpers for inheritance and extension patterns
 */
export namespace FHIRHelpers {
	/**
	 * Create a FHIR resource interface with proper inheritance support
	 */
	export function createFHIRResourceInterface(
		name: string,
		baseType?: string,
		options: {
			properties?: Array<{
				name: string;
				type: any;
				optional?: boolean;
				documentation?: string;
			}>;
			documentation?: string;
			profiles?: string[];
		} = {},
	) {
		const builder = new ASTBuilder();
		const _patterns = new ASTPatterns();

		// Create base interface with extension support
		const baseTypes = [];

		// Add base FHIR resource type
		if (baseType) {
			baseTypes.push(builder.createTypeReference(baseType));
		} else {
			baseTypes.push(builder.createTypeReference("Resource"));
		}

		// Add profile extensions if specified
		if (options.profiles) {
			options.profiles.forEach((profile) => {
				baseTypes.push(builder.createTypeReference(profile));
			});
		}

		// Create resource interface with inheritance
		return builder.createInterface(name, {
			exported: true,
			extends: baseTypes,
			properties: [
				// Resource type property (override from base)
				builder.createProperty(
					"resourceType",
					builder.createLiteralType(name),
					{ documentation: `Resource type: ${name}` },
				),
				// Additional properties
				...(options.properties?.map((prop) =>
					builder.createProperty(prop.name, prop.type, {
						optional: prop.optional,
						documentation: prop.documentation,
					}),
				) || []),
			],
			documentation: options.documentation || `FHIR ${name} resource interface`,
		});
	}

	/**
	 * Create a FHIR profile interface that extends a base resource
	 */
	export function createFHIRProfileInterface(
		profileName: string,
		baseResource: string,
		constraints: Array<{
			propertyName: string;
			type?: any;
			required?: boolean;
			cardinality?: { min?: number; max?: number | "*" };
			documentation?: string;
		}> = [],
	) {
		const builder = new ASTBuilder();

		// Create profile interface extending base resource
		const profileInterface = builder.createInterface(profileName, {
			exported: true,
			extends: [builder.createTypeReference(baseResource)],
			documentation: `FHIR ${profileName} profile extending ${baseResource}`,
		});

		// Add constraint properties
		constraints.forEach((constraint) => {
			if (constraint.type) {
				const property = builder.createProperty(
					constraint.propertyName,
					constraint.type,
					{
						optional: !constraint.required,
						documentation: constraint.documentation,
					},
				);

				// Add cardinality metadata if specified
				if (constraint.cardinality) {
					if (!property.metadata) property.metadata = {};
					property.metadata.cardinality = constraint.cardinality;
				}

				builder.addPropertyToInterface?.(profileInterface, property);
			}
		});

		return profileInterface;
	}

	/**
	 * Create a FHIR extension interface
	 */
	export function createFHIRExtensionInterface(
		extensionName: string,
		valueType: any,
		options: {
			url: string;
			documentation?: string;
		},
	) {
		const builder = new ASTBuilder();

		return builder.createInterface(extensionName, {
			exported: true,
			extends: [builder.createTypeReference("Extension")],
			properties: [
				builder.createProperty("url", builder.createLiteralType(options.url), {
					documentation: "Extension URL",
				}),
				builder.createProperty("value", valueType, {
					optional: true,
					documentation: "Extension value",
				}),
			],
			documentation: options.documentation || `FHIR ${extensionName} extension`,
		});
	}

	/**
	 * Create template for FHIR resource with inheritance
	 */
	export const FHIR_RESOURCE_WITH_INHERITANCE = `/**
 * {{description}}
 * @extends {{baseType}}
 */
export interface {{resourceName}} extends {{baseType}} {
  resourceType: '{{resourceName}}';
{{properties}}
{{extensions}}
}`;

	/**
	 * Create template for FHIR profile
	 */
	export const FHIR_PROFILE_TEMPLATE = `/**
 * {{description}}
 * FHIR Profile: {{profileUrl}}
 * @extends {{baseResource}}
 */
export interface {{profileName}} extends {{baseResource}} {
{{constraintProperties}}
{{additionalProperties}}
}`;

	/**
	 * Template for complex inheritance hierarchies
	 */
	export const FHIR_INHERITANCE_CHAIN = `/**
 * {{description}}
 * Inheritance: {{inheritanceChain}}
 */
export interface {{typeName}}{{#if typeParameters}}<{{typeParameters}}>{{/if}} extends {{#each extends}}{{#if @index}}, {{/if}}{{this}}{{/each}} {
{{#each properties}}
  {{#if documentation}}/**
   * {{documentation}}
   {{#if cardinality}}* Cardinality: {{cardinality.min}}..{{cardinality.max}}{{/if}}
   */{{/if}}
  {{name}}{{#if optional}}?{{/if}}: {{type}};
{{/each}}
}`;

	/**
	 * Generate inheritance chain documentation
	 */
	export function generateInheritanceChain(
		typeName: string,
		inheritanceHierarchy: string[],
	): string {
		return `${typeName} → ${inheritanceHierarchy.reverse().join(" → ")}`;
	}
}

/**
 * Python-specific helpers for future cross-language support
 */
export namespace PythonHelpers {
	/**
	 * Create Python class with proper inheritance
	 */
	export function createPythonClassInterface(
		className: string,
		baseClasses: string[] = [],
		options: {
			properties?: Array<{
				name: string;
				type: string;
				optional?: boolean;
				documentation?: string;
			}>;
			documentation?: string;
			decorators?: string[];
		} = {},
	) {
		// This would generate a Python-compatible AST node structure
		// The visitor system would then convert this to Python syntax
		const builder = new ASTBuilder();

		return builder.createInterface(className, {
			exported: true,
			extends: baseClasses.map((base) => builder.createTypeReference(base)),
			properties:
				options.properties?.map((prop) =>
					builder.createProperty(
						prop.name,
						builder.createTypeReference(prop.type),
						{
							optional: prop.optional,
							documentation: prop.documentation,
						},
					),
				) || [],
			documentation: options.documentation,
			metadata: {
				languageTarget: "python",
				decorators: options.decorators,
			},
		});
	}

	/**
	 * Python class template with inheritance
	 */
	export const PYTHON_CLASS_TEMPLATE = `{{decorators}}class {{className}}{{baseClasses}}:
    """
    {{documentation}}
    """
    
    def __init__(self{{parameters}}):
{{propertyInit}}`;
}

/**
 * Quick start examples for common use cases
 */
export const Examples = {
	/**
	 * Create a simple TypeScript interface
	 */
	simpleInterface: () => {
		const builder = createASTBuilder();
		return builder.createInterface("Patient", {
			exported: true,
			properties: [
				builder.createProperty("id", builder.createStringType(), {
					optional: true,
				}),
				builder.createProperty("name", builder.createStringType()),
				builder.createProperty("age", builder.createNumberType(), {
					optional: true,
				}),
			],
		});
	},

	/**
	 * Create a FHIR resource with inheritance
	 */
	fhirResourceWithInheritance: () => {
		return FHIRHelpers.createFHIRResourceInterface(
			"Patient",
			"DomainResource",
			{
				properties: [
					{ name: "identifier", type: "Identifier[]", optional: true },
					{ name: "name", type: "HumanName[]", optional: true },
					{
						name: "gender",
						type: '"male" | "female" | "other" | "unknown"',
						optional: true,
					},
				],
				documentation: "Patient resource with proper FHIR inheritance",
			},
		);
	},

	/**
	 * Transform an interface with custom transformer
	 */
	customTransformation: async () => {
		const engine = createTransformationEngine();
		const builder = createASTBuilder();

		// Create a simple interface
		const interface_ = builder.createInterface("Example", {
			properties: [
				builder.createProperty("oldName", builder.createStringType()),
			],
		});

		// Register a property renaming transformer
		engine.registerTransformer({
			name: "PropertyRenamer",
			canTransform: (node) => node.kind === "InterfaceDeclaration",
			transform: async (node) => {
				const manipulator = new (await import("./ast")).ASTManipulator();
				const cloned = manipulator.cloneNode(node);

				// Rename properties (example transformation)
				if ("properties" in cloned) {
					(cloned as any).properties.forEach((prop: any) => {
						if (prop.name === "oldName") {
							prop.name = "newName";
						}
					});
				}

				return cloned;
			},
		});

		return await engine.transform(interface_);
	},
};

/**
 * Type definitions for better TypeScript support
 */
export type * from "./ast";
export type * from "./fragment";
export type * from "./module-manager";
export type * from "./sourcemap";
export type * from "./transformer";
export type * from "./visitor";
