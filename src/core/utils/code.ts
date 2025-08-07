/**
 * Code Generation Utilities
 *
 * Helper functions for generating clean TypeScript code
 */

/**
 * Format a multi-line string with proper indentation
 */
export function formatMultiline(text: string, indent = 0): string {
	const indentStr = " ".repeat(indent);
	return text
		.split("\n")
		.map((line) => (line.trim() ? indentStr + line : ""))
		.join("\n");
}

/**
 * Generate a JSDoc comment block
 */
export function generateJSDoc(
	description?: string,
	tags?: Record<string, string>,
): string[] {
	const lines: string[] = ["/**"];

	if (description) {
		const descLines = description.split("\n");
		descLines.forEach((line) => {
			lines.push(` * ${line}`);
		});
	}

	if (tags) {
		if (description) {
			lines.push(" *");
		}

		Object.entries(tags).forEach(([tag, value]) => {
			lines.push(` * @${tag} ${value}`);
		});
	}

	lines.push(" */");
	return lines;
}

/**
 * Escape a string for use in a TypeScript string literal
 */
export function escapeString(str: string): string {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r")
		.replace(/\t/g, "\\t");
}

/**
 * Generate a TypeScript union type from an array of strings
 */
export function generateUnionType(values: string[]): string {
	if (values.length === 0) {
		return "never";
	}

	if (values.length === 1) {
		return `'${escapeString(values[0])}'`;
	}

	return values.map((v) => `'${escapeString(v)}'`).join(" | ");
}

/**
 * Generate a TypeScript enum
 */
export function generateEnum(name: string, values: string[]): string[] {
	const lines: string[] = [`export enum ${name} {`];

	values.forEach((value, index) => {
		const enumKey = toEnumKey(value);
		const comma = index < values.length - 1 ? "," : "";
		lines.push(`  ${enumKey} = '${escapeString(value)}'${comma}`);
	});

	lines.push("}");
	return lines;
}

/**
 * Convert a string to a valid enum key
 */
export function toEnumKey(value: string): string {
	let key = value
		.replace(/[^a-zA-Z0-9]/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_|_$/g, "");

	// Ensure it doesn't start with a digit
	if (/^\d/.test(key)) {
		key = `_${key}`;
	}

	return key.toUpperCase();
}

/**
 * Generate TypeScript interface fields
 */
export function generateInterfaceField(
	name: string,
	type: string,
	required: boolean,
	description?: string,
): string[] {
	const lines: string[] = [];

	if (description) {
		lines.push(...generateJSDoc(description));
	}

	const fieldName = required ? name : `${name}?`;
	lines.push(`${fieldName}: ${type};`);

	return lines;
}

/**
 * Check if a type name needs import
 */
export function needsImport(typeName: string): boolean {
	// Built-in TypeScript types don't need imports
	const builtInTypes = [
		"string",
		"number",
		"boolean",
		"any",
		"unknown",
		"never",
		"void",
		"null",
		"undefined",
		"object",
		"Object",
		"Promise",
	];

	// Array is built-in but might be used as Array<T>, so we handle it separately
	if (typeName === "Array") return false;

	return (
		!builtInTypes.includes(typeName) &&
		!typeName.includes("|") &&
		!typeName.includes("<")
	);
}

/**
 * Extract type names from a complex type string
 */
export function extractTypeNames(typeStr: string): string[] {
	const types = new Set<string>();

	// Remove generics and extract base types
	const matches = typeStr.matchAll(/([A-Z][a-zA-Z0-9]*)/g);
	for (const match of matches) {
		const typeName = match[1];
		// Special handling for Array since it's a built-in generic type
		if (typeName === "Array") {
			continue; // Skip Array as it's built-in
		}
		if (needsImport(typeName)) {
			types.add(typeName);
		}
	}

	return Array.from(types);
}

/**
 * Generate a type alias
 */
export function generateTypeAlias(
	name: string,
	type: string,
	description?: string,
): string[] {
	const lines: string[] = [];

	if (description) {
		lines.push(...generateJSDoc(description));
	}

	lines.push(`export type ${name} = ${type};`);

	return lines;
}

/**
 * Generate a const assertion
 */
export function generateConstAssertion(name: string, value: any): string[] {
	const lines: string[] = [];

	lines.push(
		`export const ${name} = ${JSON.stringify(value, null, 2)} as const;`,
	);

	return lines;
}

/**
 * Clean up generated code
 */
export function cleanupCode(code: string): string {
	return (
		code
			// Remove multiple blank lines
			.replace(/\n{3,}/g, "\n\n")
			// Ensure file ends with newline
			.replace(/[^\n]$/, "$&\n")
			// Remove trailing whitespace
			.replace(/ +$/gm, "")
	);
}
