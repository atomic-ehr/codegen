/**
 * Naming Convention Utilities
 *
 * High-performance utilities for string transformations with full Unicode support
 */

/**
 * Cache for common transformations to improve performance
 */
const transformationCache = new Map<string, string>();

/**
 * Convert string to camelCase
 */
export function toCamelCase(input: string): string {
	const cacheKey = `camel:${input}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!input?.trim()) {
		return "";
	}

	const result = input
		.trim()
		// Split on non-alphanumeric characters and camelCase boundaries
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/\s+/)
		.filter(Boolean)
		.map((word, index) => {
			// First word is lowercase, subsequent words are capitalized
			if (index === 0) {
				return word.toLowerCase();
			}
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join("");

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(input: string): string {
	const cacheKey = `pascal:${input}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!input?.trim()) {
		return "";
	}

	const result = input
		.trim()
		// Split on non-alphanumeric characters and camelCase boundaries
		.replace(/[^a-zA-Z0-9]+/g, " ")
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => {
			// Preserve acronyms (all uppercase words with length > 1)
			if (
				word === word.toUpperCase() &&
				word.length > 1 &&
				/^[A-Z]+$/.test(word)
			) {
				return word;
			}
			return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
		})
		.join("");

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(input: string): string {
	const cacheKey = `snake:${input}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!input?.trim()) {
		return "";
	}

	const result = input
		.trim()
		// Insert underscores before uppercase letters that follow lowercase
		.replace(/([a-z0-9])([A-Z])/g, "$1_$2")
		// Replace non-alphanumeric with underscores
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.toLowerCase()
		// Clean up multiple underscores
		.replace(/_+/g, "_")
		// Remove leading/trailing underscores
		.replace(/^_+|_+$/g, "");

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(input: string): string {
	const cacheKey = `kebab:${input}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!input?.trim()) {
		return "";
	}

	const result = input
		.trim()
		// Insert hyphens before uppercase letters that follow lowercase
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		// Replace non-alphanumeric with hyphens
		.replace(/[^a-zA-Z0-9]+/g, "-")
		.toLowerCase()
		// Clean up multiple hyphens
		.replace(/-+/g, "-")
		// Remove leading/trailing hyphens
		.replace(/^-+|-+$/g, "");

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Convert string to CONSTANT_CASE
 */
export function toConstantCase(input: string): string {
	const cacheKey = `constant:${input}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!input?.trim()) {
		return "";
	}

	const result = toSnakeCase(input).toUpperCase();
	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Convert string to dot.case
 */
export function toDotCase(input: string): string {
	const cacheKey = `dot:${input}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!input?.trim()) {
		return "";
	}

	const result = input
		.trim()
		// Insert dots before uppercase letters that follow lowercase
		.replace(/([a-z0-9])([A-Z])/g, "$1.$2")
		// Replace non-alphanumeric with dots
		.replace(/[^a-zA-Z0-9]+/g, ".")
		.toLowerCase()
		// Clean up multiple dots
		.replace(/\.+/g, ".")
		// Remove leading/trailing dots
		.replace(/^\.+|\.+$/g, "");

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Convert string to valid TypeScript identifier
 */
export function toValidIdentifier(input: string, prefix = "I"): string {
	if (!input?.trim()) {
		return prefix + "Unknown";
	}

	let result = toPascalCase(input);

	// Ensure it starts with a valid character
	if (!/^[a-zA-Z_$]/.test(result)) {
		result = prefix + result;
	}

	// Replace any remaining invalid characters
	result = result.replace(/[^a-zA-Z0-9_$]/g, "");

	// Ensure it's not empty after cleaning
	if (!result) {
		return prefix + "Unknown";
	}

	return result;
}

/**
 * Convert string to valid file name
 */
export function toValidFileName(input: string): string {
	if (!input?.trim()) {
		return "unknown";
	}

	return (
		input
			.trim()
			// Replace spaces and underscores with hyphens
			.replace(/[\s_]/g, "-")
			// Remove invalid file name characters
			.replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
			// Replace other non-alphanumeric with hyphens
			.replace(/[^a-zA-Z0-9.-]/g, "-")
			.toLowerCase()
			// Clean up multiple hyphens
			.replace(/-+/g, "-")
			// Remove leading/trailing hyphens
			.replace(/^-+|-+$/g, "") || "unknown"
	);
}

/**
 * Pluralize a word (simple English rules)
 */
export function pluralize(word: string): string {
	const cacheKey = `plural:${word}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!word?.trim()) {
		return "";
	}

	const lower = word.toLowerCase();
	let result: string;

	// Irregular plurals
	const irregulars: Record<string, string> = {
		child: "children",
		person: "people",
		man: "men",
		woman: "women",
		tooth: "teeth",
		foot: "feet",
		mouse: "mice",
		goose: "geese",
	};

	if (irregulars[lower]) {
		result = irregulars[lower];
	}
	// Words ending in -s, -ss, -sh, -ch, -x, -z, -o
	else if (/[sxz]$|[^aeiou]o$|[^aeiou]h$/.test(lower)) {
		result = word + "es";
	}
	// Words ending in consonant + y
	else if (/[^aeiou]y$/.test(lower)) {
		result = word.slice(0, -1) + "ies";
	}
	// Words ending in -f or -fe
	else if (/fe?$/.test(lower)) {
		result = word.replace(/fe?$/, "ves");
	}
	// Default: add -s
	else {
		result = word + "s";
	}

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Singularize a word (simple English rules)
 */
export function singularize(word: string): string {
	const cacheKey = `singular:${word}`;
	if (transformationCache.has(cacheKey)) {
		return transformationCache.get(cacheKey)!;
	}

	if (!word?.trim()) {
		return "";
	}

	const lower = word.toLowerCase();
	let result: string;

	// Irregular singulars
	const irregulars: Record<string, string> = {
		children: "child",
		people: "person",
		men: "man",
		women: "woman",
		teeth: "tooth",
		feet: "foot",
		mice: "mouse",
		geese: "goose",
	};

	if (irregulars[lower]) {
		result = irregulars[lower];
	}
	// Words ending in -ies
	else if (/ies$/.test(lower)) {
		result = word.slice(0, -3) + "y";
	}
	// Words ending in -ves
	else if (/ves$/.test(lower)) {
		result = word.slice(0, -3) + "f";
	}
	// Words ending in -es
	else if (/[sxz]es$|[^aeiou]hes$|[^aeiou]oes$/.test(lower)) {
		result = word.slice(0, -2);
	}
	// Words ending in -s (but not -ss)
	else if (/[^s]s$/.test(lower)) {
		result = word.slice(0, -1);
	}
	// No change needed
	else {
		result = word;
	}

	transformationCache.set(cacheKey, result);
	return result;
}

/**
 * Clear the transformation cache
 */
export function clearCache(): void {
	transformationCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): { size: number; hitRate?: number } {
	return {
		size: transformationCache.size,
		// Note: We'd need to track hits/misses to calculate hit rate
	};
}

/**
 * Batch transform multiple strings with the same transformation
 */
export function batchTransform(
	strings: string[],
	transformer: (input: string) => string,
): string[] {
	return strings.map(transformer);
}

/**
 * Chain multiple transformations
 */
export function chainTransforms(
	input: string,
	...transformers: Array<(input: string) => string>
): string {
	return transformers.reduce(
		(result, transformer) => transformer(result),
		input,
	);
}

/**
 * Common naming patterns for different contexts
 */
export const NamingPatterns = {
	// TypeScript interface name
	interface: (name: string) => toValidIdentifier(name, "I"),

	// TypeScript type alias
	type: (name: string) => toValidIdentifier(name, "T"),

	// TypeScript enum
	enum: (name: string) => toValidIdentifier(name, "E"),

	// Class name
	class: (name: string) => toPascalCase(name),

	// Function name
	function: (name: string) => toCamelCase(name),

	// Variable name
	variable: (name: string) => toCamelCase(name),

	// Constant name
	constant: (name: string) => toConstantCase(name),

	// File name
	file: (name: string) => toValidFileName(name),

	// Directory name
	directory: (name: string) => toKebabCase(name),

	// Module name
	module: (name: string) => toCamelCase(name),

	// Property name
	property: (name: string) => toCamelCase(name),
} as const;

/**
 * Validate if a string is a valid identifier for a given language
 */
export function isValidIdentifier(
	input: string,
	language: "typescript" | "javascript" | "python" | "java" = "typescript",
): boolean {
	if (!input?.trim()) {
		return false;
	}

	switch (language) {
		case "typescript":
		case "javascript":
			// Must start with letter, _, or $. Can contain letters, digits, _, $
			return (
				/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(input) &&
				!isReservedWord(input, language)
			);

		case "python":
			// Must start with letter or _. Can contain letters, digits, _
			return (
				/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input) &&
				!isReservedWord(input, language)
			);

		case "java":
			// Must start with letter, _, or $. Can contain letters, digits, _, $
			return (
				/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(input) &&
				!isReservedWord(input, language)
			);

		default:
			return false;
	}
}

/**
 * Check if a word is reserved in a given language
 */
export function isReservedWord(
	word: string,
	language: "typescript" | "javascript" | "python" | "java",
): boolean {
	const reserved = {
		typescript: new Set([
			"abstract",
			"any",
			"as",
			"asserts",
			"assert",
			"async",
			"await",
			"boolean",
			"break",
			"case",
			"catch",
			"class",
			"const",
			"constructor",
			"continue",
			"debugger",
			"declare",
			"default",
			"delete",
			"do",
			"else",
			"enum",
			"export",
			"extends",
			"false",
			"finally",
			"for",
			"from",
			"function",
			"get",
			"if",
			"implements",
			"import",
			"in",
			"infer",
			"instanceof",
			"interface",
			"is",
			"keyof",
			"let",
			"module",
			"namespace",
			"never",
			"new",
			"null",
			"number",
			"object",
			"of",
			"package",
			"private",
			"protected",
			"public",
			"readonly",
			"require",
			"return",
			"set",
			"static",
			"string",
			"super",
			"switch",
			"symbol",
			"this",
			"throw",
			"true",
			"try",
			"type",
			"typeof",
			"undefined",
			"unique",
			"unknown",
			"var",
			"void",
			"while",
			"with",
			"yield",
		]),
		javascript: new Set([
			"abstract",
			"arguments",
			"await",
			"boolean",
			"break",
			"byte",
			"case",
			"catch",
			"char",
			"class",
			"const",
			"continue",
			"debugger",
			"default",
			"delete",
			"do",
			"double",
			"else",
			"enum",
			"eval",
			"export",
			"extends",
			"false",
			"final",
			"finally",
			"float",
			"for",
			"function",
			"goto",
			"if",
			"implements",
			"import",
			"in",
			"instanceof",
			"int",
			"interface",
			"let",
			"long",
			"native",
			"new",
			"null",
			"package",
			"private",
			"protected",
			"public",
			"return",
			"short",
			"static",
			"super",
			"switch",
			"synchronized",
			"this",
			"throw",
			"throws",
			"transient",
			"true",
			"try",
			"typeof",
			"var",
			"void",
			"volatile",
			"while",
			"with",
			"yield",
		]),
		python: new Set([
			"False",
			"None",
			"True",
			"and",
			"as",
			"assert",
			"async",
			"await",
			"break",
			"class",
			"continue",
			"def",
			"del",
			"elif",
			"else",
			"except",
			"finally",
			"for",
			"from",
			"global",
			"if",
			"import",
			"in",
			"is",
			"lambda",
			"nonlocal",
			"not",
			"or",
			"pass",
			"raise",
			"return",
			"try",
			"while",
			"with",
			"yield",
		]),
		java: new Set([
			"abstract",
			"assert",
			"boolean",
			"break",
			"byte",
			"case",
			"catch",
			"char",
			"class",
			"const",
			"continue",
			"default",
			"do",
			"double",
			"else",
			"enum",
			"extends",
			"final",
			"finally",
			"float",
			"for",
			"goto",
			"if",
			"implements",
			"import",
			"instanceof",
			"int",
			"interface",
			"long",
			"native",
			"new",
			"package",
			"private",
			"protected",
			"public",
			"return",
			"short",
			"static",
			"strictfp",
			"super",
			"switch",
			"synchronized",
			"this",
			"throw",
			"throws",
			"transient",
			"try",
			"void",
			"volatile",
			"while",
		]),
	};

	return reserved[language].has(word);
}
