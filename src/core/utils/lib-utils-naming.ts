/**
 * Naming Utilities
 *
 * Helper functions for converting various string formats to valid TypeScript identifiers
 */

/**
 * Convert a string to a valid TypeScript interface name
 *
 * Rules:
 * - Remove or replace invalid characters
 * - Ensure it starts with a letter
 * - Convert to PascalCase
 * - Handle common patterns like dashes, spaces, dots, etc.
 *
 * @param name - The original name to convert
 * @returns Valid TypeScript interface name
 */
export function toValidInterfaceName(name: string): string {
	if (!name || !name.trim()) return "Unknown";

	// Step 1: Replace separators with spaces and split into words
	const normalized = name
		.replace(/[^a-zA-Z0-9]/g, " ") // Replace non-alphanumeric with spaces
		.replace(/([a-z])([A-Z])/g, "$1 $2") // Split camelCase: "careOf" -> "care Of"
		.trim();

	if (!normalized) return "Unknown";

	// Step 2: Split into words and process each word
	const words = normalized.split(/\s+/).filter((word) => word.length > 0);

	if (words.length === 0) return "Unknown";

	// Step 3: Process each word
	const result = words
		.map((word) => {
			// Preserve all-uppercase words (likely acronyms)
			if (word === word.toUpperCase() && word.length > 1) {
				return word;
			}

			// Standard PascalCase: first letter uppercase, rest lowercase
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join("");

	// Step 4: Ensure it starts with a valid character
	if (!/^[a-zA-Z_$]/.test(result)) {
		return "I" + result;
	}

	return result;
}

/**
 * Convert a string to a valid file name (kebab-case)
 *
 * @param name - The original name to convert
 * @returns Valid file name in kebab-case
 */
export function toValidFileName(name: string): string {
	if (!name) return "unknown";

	return (
		name
			// Replace spaces and underscores with dashes
			.replace(/[\s_]/g, "-")
			// Remove or replace invalid file name characters
			.replace(/[^a-zA-Z0-9\-.]/g, "")
			// Convert to lowercase
			.toLowerCase()
			// Replace multiple dashes with single dash
			.replace(/-+/g, "-")
			// Remove leading/trailing dashes
			.replace(/^-|-$/g, "") ||
		// Fallback for empty results
		"unknown"
	);
}

/**
 * Convert a string to camelCase
 *
 * @param name - The original name to convert
 * @returns Valid camelCase identifier
 */
export function toCamelCase(name: string): string {
	const pascalCase = toValidInterfaceName(name);
	if (!pascalCase) return "unknown";

	// Convert first letter to lowercase
	return pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1);
}

/**
 * Convert a string to snake_case
 *
 * @param name - The original name to convert
 * @returns Valid snake_case identifier
 */
export function toSnakeCase(name: string): string {
	if (!name) return "unknown";

	return (
		name
			// Insert underscore before uppercase letters (except at start)
			.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
			// Replace spaces and dashes with underscores
			.replace(/[\s-]/g, "_")
			// Remove invalid characters
			.replace(/[^a-zA-Z0-9_]/g, "")
			// Convert to lowercase
			.toLowerCase()
			// Replace multiple underscores with single underscore
			.replace(/_+/g, "_")
			// Remove leading/trailing underscores
			.replace(/^_|_$/g, "") ||
		// Fallback for empty results
		"unknown"
	);
}

/**
 * Test cases for validation
 */
export const testCases = {
	"ADXP-careOf": "ADXPCareOf",
	"AD-use": "ADUse",
	"Actual Group": "ActualGroup",
	"activity-title": "ActivityTitle",
	"observation-bp": "ObservationBp",
	"us-core-patient": "USCorePatient",
	"ISO21090-ADXP-careOf": "ISO21090ADXPCareOf",
	"some.dotted.name": "SomeDottedName",
	"mixed_underscore-dash name": "MixedUnderscoreDashName",
	"123invalid": "I123invalid",
	"": "Unknown",
	valid: "Valid",
	ValidAlready: "ValidAlready",
};
