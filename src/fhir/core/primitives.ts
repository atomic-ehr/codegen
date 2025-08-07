/**
 * FHIR Primitive Type Utilities
 *
 * Handles FHIR primitive types, validation, and conversion utilities.
 * Provides type-safe handling of FHIR primitives like id, uri, date, etc.
 */

import type { AnyTypeSchema } from "../../typeschema/lib-types";
import { isFHIRPrimitiveType } from "./types";

/**
 * FHIR primitive type definitions
 */
export const FHIR_PRIMITIVE_TYPES = {
	// Basic types
	boolean: "boolean",
	integer: "number",
	integer64: "bigint",
	decimal: "number",
	string: "string",

	// Date/Time types
	date: "string", // YYYY-MM-DD
	dateTime: "string", // YYYY-MM-DDTHH:mm:ss[.sss][Z|(+|-)HH:mm]
	time: "string", // HH:mm:ss[.sss]
	instant: "string", // YYYY-MM-DDTHH:mm:ss[.sss]Z

	// URI types
	uri: "string",
	url: "string",
	canonical: "string",

	// Identifier types
	id: "string", // [A-Za-z0-9\-\.]{1,64}
	oid: "string", // urn:oid:[0-2](\.(0|[1-9][0-9]*))*
	uuid: "string", // urn:uuid:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX

	// Text types
	markdown: "string",
	code: "string",

	// Binary types
	base64Binary: "string",

	// Numeric types
	unsignedInt: "number", // >= 0
	positiveInt: "number", // > 0

	// Markup
	xhtml: "string", // XHTML fragment
} as const;

/**
 * Get TypeScript type for a FHIR primitive
 */
export function getTypeScriptTypeForPrimitive(primitiveType: string): string {
	return (
		FHIR_PRIMITIVE_TYPES[primitiveType as keyof typeof FHIR_PRIMITIVE_TYPES] ||
		"string"
	);
}

/**
 * Check if a type name represents a FHIR primitive
 */
export function isPrimitiveFHIRType(typeName: string): boolean {
	return typeName in FHIR_PRIMITIVE_TYPES;
}

/**
 * Validate FHIR primitive value format
 */
export function validatePrimitiveValue(
	type: string,
	value: any,
): { valid: boolean; error?: string } {
	if (value === null || value === undefined) {
		return { valid: true }; // FHIR allows null/undefined for optional elements
	}

	switch (type) {
		case "boolean":
			if (typeof value !== "boolean") {
				return { valid: false, error: "Expected boolean value" };
			}
			break;

		case "integer":
		case "unsignedInt":
		case "positiveInt":
			if (!Number.isInteger(value)) {
				return { valid: false, error: "Expected integer value" };
			}
			if (type === "unsignedInt" && value < 0) {
				return { valid: false, error: "Expected non-negative integer" };
			}
			if (type === "positiveInt" && value <= 0) {
				return { valid: false, error: "Expected positive integer" };
			}
			break;

		case "decimal":
			if (typeof value !== "number") {
				return { valid: false, error: "Expected number value" };
			}
			break;

		case "date":
			if (!isValidFHIRDate(value)) {
				return {
					valid: false,
					error: "Invalid FHIR date format (expected YYYY-MM-DD)",
				};
			}
			break;

		case "dateTime":
			if (!isValidFHIRDateTime(value)) {
				return { valid: false, error: "Invalid FHIR dateTime format" };
			}
			break;

		case "time":
			if (!isValidFHIRTime(value)) {
				return {
					valid: false,
					error: "Invalid FHIR time format (expected HH:mm:ss)",
				};
			}
			break;

		case "instant":
			if (!isValidFHIRInstant(value)) {
				return { valid: false, error: "Invalid FHIR instant format" };
			}
			break;

		case "id":
			if (!isValidFHIRId(value)) {
				return { valid: false, error: "Invalid FHIR id format" };
			}
			break;

		case "uri":
		case "url":
		case "canonical":
			if (!isValidURI(value)) {
				return { valid: false, error: "Invalid URI format" };
			}
			break;

		case "oid":
			if (!isValidOID(value)) {
				return { valid: false, error: "Invalid OID format" };
			}
			break;

		case "uuid":
			if (!isValidUUID(value)) {
				return { valid: false, error: "Invalid UUID format" };
			}
			break;

		default:
			if (typeof value !== "string") {
				return { valid: false, error: "Expected string value" };
			}
	}

	return { valid: true };
}

/**
 * Validate FHIR date format (YYYY-MM-DD)
 */
function isValidFHIRDate(value: string): boolean {
	const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
	if (!dateRegex.test(value)) return false;

	const date = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Validate FHIR dateTime format
 */
function isValidFHIRDateTime(value: string): boolean {
	const dateTimeRegex =
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
	if (!dateTimeRegex.test(value)) return false;

	const date = new Date(value);
	return !Number.isNaN(date.getTime());
}

/**
 * Validate FHIR time format (HH:mm:ss)
 */
function isValidFHIRTime(value: string): boolean {
	const timeRegex = /^\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/;
	return timeRegex.test(value);
}

/**
 * Validate FHIR instant format
 */
function isValidFHIRInstant(value: string): boolean {
	const instantRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
	if (!instantRegex.test(value)) return false;

	const date = new Date(value);
	return !Number.isNaN(date.getTime());
}

/**
 * Validate FHIR id format
 */
function isValidFHIRId(value: string): boolean {
	const idRegex = /^[A-Za-z0-9\-.]{1,64}$/;
	return idRegex.test(value);
}

/**
 * Validate URI format (basic validation)
 */
function isValidURI(value: string): boolean {
	try {
		new URL(value);
		return true;
	} catch {
		// Allow relative URIs and URNs
		const uriRegex =
			/^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/|^[a-zA-Z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/;
		return uriRegex.test(value);
	}
}

/**
 * Validate OID format
 */
function isValidOID(value: string): boolean {
	const oidRegex = /^urn:oid:[0-2](\.(0|[1-9][0-9]*))*$/;
	return oidRegex.test(value);
}

/**
 * Validate UUID format
 */
function isValidUUID(value: string): boolean {
	const uuidRegex =
		/^urn:uuid:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
	return uuidRegex.test(value);
}

/**
 * Convert primitive value to appropriate TypeScript type
 */
export function convertPrimitiveValue(type: string, value: string): any {
	switch (type) {
		case "boolean":
			return value === "true";
		case "integer":
		case "unsignedInt":
		case "positiveInt":
			return parseInt(value, 10);
		case "integer64":
			return BigInt(value);
		case "decimal":
			return parseFloat(value);
		default:
			return value;
	}
}

/**
 * Generate TypeScript primitive type definition
 */
export function generatePrimitiveTypeDefinition(
	primitiveType: string,
	schemas: AnyTypeSchema[],
): string {
	if (!isFHIRPrimitiveType(primitiveType, schemas)) {
		throw new Error(`Unknown FHIR primitive type: ${primitiveType}`);
	}

	const tsType = getTypeScriptTypeForPrimitive(primitiveType);
	const description = getPrimitiveTypeDescription(primitiveType);

	return `/**
 * ${description}
 */
export type ${primitiveType} = ${tsType};`;
}

/**
 * Get description for a FHIR primitive type
 */
function getPrimitiveTypeDescription(primitiveType: string): string {
	const descriptions: Record<string, string> = {
		boolean: "FHIR boolean type - true or false",
		integer: "FHIR integer type - whole number",
		integer64: "FHIR 64-bit integer type - large whole number",
		decimal: "FHIR decimal type - decimal number",
		string: "FHIR string type - sequence of Unicode characters",
		date: "FHIR date type - YYYY-MM-DD format",
		dateTime: "FHIR dateTime type - date and time with optional timezone",
		time: "FHIR time type - HH:mm:ss format",
		instant: "FHIR instant type - precise datetime with required timezone",
		uri: "FHIR URI type - uniform resource identifier",
		url: "FHIR URL type - uniform resource locator",
		canonical: "FHIR canonical type - canonical reference to a resource",
		id: "FHIR id type - unique identifier within resource",
		oid: "FHIR OID type - ISO object identifier",
		uuid: "FHIR UUID type - universally unique identifier",
		markdown: "FHIR markdown type - markdown formatted text",
		code: "FHIR code type - symbol from a defined code system",
		base64Binary: "FHIR base64Binary type - base64 encoded binary data",
		unsignedInt: "FHIR unsignedInt type - non-negative integer",
		positiveInt: "FHIR positiveInt type - positive integer",
		xhtml: "FHIR xhtml type - XHTML fragment",
	};

	return descriptions[primitiveType] || `FHIR ${primitiveType} type`;
}

/**
 * Get all available FHIR primitive types
 */
export function getAllFHIRPrimitiveTypes(): string[] {
	return Object.keys(FHIR_PRIMITIVE_TYPES);
}
