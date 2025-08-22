// @ts-nocheck
/**
 * Profile Processor (DEPRECATED - Profiles not in core TypeSchema spec)
 *
 * Handles transformation of FHIR profiles to TypeSchema format
 * This file is deprecated as profiles are not part of the core TypeSchema specification
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { buildSchemaIdentifier } from "../core/identifier.js";
import { transformElements } from "../core/transformer.js";
import type { TypeSchemaIdentifier } from "../type-schema.types.js";
import type {
	PackageInfo,
	ProfileConstraint,
	ProfileExtension,
	ProfileMetadata,
	TypeSchemaForProfile,
	ValidationRule,
} from "../types.js";

/**
 * Transform a FHIR profile to TypeSchema format
 * Profiles are treated as specialized resources that extend base resources
 */
export async function transformProfile(
	fhirSchema: FHIRSchema,
	manager: ReturnType<typeof CanonicalManager>,
	packageInfo?: PackageInfo,
): Promise<TypeSchemaForProfile> {
	// Build profile identifier
	const identifier = buildSchemaIdentifier(fhirSchema, packageInfo);

	// Ensure this is recognized as a profile
	if (identifier.kind !== "profile") {
		throw new Error(
			`Expected profile, got ${identifier.kind} for ${fhirSchema.name}`,
		);
	}

	// Build base identifier - profiles always have a base
	let base: TypeSchemaIdentifier | undefined;
	if (fhirSchema.base) {
		const baseUrl = fhirSchema.base.includes("/")
			? fhirSchema.base
			: `http://hl7.org/fhir/StructureDefinition/${fhirSchema.base}`;
		const baseName = fhirSchema.base.split("/").pop() || fhirSchema.base;

		// Determine base kind - could be another profile or a base resource
		const baseKind = await determineBaseKind(baseUrl, manager);

		// For standard FHIR types, use the standard package
		const isStandardFhir = baseUrl.startsWith("http://hl7.org/fhir/");
		base = {
			kind: baseKind,
			package: isStandardFhir
				? "hl7.fhir.r4.core"
				: packageInfo?.name || fhirSchema.package_name || "undefined",
			version: isStandardFhir
				? "4.0.1"
				: packageInfo?.version || fhirSchema.package_version || "undefined",
			name: baseName,
			url: baseUrl,
		};
	}

	// Initialize the profile schema
	const profileSchema: TypeSchemaForProfile = {
		identifier,
		base: base!,
		dependencies: base ? [base] : [],
	};

	// Add description if present
	if (fhirSchema.description) {
		profileSchema.description = fhirSchema.description;
	}

	// Add profile-specific metadata
	const metadata = extractProfileMetadata(fhirSchema, packageInfo);
	if (Object.keys(metadata).length > 0) {
		profileSchema.metadata = metadata;
	}

	// Process profile fields from differential elements
	if (fhirSchema.elements) {
		const fields = await transformElements(
			fhirSchema,
			[],
			fhirSchema.elements,
			manager,
			packageInfo,
		);
		if (Object.keys(fields).length > 0) {
			profileSchema.fields = fields;
		}
	}

	// Process profile constraints
	const constraints = await processProfileConstraints(fhirSchema, manager);
	if (Object.keys(constraints).length > 0) {
		profileSchema.constraints = constraints;
	}

	// Process extensions
	const extensions = await processProfileExtensions(fhirSchema, manager);
	if (extensions.length > 0) {
		profileSchema.extensions = extensions;
	}

	// Add validation rules
	const validationRules = extractValidationRules(fhirSchema);
	if (validationRules.length > 0) {
		profileSchema.validation = validationRules;
	}

	return profileSchema;
}

/**
 * Determine the kind of the base type for a profile
 */
async function determineBaseKind(
	baseUrl: string,
	manager: ReturnType<typeof CanonicalManager>,
): Promise<TypeSchemaIdentifier["kind"]> {
	try {
		// Try to resolve the base schema
		const baseSchema = await manager.resolve(baseUrl);
		if (baseSchema) {
			// If it's also a constraint, it's likely another profile
			if (baseSchema.derivation === "constraint") {
				return "profile";
			}
			// Otherwise, use the base schema's kind
			if (baseSchema.kind === "resource") return "resource";
			if (baseSchema.kind === "complex-type") return "complex-type";
		}
	} catch (error) {
		// If we can't resolve, make a reasonable guess
		console.warn(`Could not resolve base schema ${baseUrl}:`, error);
	}

	// Check if the URL suggests it's a profile from any implementation guide
	// Non-standard FHIR StructureDefinition URLs (not from base FHIR) are likely profiles

	// Check if it's any other profile URL pattern
	if (
		baseUrl.includes("StructureDefinition/") &&
		!baseUrl.startsWith("http://hl7.org/fhir/StructureDefinition/")
	) {
		// Non-standard FHIR StructureDefinition URLs are likely profiles
		return "profile";
	}

	// Default to resource for profiles
	return "resource";
}

/**
 * Extract profile metadata from FHIR schema
 */
function extractProfileMetadata(
	fhirSchema: FHIRSchema,
	packageInfo?: PackageInfo,
): ProfileMetadata {
	const metadata: ProfileMetadata = {};

	// Add profile-specific metadata
	// @ts-ignore
	if (fhirSchema.publisher) metadata.publisher = fhirSchema.publisher;
	// @ts-ignore
	if (fhirSchema.contact) metadata.contact = fhirSchema.contact;
	// @ts-ignore
	if (fhirSchema.copyright) metadata.copyright = fhirSchema.copyright;
	// @ts-ignore
	if (fhirSchema.purpose) metadata.purpose = fhirSchema.purpose;
	// @ts-ignore
	if (fhirSchema.experimental !== undefined) {
		// @ts-ignore
		metadata.experimental = fhirSchema.experimental;
	}
	// @ts-ignore
	if (fhirSchema.date) metadata.date = fhirSchema.date;
	// @ts-ignore
	if (fhirSchema.jurisdiction) metadata.jurisdiction = fhirSchema.jurisdiction;

	// Add package-specific metadata from packageInfo or schema
	// @ts-ignore
	if (packageInfo?.name) {
		metadata.package = packageInfo.name;
		// @ts-ignore
	} else if (fhirSchema.package_name) {
		// @ts-ignore
		metadata.package = fhirSchema.package_name;
	}

	return metadata;
}

/**
 * Process profile constraints from FHIR schema elements
 */
async function processProfileConstraints(
	fhirSchema: FHIRSchema,
	_manager: ReturnType<typeof CanonicalManager>,
): Promise<Record<string, ProfileConstraint>> {
	const constraints: Record<string, ProfileConstraint> = {};

	if (!fhirSchema.elements) return constraints;

	// Process each element for constraints
	for (const [path, element] of Object.entries(fhirSchema.elements)) {
		const elementConstraints: ProfileConstraint = {};

		// Cardinality constraints
		if (element.min !== undefined) elementConstraints.min = element.min;
		if (element.max !== undefined) elementConstraints.max = String(element.max);

		// Must Support elements
		if (element.mustSupport) elementConstraints.mustSupport = true;

		// Fixed values
		// @ts-ignore
		if (element.fixedValue !== undefined)
			// @ts-ignore
			elementConstraints.fixedValue = element.fixedValue;
		// @ts-ignore
		if (element.patternValue !== undefined)
			// @ts-ignore
			elementConstraints.patternValue = element.patternValue;

		// Value set bindings
		if (element.binding) {
			elementConstraints.binding = {
				strength: element.binding.strength as
					| "required"
					| "extensible"
					| "preferred"
					| "example",
				valueSet: element.binding.valueSet ?? "",
			};
		}

		// Type constraints
		if (
			element.type &&
			Array.isArray(element.type) &&
			element.type.length > 0
		) {
			elementConstraints.types = element.type.map((t: any) => {
				const typeConstraint: any = { code: t.code };
				if (t.profile) typeConstraint.profile = t.profile;
				if (t.targetProfile) typeConstraint.targetProfile = t.targetProfile;
				return typeConstraint;
			});
		}

		// Slicing information
		if (element.slicing) {
			elementConstraints.slicing = {
				discriminator: element.slicing.discriminator ?? [],
				rules: String(element.slicing),
				ordered: element.slicing.ordered,
			};
		}

		if (Object.keys(elementConstraints).length > 0) {
			constraints[path] = elementConstraints;
		}
	}

	return constraints;
}

/**
 * Process profile extensions
 */
async function processProfileExtensions(
	fhirSchema: FHIRSchema,
	_manager: ReturnType<typeof CanonicalManager>,
): Promise<ProfileExtension[]> {
	const extensions: ProfileExtension[] = [];

	if (!fhirSchema.elements) return extensions;

	// Look for extension elements
	for (const [path, element] of Object.entries(fhirSchema.elements)) {
		if (
			path.includes("extension") &&
			element.type &&
			Array.isArray(element.type)
		) {
			for (const type of element.type) {
				if (type.code === "Extension" && type.profile) {
					extensions.push({
						path,
						profile: type.profile,
						min: element.min,
						max: String(element.max),
						mustSupport: element.mustSupport,
					});
				}
			}
		}
	}

	return extensions;
}

/**
 * Extract validation rules from profile
 */
function extractValidationRules(fhirSchema: FHIRSchema): ValidationRule[] {
	const rules: ValidationRule[] = [];

	if (!fhirSchema.elements) return rules;

	// Extract invariants and constraints
	for (const [path, element] of Object.entries(fhirSchema.elements)) {
		if (element.constraint && Array.isArray(element.constraint)) {
			for (const constraint of element.constraint) {
				rules.push({
					path,
					key: constraint.key,
					severity: constraint.severity,
					human: constraint.human,
					expression: constraint.expression,
				});
			}
		}
	}

	return rules;
}
