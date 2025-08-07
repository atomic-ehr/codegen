/**
 * String Manipulation Utilities
 *
 * Comprehensive string processing utilities with Unicode support and performance optimization
 */

/**
 * String processing cache for performance
 */
const stringCache = new Map<string, any>();

/**
 * Truncate string to specified length with ellipsis
 */
export function truncate(
	str: string,
	length: number,
	ellipsis = "...",
): string {
	if (!str || str.length <= length) {
		return str || "";
	}

	const truncated = str.slice(0, length - ellipsis.length).trimEnd();
	return truncated + ellipsis;
}

/**
 * Truncate string at word boundary
 */
export function truncateWords(
	str: string,
	maxLength: number,
	ellipsis = "...",
): string {
	if (!str || str.length <= maxLength) {
		return str || "";
	}

	const truncated = str.slice(0, maxLength - ellipsis.length);
	const lastSpace = truncated.lastIndexOf(" ");

	if (lastSpace > 0) {
		return truncated.slice(0, lastSpace).trimEnd() + ellipsis;
	}

	return truncated.trimEnd() + ellipsis;
}

/**
 * Pad string to specified length
 */
export function pad(
	str: string,
	length: number,
	char = " ",
	direction: "left" | "right" | "both" = "right",
): string {
	if (!str) str = "";

	const padding = Math.max(0, length - str.length);
	const padChar = char || " ";

	switch (direction) {
		case "left":
			return padChar.repeat(padding) + str;

		case "both": {
			const leftPad = Math.floor(padding / 2);
			const rightPad = padding - leftPad;
			return padChar.repeat(leftPad) + str + padChar.repeat(rightPad);
		}

		case "right":
		default:
			return str + padChar.repeat(padding);
	}
}

/**
 * Escape string for use in regex
 */
export function escapeRegex(str: string): string {
	if (!str) return "";
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Escape string for use in HTML
 */
export function escapeHtml(str: string): string {
	if (!str) return "";

	const htmlEscapes: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
		"/": "&#x2F;",
	};

	return str.replace(/[&<>"'/]/g, (match) => htmlEscapes[match]);
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(str: string): string {
	if (!str) return "";

	const htmlUnescapes: Record<string, string> = {
		"&amp;": "&",
		"&lt;": "<",
		"&gt;": ">",
		"&quot;": '"',
		"&#39;": "'",
		"&#x2F;": "/",
	};

	return str.replace(
		/&(?:amp|lt|gt|quot|#39|#x2F);/g,
		(match) => htmlUnescapes[match],
	);
}

/**
 * Convert string to title case
 */
export function toTitleCase(
	str: string,
	options?: {
		smallWords?: string[];
		preserveCase?: boolean;
	},
): string {
	if (!str) return "";

	const defaultSmallWords = [
		"a",
		"an",
		"and",
		"as",
		"at",
		"but",
		"by",
		"for",
		"if",
		"in",
		"is",
		"it",
		"of",
		"on",
		"or",
		"the",
		"to",
		"up",
		"via",
		"with",
	];

	const smallWords = new Set(options?.smallWords || defaultSmallWords);

	return str
		.toLowerCase()
		.split(/(\s+)/)
		.map((word, index, array) => {
			// Keep whitespace as-is
			if (/^\s+$/.test(word)) {
				return word;
			}

			// Always capitalize first and last words
			if (index === 0 || index === array.length - 1) {
				return capitalize(word, options?.preserveCase);
			}

			// Check if it's a small word
			const cleanWord = word.replace(/[^\w]/g, "").toLowerCase();
			if (smallWords.has(cleanWord)) {
				return options?.preserveCase ? word : word.toLowerCase();
			}

			return capitalize(word, options?.preserveCase);
		})
		.join("");
}

/**
 * Capitalize first letter of string
 */
export function capitalize(str: string, preserveRest = false): string {
	if (!str) return "";

	const first = str.charAt(0).toUpperCase();
	const rest = preserveRest ? str.slice(1) : str.slice(1).toLowerCase();

	return first + rest;
}

/**
 * Uncapitalize first letter of string
 */
export function uncapitalize(str: string): string {
	if (!str) return "";
	return str.charAt(0).toLowerCase() + str.slice(1);
}

/**
 * Remove diacritics/accents from string
 */
export function removeDiacritics(str: string): string {
	if (!str) return "";

	return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Count words in string
 */
export function wordCount(str: string): number {
	if (!str) return 0;

	return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Count characters (including Unicode)
 */
export function charCount(str: string): number {
	if (!str) return 0;

	// Use Array.from to properly handle Unicode surrogate pairs
	return Array.from(str).length;
}

/**
 * Reverse string (Unicode-safe)
 */
export function reverse(str: string): string {
	if (!str) return "";

	return Array.from(str).reverse().join("");
}

/**
 * Check if string is palindrome
 */
export function isPalindrome(str: string, caseSensitive = false): boolean {
	if (!str) return true;

	const cleaned = caseSensitive ? str : str.toLowerCase();
	return cleaned === reverse(cleaned);
}

/**
 * Remove extra whitespace
 */
export function normalizeWhitespace(str: string): string {
	if (!str) return "";

	return str.replace(/\s+/g, " ").trim();
}

/**
 * Indent string by specified number of spaces/tabs
 */
export function indent(str: string, size = 2, char = " "): string {
	if (!str) return "";

	const indentString = char.repeat(size);
	return str
		.split("\n")
		.map((line) => (line ? indentString + line : line))
		.join("\n");
}

/**
 * Remove indentation from string
 */
export function dedent(str: string): string {
	if (!str) return "";

	const lines = str.split("\n");

	// Find minimum indentation (excluding empty lines)
	const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
	if (nonEmptyLines.length === 0) return str;

	const minIndent = Math.min(
		...nonEmptyLines.map((line) => {
			const match = line.match(/^(\s*)/);
			return match ? match[1].length : 0;
		}),
	);

	// Remove common indentation
	return lines
		.map((line) => {
			if (line.trim().length === 0) return line;
			return line.slice(minIndent);
		})
		.join("\n");
}

/**
 * Wrap text to specified width
 */
export function wordWrap(str: string, width = 80, breakWord = false): string {
	if (!str || width <= 0) return str || "";

	const words = str.split(/\s+/);
	const lines: string[] = [];
	let currentLine = "";

	for (const word of words) {
		if (word.length > width && breakWord) {
			// Break long words
			if (currentLine) {
				lines.push(currentLine.trim());
				currentLine = "";
			}

			for (let i = 0; i < word.length; i += width) {
				lines.push(word.slice(i, i + width));
			}
		} else if (currentLine.length + word.length + 1 > width) {
			// Start new line
			lines.push(currentLine.trim());
			currentLine = word;
		} else {
			// Add to current line
			currentLine += (currentLine ? " " : "") + word;
		}
	}

	if (currentLine) {
		lines.push(currentLine.trim());
	}

	return lines.join("\n");
}

/**
 * Extract words from string
 */
export function extractWords(
	str: string,
	options?: {
		minLength?: number;
		maxLength?: number;
		includeNumbers?: boolean;
	},
): string[] {
	if (!str) return [];

	const {
		minLength = 1,
		maxLength = Infinity,
		includeNumbers = true,
	} = options || {};

	const pattern = includeNumbers ? /\b\w+\b/g : /\b[a-zA-Z]+\b/g;
	const words = str.match(pattern) || [];

	return words.filter(
		(word) => word.length >= minLength && word.length <= maxLength,
	);
}

/**
 * Generate slug from string
 */
export function slugify(
	str: string,
	options?: {
		separator?: string;
		lowercase?: boolean;
		maxLength?: number;
	},
): string {
	if (!str) return "";

	const { separator = "-", lowercase = true, maxLength } = options || {};

	let result = str
		.trim()
		// Remove diacritics
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		// Replace non-alphanumeric with separator
		.replace(/[^a-zA-Z0-9]+/g, separator)
		// Remove leading/trailing separators
		.replace(
			new RegExp(
				`^${escapeRegex(separator)}+|${escapeRegex(separator)}+$`,
				"g",
			),
			"",
		);

	if (lowercase) {
		result = result.toLowerCase();
	}

	if (maxLength && result.length > maxLength) {
		result = result.slice(0, maxLength);
		// Remove trailing separator if we cut in the middle
		result = result.replace(new RegExp(`${escapeRegex(separator)}+$`), "");
	}

	return result;
}

/**
 * Generate random string
 */
export function randomString(
	length = 10,
	charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
): string {
	let result = "";
	for (let i = 0; i < length; i++) {
		result += charset.charAt(Math.floor(Math.random() * charset.length));
	}
	return result;
}

/**
 * Generate UUID v4
 */
export function generateUuid(): string {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Levenshtein distance between two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
	if (!str1) return str2?.length || 0;
	if (!str2) return str1.length;

	const matrix: number[][] = [];

	// Initialize first row and column
	for (let i = 0; i <= str2.length; i++) {
		matrix[i] = [i];
	}
	for (let j = 0; j <= str1.length; j++) {
		matrix[0][j] = j;
	}

	// Fill the matrix
	for (let i = 1; i <= str2.length; i++) {
		for (let j = 1; j <= str1.length; j++) {
			if (str2[i - 1] === str1[j - 1]) {
				matrix[i][j] = matrix[i - 1][j - 1];
			} else {
				matrix[i][j] = Math.min(
					matrix[i - 1][j - 1] + 1, // substitution
					matrix[i][j - 1] + 1, // insertion
					matrix[i - 1][j] + 1, // deletion
				);
			}
		}
	}

	return matrix[str2.length][str1.length];
}

/**
 * Calculate string similarity (0-1)
 */
export function similarity(str1: string, str2: string): number {
	if (!str1 && !str2) return 1;
	if (!str1 || !str2) return 0;

	const maxLength = Math.max(str1.length, str2.length);
	if (maxLength === 0) return 1;

	const distance = levenshteinDistance(str1, str2);
	return (maxLength - distance) / maxLength;
}

/**
 * Find best matching string from array
 */
export function findBestMatch(
	target: string,
	candidates: string[],
): {
	match: string;
	score: number;
	index: number;
} | null {
	if (!target || !candidates.length) return null;

	let bestMatch: string = candidates[0];
	let bestScore = similarity(target, bestMatch);
	let bestIndex = 0;

	for (let i = 1; i < candidates.length; i++) {
		const score = similarity(target, candidates[i]);
		if (score > bestScore) {
			bestScore = score;
			bestMatch = candidates[i];
			bestIndex = i;
		}
	}

	return {
		match: bestMatch,
		score: bestScore,
		index: bestIndex,
	};
}

/**
 * Template literal tag for dedenting strings
 */
export function dedentTemplate(
	template: TemplateStringsArray,
	...substitutions: any[]
): string {
	let result = "";

	for (let i = 0; i < template.length; i++) {
		result += template[i];
		if (i < substitutions.length) {
			result += String(substitutions[i]);
		}
	}

	return dedent(result);
}

/**
 * Safe JSON stringify with circular reference handling
 */
export function safeStringify(obj: any, space?: string | number): string {
	const seen = new WeakSet();

	return JSON.stringify(
		obj,
		(key, value) => {
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) {
					return "[Circular]";
				}
				seen.add(value);
			}
			return value;
		},
		space,
	);
}

/**
 * Hash string to number (simple hash function)
 */
export function hashString(str: string): number {
	if (!str) return 0;

	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return hash;
}

/**
 * Clear string processing cache
 */
export function clearStringCache(): void {
	stringCache.clear();
}

/**
 * String utilities with caching
 */
export const CachedStringUtils = {
	/**
	 * Cached word extraction
	 */
	getWords: (str: string): string[] => {
		const key = `words:${str}`;
		if (stringCache.has(key)) {
			return stringCache.get(key);
		}
		const result = extractWords(str);
		stringCache.set(key, result);
		return result;
	},

	/**
	 * Cached slugification
	 */
	getSlug: (str: string): string => {
		const key = `slug:${str}`;
		if (stringCache.has(key)) {
			return stringCache.get(key);
		}
		const result = slugify(str);
		stringCache.set(key, result);
		return result;
	},
};
