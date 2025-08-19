import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Convert a string into PascalCase.
 * Examples:
 *  - "patient-name" -> "PatientName"
 *  - "Patient name" -> "PatientName"
 *  - "patient_name" -> "PatientName"
 *  - "patientName" -> "PatientName"
 */
export function toPascalCase(input: string): string {
	const parts = input
		.replace(/[^A-Za-z0-9]+/g, " ")
		.split(" ")
		.map((p) => p.trim())
		.filter(Boolean);

	if (parts.length === 0) return "";

	return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join("");
}

/**
 * Split an array into chunks of a given size.
 *
 * Examples:
 *  - chunkArray([1,2,3,4,5], 2) -> [[1,2],[3,4],[5]]
 *  - chunkArray([], 3) -> []
 *
 * @param arr - The array to split.
 * @param size - The maximum size of each chunk (must be >= 1).
 * @returns An array of chunks (each chunk is an array of T).
 * @throws RangeError if size is less than 1.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
	if (!Number.isInteger(size) || size < 1) {
		throw new RangeError("chunk size must be an integer greater than 0");
	}

	const result: T[][] = [];
	if (!arr || arr.length === 0) return result;

	for (let i = 0; i < arr.length; i += size) {
		result.push(arr.slice(i, i + size));
	}

	return result;
}

/**
 * Resolve template directory path based on whether we're running in development or built mode
 * @param templateSubPath - The subdirectory path under templates (e.g., 'typescript')
 * @returns Absolute path to the template directory
 */
export function resolveTemplatePath(templateSubPath: string = ""): string {
	const currentFile = fileURLToPath(import.meta.url);
	const currentDir = dirname(currentFile);

	// In built mode: dist/utils.js -> ../templates/
	// In dev mode: src/utils.ts -> ../templates/
	const templatesDir = join(currentDir, "..", "templates");

	return templateSubPath ? join(templatesDir, templateSubPath) : templatesDir;
}
