/**
 * Rich JSDoc Generator for FHIR Types
 *
 * Generates comprehensive JSDoc documentation with examples,
 * FHIR paths, cardinality information, and binding details.
 */

import type { AnyTypeSchema } from "../../../typeschema/types";
import type { InterfaceGeneratorOptions } from "./enhanced-interfaces";

/**
 * Generate rich JSDoc documentation for a schema
 */
export function generateJSDoc(
	schema: AnyTypeSchema,
	options: InterfaceGeneratorOptions,
): string {
	const parts: string[] = [];

	if (!schema.identifier) return "";

	const description = getSchemaDescription(schema);
	const url = schema.identifier.url;
	const kind = schema.identifier.kind;

	parts.push("/**");

	// Main description
	if (description) {
		// Split long descriptions into multiple lines
		const lines = wrapDescription(description, 70);
		lines.forEach((line, index) => {
			parts.push(` * ${index === 0 ? "" : " "}${line}`);
		});
	}

	// Add blank line before additional info
	if (
		description &&
		(options.includeExamples || options.includeFHIRPath || url)
	) {
		parts.push(" *");
	}

	// Add FHIR path information
	if (options.includeFHIRPath && url) {
		parts.push(` * @fhirpath ${schema.identifier.name}`);
	}

	// Add resource type information
	if (kind === "resource") {
		parts.push(` * @resourceType ${schema.identifier.name}`);
	}

	// Add base type information
	if ("base" in schema && schema.base) {
		parts.push(` * @extends ${schema.base.name}`);
	}

	// Add package information
	if (
		schema.identifier.package &&
		schema.identifier.package !== "hl7.fhir.r4.core"
	) {
		parts.push(` * @package ${schema.identifier.package}`);
	}

	// Add version information
	if (schema.identifier.version) {
		parts.push(` * @version ${schema.identifier.version}`);
	}

	// Add example if enabled
	if (options.includeExamples) {
		const example = generateExample(schema);
		if (example) {
			parts.push(" *");
			parts.push(" * @example");
			parts.push(" * ```typescript");
			example.split("\n").forEach((line) => {
				parts.push(` * ${line}`);
			});
			parts.push(" * ```");
		}
	}

	// Add reference URL
	if (url) {
		parts.push(" *");
		parts.push(` * @see ${url}`);
	}

	parts.push(" */");

	return parts.join("\n");
}

/**
 * Generate a comprehensive example for a schema
 */
function generateExample(schema: AnyTypeSchema): string {
	if (!schema.identifier) return "";

	const typeName = formatTypeName(schema.identifier.name);
	const kind = schema.identifier.kind;

	if (kind === "resource") {
		return generateResourceExample(schema, typeName);
	}

	if (kind === "complex-type") {
		return generateComplexTypeExample(schema, typeName);
	}

	if (kind === "primitive-type") {
		return generatePrimitiveExample(schema, typeName);
	}

	return "";
}

/**
 * Generate example for a resource
 */
function generateResourceExample(
	_schema: AnyTypeSchema,
	typeName: string,
): string {
	const lines: string[] = [];
	const varName = typeName.toLowerCase();

	lines.push(`const ${varName}: ${typeName} = {`);
	lines.push(`  resourceType: '${typeName}',`);

	// Add some common fields based on the resource type
	if (typeName === "Patient") {
		lines.push(`  id: 'patient-123',`);
		lines.push(`  name: [{`);
		lines.push(`    given: ['John'],`);
		lines.push(`    family: 'Doe'`);
		lines.push(`  }],`);
		lines.push(`  birthDate: '1990-01-01',`);
		lines.push(`  gender: 'male'`);
	} else if (typeName === "Observation") {
		lines.push(`  id: 'obs-123',`);
		lines.push(`  status: 'final',`);
		lines.push(`  code: {`);
		lines.push(`    coding: [{`);
		lines.push(`      system: 'http://loinc.org',`);
		lines.push(`      code: '29463-7',`);
		lines.push(`      display: 'Body Weight'`);
		lines.push(`    }]`);
		lines.push(`  },`);
		lines.push(`  valueQuantity: {`);
		lines.push(`    value: 70,`);
		lines.push(`    unit: 'kg',`);
		lines.push(`    system: 'http://unitsofmeasure.org'`);
		lines.push(`  }`);
	} else {
		lines.push(`  id: '${varName}-123',`);
		lines.push(`  // ... other properties`);
	}

	lines.push(`};`);

	return lines.join("\n");
}

/**
 * Generate example for a complex type
 */
function generateComplexTypeExample(
	_schema: AnyTypeSchema,
	typeName: string,
): string {
	const lines: string[] = [];
	const varName = typeName.toLowerCase();

	lines.push(`const ${varName}: ${typeName} = {`);

	// Add common fields based on the type
	if (typeName === "HumanName") {
		lines.push(`  given: ['John'],`);
		lines.push(`  family: 'Doe',`);
		lines.push(`  use: 'official'`);
	} else if (typeName === "Address") {
		lines.push(`  line: ['123 Main St'],`);
		lines.push(`  city: 'Anytown',`);
		lines.push(`  state: 'ST',`);
		lines.push(`  postalCode: '12345',`);
		lines.push(`  country: 'US'`);
	} else if (typeName === "ContactPoint") {
		lines.push(`  system: 'phone',`);
		lines.push(`  value: '+1-555-123-4567',`);
		lines.push(`  use: 'home'`);
	} else if (typeName === "Identifier") {
		lines.push(`  system: 'http://example.org/identifiers',`);
		lines.push(`  value: 'ABC123'`);
	} else {
		lines.push(`  // ... properties`);
	}

	lines.push(`};`);

	return lines.join("\n");
}

/**
 * Generate example for a primitive type
 */
function generatePrimitiveExample(
	_schema: AnyTypeSchema,
	typeName: string,
): string {
	const varName = typeName.toLowerCase();

	switch (typeName) {
		case "string":
		case "code":
		case "uri":
		case "url":
			return `const ${varName}: ${typeName} = 'example-value';`;
		case "boolean":
			return `const ${varName}: ${typeName} = true;`;
		case "integer":
		case "decimal":
		case "unsignedInt":
		case "positiveInt":
			return `const ${varName}: ${typeName} = 42;`;
		case "date":
			return `const ${varName}: ${typeName} = '2024-01-01';`;
		case "dateTime":
			return `const ${varName}: ${typeName} = '2024-01-01T12:00:00Z';`;
		case "time":
			return `const ${varName}: ${typeName} = '12:00:00';`;
		default:
			return `const ${varName}: ${typeName} = /* value */;`;
	}
}

/**
 * Get description from schema safely
 */
function getSchemaDescription(schema: AnyTypeSchema): string {
	if ("description" in schema && schema.description) {
		return schema.description;
	}

	// Generate default description based on type and name
	const name = schema.identifier.name;
	const kind = schema.identifier.kind;

	switch (kind) {
		case "resource":
			return `${name} Resource - ${getResourceDescription(name)}`;
		case "complex-type":
			return `${name} Complex Type - ${getComplexTypeDescription(name)}`;
		case "primitive-type":
			return `${name} Primitive Type - ${getPrimitiveTypeDescription(name)}`;
		case "profile":
			return `${name} Profile - Constrained version of base resource`;
		case "value-set":
			return `${name} Value Set - Set of coded values`;
		default:
			return `FHIR ${name}`;
	}
}

/**
 * Get resource-specific description
 */
function getResourceDescription(name: string): string {
	const descriptions: Record<string, string> = {
		Patient:
			"Demographics and administrative information about an individual receiving care",
		Observation: "Measurements and simple assertions made about a patient",
		Practitioner:
			"Information about a person who is directly or indirectly involved in healthcare",
		Organization: "A grouping of people or organizations with a common purpose",
		Encounter: "An interaction between a patient and healthcare provider(s)",
		Procedure: "An activity that is performed on, with, or for a patient",
		Medication: "Definition of a medication",
		Condition: "A clinical condition, problem, diagnosis, or other event",
		DiagnosticReport: "Findings and interpretation of diagnostic tests",
		AllergyIntolerance: "Risk of harmful or undesirable physiological response",
	};

	return descriptions[name] || "FHIR resource for healthcare data exchange";
}

/**
 * Get complex type-specific description
 */
function getComplexTypeDescription(name: string): string {
	const descriptions: Record<string, string> = {
		HumanName: "Name of a human being",
		Address: "Physical location where something is located",
		ContactPoint: "Details for contacting a person or organization",
		Identifier: "Identifier for an entity",
		CodeableConcept: "Concept defined by Coding(s)",
		Coding: "Reference to a terminology system",
		Quantity: "Measured amount with units",
		Range: "Set of values bounded by low and high",
		Period: "Time period defined by start and end date/time",
		Reference: "Reference to another resource",
		Attachment: "Content in a format defined elsewhere",
	};

	return descriptions[name] || "FHIR complex data type";
}

/**
 * Get primitive type-specific description
 */
function getPrimitiveTypeDescription(name: string): string {
	const descriptions: Record<string, string> = {
		string: "String data type",
		boolean: "Boolean data type (true/false)",
		integer: "Integer data type",
		decimal: "Decimal number data type",
		uri: "Uniform Resource Identifier",
		url: "Uniform Resource Locator",
		date: "Date data type (YYYY-MM-DD)",
		dateTime: "Date and time data type",
		time: "Time data type (HH:MM:SS)",
		code: "Code from a controlled vocabulary",
		id: "Logical identifier data type",
	};

	return descriptions[name] || "FHIR primitive data type";
}

/**
 * Wrap long description text to specified width
 */
function wrapDescription(text: string, width: number): string[] {
	if (text.length <= width) {
		return [text];
	}

	const words = text.split(" ");
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		if (currentLine.length + word.length + 1 <= width) {
			currentLine = currentLine ? `${currentLine} ${word}` : word;
		} else {
			if (currentLine) {
				lines.push(currentLine);
			}
			currentLine = word;
		}
	}

	if (currentLine) {
		lines.push(currentLine);
	}

	return lines;
}

/**
 * Format type name to PascalCase
 */
function formatTypeName(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}
