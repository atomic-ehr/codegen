/**
 * FHIR Complex Type Utilities
 *
 * Handles FHIR complex types like Identifier, CodeableConcept, Quantity, etc.
 * Provides utilities for processing and generating complex FHIR data types.
 */

import type {
	AnyTypeSchema,
	TypeSchemaField,
} from "../../typeschema/lib-types";
import { isFHIRComplexType } from "./types";

/**
 * Common FHIR complex type definitions
 */
export const FHIR_COMPLEX_TYPES = {
	// Core data types
	Extension: "Extension",
	Identifier: "Identifier",
	HumanName: "HumanName",
	Address: "Address",
	ContactPoint: "ContactPoint",

	// Coded data types
	CodeableConcept: "CodeableConcept",
	Coding: "Coding",

	// Quantity and range types
	Quantity: "Quantity",
	SimpleQuantity: "SimpleQuantity",
	Money: "Money",
	Range: "Range",
	Ratio: "Ratio",
	SampledData: "SampledData",

	// Time-related types
	Period: "Period",
	Timing: "Timing",
	Duration: "Duration",
	Age: "Age",
	Count: "Count",
	Distance: "Distance",

	// Reference and attachment types
	Reference: "Reference",
	Attachment: "Attachment",
	Signature: "Signature",

	// Administrative types
	Meta: "Meta",

	// Special types
	Narrative: "Narrative",
	Annotation: "Annotation",

	// Measurement types
	TriggerDefinition: "TriggerDefinition",
	DataRequirement: "DataRequirement",
	ParameterDefinition: "ParameterDefinition",
	RelatedArtifact: "RelatedArtifact",
	UsageContext: "UsageContext",
	ContactDetail: "ContactDetail",
	Contributor: "Contributor",

	// Expression and dosage
	Expression: "Expression",
	Dosage: "Dosage",
} as const;

/**
 * Complex types that contain choice elements (polymorphic)
 */
export const CHOICE_ELEMENT_COMPLEX_TYPES = new Set([
	"Extension",
	"TriggerDefinition",
	"DataRequirement",
	"ParameterDefinition",
	"UsageContext",
	"Expression",
]);

/**
 * Get TypeScript interface name for a FHIR complex type
 */
export function getInterfaceNameForComplexType(complexType: string): string {
	// Ensure proper casing for TypeScript interfaces
	return complexType.charAt(0).toUpperCase() + complexType.slice(1);
}

/**
 * Check if a complex type contains choice elements
 */
export function hasChoiceElements(complexType: string): boolean {
	return CHOICE_ELEMENT_COMPLEX_TYPES.has(complexType);
}

/**
 * Generate TypeScript interface for a FHIR complex type
 */
export function generateComplexTypeInterface(
	complexType: string,
	fields: Record<string, TypeSchemaField>,
	schemas: AnyTypeSchema[],
): string {
	if (!isFHIRComplexType(complexType, schemas)) {
		throw new Error(`Unknown FHIR complex type: ${complexType}`);
	}

	const interfaceName = getInterfaceNameForComplexType(complexType);
	const description = getComplexTypeDescription(complexType);

	const fieldLines = Object.entries(fields).map(([fieldName, field]) => {
		const fieldType = generateFieldType(field, schemas);
		const optional = field.required === false ? "?" : "";
		const comment = field.description ? ` /** ${field.description} */\n  ` : "";

		return `${comment}${fieldName}${optional}: ${fieldType};`;
	});

	return `/**
 * ${description}
 */
export interface ${interfaceName} {
  ${fieldLines.join("\n  ")}
}`;
}

/**
 * Generate TypeScript type for a field
 */
function generateFieldType(
	field: TypeSchemaField,
	schemas: AnyTypeSchema[],
): string {
	// Handle choice types (e.g., value[x])
	if ("choices" in field && field.choices) {
		const choiceTypes = field.choices.map((choice) =>
			getTypeScriptTypeForField(choice, schemas),
		);
		return choiceTypes.join(" | ");
	}

	// Handle arrays
	if (field.array) {
		const baseType = getTypeScriptTypeForField(field.type || "string", schemas);
		return `${baseType}[]`;
	}

	// Handle regular fields
	return getTypeScriptTypeForField(field.type || "string", schemas);
}

/**
 * Get TypeScript type for a field type
 */
function getTypeScriptTypeForField(
	fieldType: string,
	_schemas: AnyTypeSchema[],
): string {
	// Check if it's a known primitive
	const primitiveMapping: Record<string, string> = {
		string: "string",
		boolean: "boolean",
		integer: "number",
		decimal: "number",
		date: "string",
		dateTime: "string",
		time: "string",
		instant: "string",
		uri: "string",
		url: "string",
		canonical: "string",
		id: "string",
		oid: "string",
		uuid: "string",
		markdown: "string",
		code: "string",
		base64Binary: "string",
		unsignedInt: "number",
		positiveInt: "number",
		xhtml: "string",
	};

	if (primitiveMapping[fieldType]) {
		return primitiveMapping[fieldType];
	}

	// For complex types and resources, use the type name as-is
	return fieldType;
}

/**
 * Get description for a FHIR complex type
 */
function getComplexTypeDescription(complexType: string): string {
	const descriptions: Record<string, string> = {
		Extension: "FHIR Extension - adds additional information to any element",
		Identifier:
			"FHIR Identifier - unique identifier for resources and elements",
		HumanName: "FHIR HumanName - human name with parts and use codes",
		Address: "FHIR Address - postal address information",
		ContactPoint:
			"FHIR ContactPoint - contact information (phone, email, etc.)",
		CodeableConcept:
			"FHIR CodeableConcept - concept with multiple codings and text",
		Coding: "FHIR Coding - single code from a code system",
		Quantity: "FHIR Quantity - measured amount with units",
		SimpleQuantity: "FHIR SimpleQuantity - quantity without comparator",
		Money: "FHIR Money - monetary amount with currency",
		Range: "FHIR Range - set of values bounded by low and high",
		Ratio: "FHIR Ratio - relationship between two quantities",
		SampledData: "FHIR SampledData - series of measurements over time",
		Period: "FHIR Period - time period with start and end",
		Timing: "FHIR Timing - specification for repeated events",
		Duration: "FHIR Duration - length of time",
		Age: "FHIR Age - age measurement",
		Count: "FHIR Count - whole number count",
		Distance: "FHIR Distance - distance measurement",
		Reference: "FHIR Reference - reference to another resource",
		Attachment: "FHIR Attachment - binary content or reference",
		Signature: "FHIR Signature - digital signature",
		Meta: "FHIR Meta - metadata about a resource",
		Narrative: "FHIR Narrative - human-readable text summary",
		Annotation: "FHIR Annotation - text note with author and time",
		TriggerDefinition:
			"FHIR TriggerDefinition - description of triggering event",
		DataRequirement: "FHIR DataRequirement - description of required data",
		ParameterDefinition:
			"FHIR ParameterDefinition - definition of operation parameter",
		RelatedArtifact: "FHIR RelatedArtifact - reference to related artifact",
		UsageContext: "FHIR UsageContext - context of use for an artifact",
		ContactDetail: "FHIR ContactDetail - contact information",
		Contributor: "FHIR Contributor - information about contributor",
		Expression: "FHIR Expression - computable expression",
		Dosage: "FHIR Dosage - medication dosage instructions",
	};

	return descriptions[complexType] || `FHIR ${complexType} complex type`;
}

/**
 * Check if a complex type is a reference type
 */
export function isReferenceType(complexType: string): boolean {
	return complexType === "Reference";
}

/**
 * Check if a complex type is a coded type
 */
export function isCodedType(complexType: string): boolean {
	const codedTypes = new Set(["CodeableConcept", "Coding", "code"]);
	return codedTypes.has(complexType);
}

/**
 * Check if a complex type is a quantity type
 */
export function isQuantityType(complexType: string): boolean {
	const quantityTypes = new Set([
		"Quantity",
		"SimpleQuantity",
		"Money",
		"Range",
		"Ratio",
		"Duration",
		"Age",
		"Count",
		"Distance",
	]);
	return quantityTypes.has(complexType);
}

/**
 * Check if a complex type is a temporal type
 */
export function isTemporalType(complexType: string): boolean {
	const temporalTypes = new Set([
		"Period",
		"Timing",
		"Duration",
		"Age",
		"instant",
		"dateTime",
		"date",
		"time",
	]);
	return temporalTypes.has(complexType);
}

/**
 * Get required fields for a complex type
 */
export function getRequiredFieldsForComplexType(complexType: string): string[] {
	const requiredFields: Record<string, string[]> = {
		Identifier: [],
		HumanName: [],
		Address: [],
		ContactPoint: [],
		CodeableConcept: [],
		Coding: ["system", "code"],
		Quantity: [],
		Reference: [],
		Period: [],
		Timing: [],
		Extension: ["url"],
		Meta: [],
		Narrative: ["status", "div"],
	};

	return requiredFields[complexType] || [];
}

/**
 * Get all available FHIR complex types
 */
export function getAllFHIRComplexTypes(): string[] {
	return Object.keys(FHIR_COMPLEX_TYPES);
}

/**
 * Validate complex type structure
 */
export function validateComplexTypeStructure(
	complexType: string,
	value: any,
): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!value || typeof value !== "object") {
		errors.push(`Expected object for complex type ${complexType}`);
		return { valid: false, errors };
	}

	const requiredFields = getRequiredFieldsForComplexType(complexType);
	for (const field of requiredFields) {
		if (
			!(field in value) ||
			value[field] === null ||
			value[field] === undefined
		) {
			errors.push(`Required field '${field}' is missing from ${complexType}`);
		}
	}

	// Specific validation for common types
	switch (complexType) {
		case "Coding":
			if (value.system && typeof value.system !== "string") {
				errors.push("Coding.system must be a string");
			}
			if (value.code && typeof value.code !== "string") {
				errors.push("Coding.code must be a string");
			}
			break;

		case "Reference":
			if (value.reference && typeof value.reference !== "string") {
				errors.push("Reference.reference must be a string");
			}
			if (value.identifier && typeof value.identifier !== "object") {
				errors.push("Reference.identifier must be an Identifier object");
			}
			break;
	}

	return { valid: errors.length === 0, errors };
}
