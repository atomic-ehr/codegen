/**
 * FHIR CodeSystem Type Generation
 *
 * Handles generation of TypeScript types for FHIR CodeSystems.
 * CodeSystems define the actual codes that can be used in FHIR elements,
 * requiring specialized handling for hierarchical concept definitions and constants.
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { buildSchemaIdentifier } from "../typeschema/core/identifier";
import type { AnyTypeSchema, TypeSchema } from "../typeschema/lib-types";
import type {
	CodeSystemConcept,
	CodeSystemInfo,
	FHIRGenerationContext,
	GenerationWarning,
} from "./types";

/**
 * Generate TypeSchema for FHIR CodeSystems
 */
export async function generateCodeSystemTypes(
	schemas: FHIRSchema[],
	context: FHIRGenerationContext,
): Promise<AnyTypeSchema[]> {
	const results: AnyTypeSchema[] = [];

	for (const schema of schemas) {
		try {
			const codeSystemResult = await generateCodeSystemType(schema, context);
			if (codeSystemResult) {
				results.push(codeSystemResult);
			}
		} catch (error) {
			addCodeSystemGenerationWarning(context, schema, error as Error);
		}
	}

	return results;
}

/**
 * Generate TypeSchema for a single FHIR CodeSystem
 */
export async function generateCodeSystemType(
	schema: FHIRSchema,
	context: FHIRGenerationContext,
): Promise<TypeSchema | null> {
	// Prevent infinite recursion
	if (context.depth > context.options.maxDepth) {
		addCodeSystemGenerationWarning(
			context,
			schema,
			new Error("Maximum recursion depth reached"),
		);
		return null;
	}

	const codeSystemInfo = extractCodeSystemInfo(schema);
	if (!codeSystemInfo) {
		addCodeSystemGenerationWarning(
			context,
			schema,
			new Error("Could not extract CodeSystem information"),
		);
		return null;
	}

	const identifier = buildSchemaIdentifier(schema, context.packageInfo);
	identifier.kind = "complex-type"; // CodeSystems are treated as complex types in TypeSchema

	const codeSystemSchema: TypeSchema = {
		identifier,
		description: schema.description,
		dependencies: [],
		metadata: {
			isCodeSystem: true,
			codeSystemUrl: codeSystemInfo.url,
			status: codeSystemInfo.status,
			content: codeSystemInfo.content,
			conceptCount: codeSystemInfo.concept?.length || 0,
		},
	};

	// Generate constant fields for each concept
	if (codeSystemInfo.concept && codeSystemInfo.concept.length > 0) {
		const fields = generateCodeSystemFields(codeSystemInfo.concept);
		if (Object.keys(fields).length > 0) {
			codeSystemSchema.fields = fields;
		}
	}

	return codeSystemSchema;
}

/**
 * Extract CodeSystem information from FHIR schema
 */
function extractCodeSystemInfo(schema: FHIRSchema): CodeSystemInfo | null {
	// Check if this is actually a CodeSystem
	if (schema.name !== "CodeSystem" && schema.type !== "CodeSystem") {
		return null;
	}

	const info: CodeSystemInfo = {
		url: schema.url || "",
		name: schema.name || "",
		status: "active", // default
		content: "not-present", // default
	};

	// Extract from resource content if available
	if (schema.content) {
		const content =
			typeof schema.content === "string"
				? JSON.parse(schema.content)
				: schema.content;

		if (content.resourceType === "CodeSystem") {
			info.status = content.status || "active";
			info.content = content.content || "not-present";

			// Extract concepts
			if (content.concept && Array.isArray(content.concept)) {
				info.concept = processConcepts(content.concept);
			}
		}
	}

	// Extract from elements if no content available
	if (!info.concept && schema.elements) {
		info.concept = extractConceptsFromElements(schema.elements);
	}

	return info;
}

/**
 * Process CodeSystem concepts recursively
 */
function processConcepts(concepts: any[]): CodeSystemConcept[] {
	return concepts.map((concept) => {
		const result: CodeSystemConcept = {
			code: concept.code,
			display: concept.display,
			definition: concept.definition,
		};

		// Process nested concepts recursively
		if (concept.concept && Array.isArray(concept.concept)) {
			result.concept = processConcepts(concept.concept);
		}

		return result;
	});
}

/**
 * Extract concepts from elements (fallback method)
 */
function extractConceptsFromElements(
	elements: Record<string, any>,
): CodeSystemConcept[] {
	const concepts: CodeSystemConcept[] = [];

	// Look for concept-related elements
	for (const [path, element] of Object.entries(elements)) {
		if (path.includes("concept")) {
			const concept = extractConceptFromElement(path, element);
			if (concept) {
				concepts.push(concept);
			}
		}
	}

	return concepts;
}

/**
 * Extract concept from element definition
 */
function extractConceptFromElement(
	path: string,
	element: any,
): CodeSystemConcept | null {
	const concept: CodeSystemConcept = {
		code: "",
	};

	if (element.fixedCode) {
		concept.code = element.fixedCode;
	}

	if (element.fixedString) {
		if (path.includes("display")) {
			concept.display = element.fixedString;
		} else if (path.includes("definition")) {
			concept.definition = element.fixedString;
		}
	}

	return concept.code ? concept : null;
}

/**
 * Generate TypeSchema fields for CodeSystem concepts
 */
function generateCodeSystemFields(
	concepts: CodeSystemConcept[],
): Record<string, any> {
	const fields: Record<string, any> = {};

	for (const concept of concepts) {
		// Create a constant field for each concept code
		const fieldName = sanitizeCodeForFieldName(concept.code);

		fields[fieldName] = {
			type: {
				kind: "primitive-type",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "code",
				url: "http://hl7.org/fhir/StructureDefinition/code",
			},
			enum: [concept.code],
			required: true,
			description:
				concept.display || concept.definition || `Code: ${concept.code}`,
		};

		// Process nested concepts recursively
		if (concept.concept) {
			const nestedFields = generateCodeSystemFields(concept.concept);
			for (const [nestedKey, nestedValue] of Object.entries(nestedFields)) {
				const nestedFieldName = `${fieldName}_${nestedKey}`;
				fields[nestedFieldName] = nestedValue;
			}
		}
	}

	return fields;
}

/**
 * Sanitize code for use as a field name
 */
function sanitizeCodeForFieldName(code: string): string {
	// Convert to valid identifier
	let fieldName = code
		.replace(/[^a-zA-Z0-9_]/g, "_") // Replace invalid chars with underscore
		.replace(/^[0-9]/, "_$&") // Prefix with underscore if starts with number
		.replace(/_+/g, "_") // Collapse multiple underscores
		.replace(/^_|_$/g, ""); // Remove leading/trailing underscores

	// Ensure it's not empty
	if (!fieldName) {
		fieldName = "UNKNOWN_CODE";
	}

	// Convert to uppercase for constants
	return fieldName.toUpperCase();
}

/**
 * Generate enumeration values from CodeSystem
 */
export function generateEnumFromCodeSystem(
	concepts: CodeSystemConcept[],
): string[] {
	const enumValues: string[] = [];

	function collectCodes(conceptList: CodeSystemConcept[]) {
		for (const concept of conceptList) {
			enumValues.push(concept.code);

			// Recursively collect from nested concepts
			if (concept.concept) {
				collectCodes(concept.concept);
			}
		}
	}

	collectCodes(concepts);

	// Remove duplicates and sort
	return [...new Set(enumValues)].sort();
}

/**
 * Generate TypeScript constants from CodeSystem
 */
export function generateConstantsFromCodeSystem(
	codeSystemInfo: CodeSystemInfo,
	namePrefix?: string,
): Record<string, string> {
	const constants: Record<string, string> = {};

	if (!codeSystemInfo.concept) {
		return constants;
	}

	function processConceptsForConstants(
		conceptList: CodeSystemConcept[],
		prefix = "",
	) {
		for (const concept of conceptList) {
			const constantName = `${namePrefix || ""}${prefix}${sanitizeCodeForFieldName(concept.code)}`;
			constants[constantName] = concept.code;

			// Process nested concepts with prefix
			if (concept.concept) {
				processConceptsForConstants(
					concept.concept,
					`${prefix}${sanitizeCodeForFieldName(concept.code)}_`,
				);
			}
		}
	}

	processConceptsForConstants(codeSystemInfo.concept);

	return constants;
}

/**
 * Find concept by code in CodeSystem
 */
export function findConceptByCode(
	concepts: CodeSystemConcept[],
	code: string,
): CodeSystemConcept | null {
	for (const concept of concepts) {
		if (concept.code === code) {
			return concept;
		}

		// Search in nested concepts
		if (concept.concept) {
			const nested = findConceptByCode(concept.concept, code);
			if (nested) {
				return nested;
			}
		}
	}

	return null;
}

/**
 * Get all concept codes from CodeSystem (flattened)
 */
export function getAllConceptCodes(concepts: CodeSystemConcept[]): string[] {
	const codes: string[] = [];

	function collectCodes(conceptList: CodeSystemConcept[]) {
		for (const concept of conceptList) {
			codes.push(concept.code);

			if (concept.concept) {
				collectCodes(concept.concept);
			}
		}
	}

	collectCodes(concepts);

	return codes;
}

/**
 * Create a CodeSystem concept
 */
export function createCodeSystemConcept(
	code: string,
	display?: string,
	definition?: string,
	nestedConcepts?: CodeSystemConcept[],
): CodeSystemConcept {
	const concept: CodeSystemConcept = { code };

	if (display) concept.display = display;
	if (definition) concept.definition = definition;
	if (nestedConcepts && nestedConcepts.length > 0)
		concept.concept = nestedConcepts;

	return concept;
}

/**
 * Validate CodeSystem concepts
 */
export function validateCodeSystemConcepts(
	concepts: CodeSystemConcept[],
): string[] {
	const errors: string[] = [];
	const seenCodes = new Set<string>();

	function validateConcept(
		concept: CodeSystemConcept,
		path: string,
		depth = 0,
	) {
		// Check required fields
		if (!concept.code) {
			errors.push(`${path}: code is required`);
		} else {
			// Check for duplicate codes at the same level
			const scopedCode = `${depth}:${concept.code}`;
			if (seenCodes.has(scopedCode)) {
				errors.push(
					`${path}: duplicate code '${concept.code}' at depth ${depth}`,
				);
			}
			seenCodes.add(scopedCode);
		}

		// Validate code format (basic validation)
		if (concept.code && !/^[a-zA-Z0-9\-_.]+$/.test(concept.code)) {
			errors.push(
				`${path}: code '${concept.code}' contains invalid characters`,
			);
		}

		// Validate nested concepts
		if (concept.concept) {
			for (let i = 0; i < concept.concept.length; i++) {
				validateConcept(concept.concept[i], `${path}.concept[${i}]`, depth + 1);
			}
		}
	}

	for (let i = 0; i < concepts.length; i++) {
		validateConcept(concepts[i], `concept[${i}]`);
	}

	return errors;
}

/**
 * Add a CodeSystem generation warning
 */
function addCodeSystemGenerationWarning(
	context: FHIRGenerationContext,
	schema: FHIRSchema,
	error: Error,
): void {
	const warning: GenerationWarning = {
		message: `Failed to generate CodeSystem ${schema.name || schema.url}: ${error.message}`,
		path: schema.url,
		code: "CODESYSTEM_GENERATION_ERROR",
		severity: "medium",
	};

	if (context.options.verbose) {
		console.warn(`[FHIR CodeSystems] ${warning.message}`);
	}
}
