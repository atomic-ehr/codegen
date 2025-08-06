/**
 * Python Code Generator
 *
 * Generates Python dataclasses and type hints from FHIR TypeSchema definitions.
 * Follows Python naming conventions and modern Python practices.
 */

import {
	BaseGenerator,
	type GeneratorOptions,
} from "../../lib/generators/base";
import { type LoadedSchemas, SchemaLoader } from "../../lib/generators/loader";
import type {
	TypeSchema,
	TypeSchemaField,
	TypeSchemaIdentifier,
	TypeSchemaNestedType,
	TypeSchemaValueSet,
} from "../../lib/typeschema";

export interface PythonGeneratorOptions extends GeneratorOptions {
	packagePath?: string;
	usePydantic?: boolean;
	generateInit?: boolean;
}

export class PythonGenerator extends BaseGenerator {
	readonly name = "python";
	readonly target = "Python";

	private schemas: LoadedSchemas | null = null;
	private loader: SchemaLoader;
	private generatedTypes = new Set<string>();
	private usePydantic: boolean;
	private generateInit: boolean;

	// Python type mapping for FHIR primitives
	private typeMapping = new Map<string, string>([
		["boolean", "bool"],
		["integer", "int"],
		["string", "str"],
		["decimal", "float"],
		["uri", "str"],
		["url", "str"],
		["canonical", "str"],
		["uuid", "str"],
		["id", "str"],
		["oid", "str"],
		["unsignedInt", "int"],
		["positiveInt", "int"],
		["markdown", "str"],
		["time", "str"],
		["date", "str"],
		["dateTime", "str"],
		["instant", "str"],
		["base64Binary", "str"],
		["code", "str"],
		["xhtml", "str"],
	]);

	constructor(options: PythonGeneratorOptions) {
		super(options);
		this.loader = new SchemaLoader({
			packagePath: options.packagePath,
			verbose: options.verbose,
		});
		this.usePydantic = options.usePydantic ?? false;
		this.generateInit = options.generateInit ?? true;
	}

	async generate(): Promise<void> {
		// Load schemas if not already provided
		if (!this.schemas) {
			this.log("Loading FHIR schemas...");
			this.schemas = await this.loader.load();
		}

		// Generate primitive types
		this.log("Generating primitive types...");
		await this.generatePrimitiveTypes();

		// Generate complex types
		this.log("Generating complex types...");
		await this.generateComplexTypes();

		// Generate resources
		this.log("Generating resources...");
		await this.generateResources();

		// Generate value sets
		this.log("Generating value sets...");
		await this.generateValueSets();

		// Generate profiles
		this.log("Generating profiles...");
		await this.generateProfiles();

		// Generate __init__.py files
		if (this.generateInit) {
			this.log("Generating __init__.py files...");
			await this.generateInitFiles();
		}

		// Write all files
		await this.writeFiles();

		// Clean up resources
		await this.loader.cleanup();
	}

	private async generatePrimitiveTypes(): Promise<void> {
		if (!this.schemas) return;

		this.file("types/primitives.py");

		this.multiLineComment(
			[
				"FHIR Primitive Types",
				"",
				"Base primitive types used throughout FHIR resources.",
				"These correspond to FHIR primitive data types.",
			].join("\n"),
		);
		this.blank();

		// Add imports
		this.line("from typing import Union, Optional, Any, Dict");
		if (this.usePydantic) {
			this.line("from pydantic import BaseModel, Field");
		} else {
			this.line("from dataclasses import dataclass, field");
		}
		this.blank();

		// Generate base reference type first
		this.generateReferenceType();
		this.blank();

		// Generate type aliases for primitives
		for (const primitive of this.schemas.primitiveTypes) {
			this.generateTypeAlias(primitive);
			this.blank();
		}
	}

	private async generateComplexTypes(): Promise<void> {
		if (!this.schemas) return;

		this.file("types/complex.py");

		this.line("from typing import Union, Optional, List, Dict, Any");
		this.line("from .primitives import *");
		if (this.usePydantic) {
			this.line("from pydantic import BaseModel, Field");
		} else {
			this.line("from dataclasses import dataclass, field");
		}
		this.blank();

		this.multiLineComment(
			[
				"FHIR Complex Types",
				"",
				"Complex data types used throughout FHIR resources.",
				"These are reusable structured types.",
			].join("\n"),
		);
		this.blank();

		// Sort complex types topologically to handle dependencies
		const sortedTypes = this.topologicalSort(this.schemas.complexTypes);

		for (const complexType of sortedTypes) {
			this.generateDataClass(complexType);
			this.blank();
		}
	}

	private async generateResources(): Promise<void> {
		if (!this.schemas) return;

		// Create resources directory structure
		for (const resource of this.schemas.resources) {
			await this.generateResourceFile(resource);
		}

		// Generate resources index
		await this.generateResourcesIndex();
	}

	private async generateValueSets(): Promise<void> {
		if (!this.schemas) return;

		this.file("types/valuesets.py");

		this.line("from typing import Literal, Union");
		this.line("from enum import Enum");
		this.blank();

		this.multiLineComment(
			[
				"FHIR Value Sets",
				"",
				"Enumerated values and code systems used in FHIR.",
			].join("\n"),
		);
		this.blank();

		for (const valueSet of this.schemas.valueSets) {
			this.generateValueSetEnum(valueSet);
			this.blank();
		}
	}

	private async generateProfiles(): Promise<void> {
		if (!this.schemas) return;

		// Generate profile files
		for (const profile of this.schemas.profiles) {
			await this.generateProfileFile(profile);
		}

		// Generate profiles index
		await this.generateProfilesIndex();
	}

	private async generateInitFiles(): Promise<void> {
		// Generate main __init__.py
		this.file("__init__.py");
		this.multiLineComment("FHIR Python Types - Generated Code");
		this.blank();
		this.line("from .types import *");
		this.line("from .resources import *");
		if (this.schemas?.profiles.length) {
			this.line("from .profiles import *");
		}
		this.blank();

		// Generate types/__init__.py
		this.file("types/__init__.py");
		this.line("from .primitives import *");
		this.line("from .complex import *");
		this.line("from .valuesets import *");
		this.blank();

		// Generate resources/__init__.py
		this.file("resources/__init__.py");
		if (this.schemas?.resources) {
			for (const resource of this.schemas.resources) {
				const moduleName = this.toSnakeCase(resource.name);
				this.line(`from .${moduleName} import ${resource.name}`);
			}
		}
		this.blank();
	}

	private generateReferenceType(): void {
		if (this.usePydantic) {
			this.line("class Reference(BaseModel):");
		} else {
			this.line("@dataclass");
			this.line("class Reference:");
		}
		this.indent();
		this.multiLineComment("A reference from one resource to another");
		this.blank();

		if (this.usePydantic) {
			this.line(
				'reference: Optional[str] = Field(None, description="Literal reference, Relative, internal or absolute URL")',
			);
			this.line(
				'type: Optional[str] = Field(None, description="Type the reference refers to")',
			);
			this.line(
				'identifier: Optional[Dict[str, Any]] = Field(None, description="Logical reference, when literal reference is not known")',
			);
			this.line(
				'display: Optional[str] = Field(None, description="Text alternative for the resource")',
			);
		} else {
			this.line(
				"reference: Optional[str] = field(default=None)  # Literal reference, Relative, internal or absolute URL",
			);
			this.line(
				"type: Optional[str] = field(default=None)  # Type the reference refers to",
			);
			this.line(
				"identifier: Optional[Dict[str, Any]] = field(default=None)  # Logical reference, when literal reference is not known",
			);
			this.line(
				"display: Optional[str] = field(default=None)  # Text alternative for the resource",
			);
		}
		this.dedent();
	}

	private generateTypeAlias(primitive: TypeSchema): void {
		const pythonType = this.typeMapping.get(primitive.name) || "str";
		this.line(
			`# ${primitive.name} - ${primitive.description || "FHIR primitive type"}`,
		);
		this.line(`${this.toPascalCase(primitive.name)} = ${pythonType}`);
	}

	private generateDataClass(schema: TypeSchema): void {
		const className = this.toPascalCase(schema.name);

		if (this.usePydantic) {
			this.line(`class ${className}(BaseModel):`);
		} else {
			this.line("@dataclass");
			this.line(`class ${className}:`);
		}

		this.indent();

		if (schema.description) {
			this.multiLineComment(schema.description);
			this.blank();
		}

		// Generate fields
		const fields = Object.entries(schema.fields || {});
		if (fields.length === 0) {
			this.line("pass");
		} else {
			for (const [fieldName, field] of fields) {
				this.generateField(fieldName, field);
			}
		}

		this.dedent();
		this.generatedTypes.add(className);
	}

	private generateField(name: string, field: TypeSchemaField): void {
		const fieldName = this.toSnakeCase(name);
		const fieldType = this.getFieldType(field);
		const isOptional = !field.required;
		const finalType = isOptional ? `Optional[${fieldType}]` : fieldType;

		if (this.usePydantic) {
			const defaultValue = isOptional ? "None" : "...";
			const description = field.description
				? `, description="${field.description}"`
				: "";
			this.line(
				`${fieldName}: ${finalType} = Field(${defaultValue}${description})`,
			);
		} else {
			const defaultValue = isOptional ? " = field(default=None)" : "";
			const comment = field.description ? `  # ${field.description}` : "";
			this.line(`${fieldName}: ${finalType}${defaultValue}${comment}`);
		}
	}

	private getFieldType(field: TypeSchemaField): string {
		if (field.array) {
			const elementType = this.getElementType(field);
			return `List[${elementType}]`;
		}

		return this.getElementType(field);
	}

	private getElementType(field: TypeSchemaField): string {
		if (field.type === "reference") {
			return "Reference";
		}

		if (field.type === "choice") {
			const choiceTypes = field.choiceOf?.map((choice) =>
				this.getChoiceElementType(choice),
			) || ["Any"];
			return `Union[${choiceTypes.join(", ")}]`;
		}

		if (field.references) {
			const refType = this.getTypeName(field.references[0]);
			return refType;
		}

		// Handle primitive types
		const pythonType = this.typeMapping.get(field.type || "");
		if (pythonType) {
			return pythonType;
		}

		// Handle complex types
		return this.toPascalCase(field.type || "Any");
	}

	private getChoiceElementType(choice: string): string {
		const pythonType = this.typeMapping.get(choice);
		if (pythonType) {
			return pythonType;
		}
		return this.toPascalCase(choice);
	}

	private getTypeName(identifier: TypeSchemaIdentifier): string {
		return this.toPascalCase(identifier.name);
	}

	private generateValueSetEnum(valueSet: TypeSchemaValueSet): void {
		const enumName = this.toPascalCase(valueSet.name);

		this.line(`class ${enumName}(str, Enum):`);
		this.indent();

		if (valueSet.description) {
			this.multiLineComment(valueSet.description);
			this.blank();
		}

		if (valueSet.concepts && valueSet.concepts.length > 0) {
			for (const concept of valueSet.concepts) {
				const memberName = this.toConstantCase(concept.code);
				this.line(`${memberName} = "${concept.code}"`);
			}
		} else {
			this.line("pass");
		}

		this.dedent();
	}

	private async generateResourceFile(resource: TypeSchema): Promise<void> {
		const fileName = `resources/${this.toSnakeCase(resource.name)}.py`;
		this.file(fileName);

		this.line("from typing import Union, Optional, List, Dict, Any");
		this.line("from ..types.primitives import *");
		this.line("from ..types.complex import *");
		if (this.usePydantic) {
			this.line("from pydantic import BaseModel, Field");
		} else {
			this.line("from dataclasses import dataclass, field");
		}
		this.blank();

		this.generateDataClass(resource);
	}

	private async generateResourcesIndex(): Promise<void> {
		// Already handled in generateInitFiles
	}

	private async generateProfileFile(profile: TypeSchema): Promise<void> {
		const fileName = `profiles/${this.toSnakeCase(profile.name)}.py`;
		this.file(fileName);

		this.line("from typing import Union, Optional, List, Dict, Any");
		this.line("from ..types.primitives import *");
		this.line("from ..types.complex import *");
		this.line("from ..resources import *");
		if (this.usePydantic) {
			this.line("from pydantic import BaseModel, Field");
		} else {
			this.line("from dataclasses import dataclass, field");
		}
		this.blank();

		this.generateDataClass(profile);
	}

	private async generateProfilesIndex(): Promise<void> {
		if (!this.schemas?.profiles.length) return;

		this.file("profiles/__init__.py");
		for (const profile of this.schemas.profiles) {
			const moduleName = this.toSnakeCase(profile.name);
			this.line(`from .${moduleName} import ${profile.name}`);
		}
		this.blank();
	}

	private topologicalSort(schemas: TypeSchema[]): TypeSchema[] {
		// Simple topological sort - for now just return as-is
		// TODO: Implement proper dependency resolution
		return schemas;
	}

	// Utility methods for Python naming conventions
	private toSnakeCase(str: string): string {
		return str
			.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
			.replace(/([a-z\d])([A-Z])/g, "$1_$2")
			.toLowerCase()
			.replace(/^_/, "");
	}

	private toPascalCase(str: string): string {
		return str
			.split(/[-_\s]/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join("");
	}

	private toConstantCase(str: string): string {
		return str
			.replace(/([A-Z])/g, "_$1")
			.toUpperCase()
			.replace(/^_/, "")
			.replace(/[^A-Z0-9_]/g, "_");
	}
}
