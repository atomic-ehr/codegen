/**
 * Naming Convention Utilities
 *
 * Provides consistent naming conventions for generated types
 */

/**
 * Convert a FHIR type name to a valid TypeScript identifier
 */
export function toTypeScriptIdentifier(name: string): string {
	// Handle special cases
	if (name.startsWith("_")) {
		const rest = name.substring(1);
		return `Element${rest.charAt(0).toUpperCase()}${rest.slice(1)}`;
	}

	// Ensure first character is uppercase
	return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Convert a field name to a valid TypeScript property name
 */
export function toPropertyName(name: string): string {
	// Handle extension arrays
	if (name === "extension") {
		return "extension";
	}

	// Handle underscore prefixed fields (primitives)
	if (name.startsWith("_")) {
		return `_${name.substring(1)}`;
	}

	return name;
}

/**
 * Get the TypeScript type for a Reference field
 */
export function getReferenceType(targetTypes: string[]): string {
	if (targetTypes.length === 0) {
		return "Reference";
	}

	const types = targetTypes.map(
		(t) => `Reference<${toTypeScriptIdentifier(t)}>`,
	);
	return types.join(" | ");
}

/**
 * Convert a choice field name to its base name
 * e.g., "valueString" -> "value"
 */
export function getChoiceBaseName(fieldName: string): string {
	// Common choice patterns - order matters! More specific patterns first
	const patterns = [
		/^(.+)(DateTime|Base64Binary|CodeableConcept|BackboneElement|ContactPoint|SampledData|HumanName|PositiveInt|UnsignedInt)$/,
		/^(.+)(Boolean|Integer|Decimal|String|Uri|Url|Canonical|Code|Id|Oid|Uuid|Instant|Date|Time|Markdown)$/,
		/^(.+)(Coding|Quantity|Range|Period|Ratio|Identifier|Address|Timing|Reference|Meta|Narrative|Extension|Element)$/,
	];

	for (const pattern of patterns) {
		const match = fieldName.match(pattern);
		if (match) {
			return match[1];
		}
	}

	return fieldName;
}

/**
 * Check if a field name is a choice type
 */
export function isChoiceField(fieldName: string): boolean {
	return (
		fieldName.includes("[x]") || getChoiceBaseName(fieldName) !== fieldName
	);
}

/**
 * Get the module name for a type
 */
export function getModuleName(typeName: string): string {
	// Primitive types
	const primitives = [
		"boolean",
		"integer",
		"string",
		"decimal",
		"uri",
		"url",
		"canonical",
		"uuid",
		"id",
		"oid",
		"unsignedInt",
		"positiveInt",
		"markdown",
		"time",
		"date",
		"dateTime",
		"instant",
		"base64Binary",
		"code",
		"xhtml",
	];

	if (primitives.includes(typeName)) {
		return "primitives";
	}

	// Complex types
	const complexTypes = [
		"Element",
		"BackboneElement",
		"Extension",
		"Narrative",
		"Reference",
		"CodeableConcept",
		"Coding",
		"Quantity",
		"Range",
		"Period",
		"Ratio",
		"SampledData",
		"Identifier",
		"HumanName",
		"Address",
		"ContactPoint",
		"Timing",
		"Meta",
		"Attachment",
		"Duration",
		"Distance",
		"Count",
		"Money",
		"Age",
		"SimpleQuantity",
		"ContactDetail",
		"Contributor",
		"DataRequirement",
		"ParameterDefinition",
		"RelatedArtifact",
		"TriggerDefinition",
		"UsageContext",
		"Dosage",
		"Population",
	];

	if (complexTypes.includes(typeName)) {
		return "complex";
	}

	// Default to resources
	return "resources";
}

/**
 * Generate import statement for a type
 */
export function generateImport(typeName: string, _fromModule: string): string {
	const module = getModuleName(typeName);

	if (module === "primitives") {
		return `import * as primitives from '../types/primitives';`;
	} else if (module === "complex") {
		return `import * as complex from '../types/complex';`;
	} else {
		return `import { ${typeName} } from './${typeName}';`;
	}
}

/**
 * Sort imports for consistent output
 */
export function sortImports(imports: string[]): string[] {
	return imports.sort((a, b) => {
		// Primitives first
		if (a.includes("primitives") && !b.includes("primitives")) return -1;
		if (!a.includes("primitives") && b.includes("primitives")) return 1;

		// Then complex
		if (a.includes("complex") && !b.includes("complex")) return -1;
		if (!a.includes("complex") && b.includes("complex")) return 1;

		// Then alphabetical
		return a.localeCompare(b);
	});
}
