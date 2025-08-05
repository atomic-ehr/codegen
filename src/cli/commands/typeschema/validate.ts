/**
 * TypeSchema Validate Command
 *
 * Validate TypeSchema files for correctness and consistency
 */

import type { CommandModule } from "yargs";
import { resolve } from "path";
import { readFile, readdir, stat } from "fs/promises";
import { join, extname } from "path";
import type { AnyTypeSchema, TypeSchemaIdentifier } from "../../../lib/typeschema/types";
import { isTypeSchema, isTypeSchemaBinding, isTypeSchemaValueSet } from "../../../lib/typeschema/types";

interface ValidateCommandArgs {
	input: string[];
	verbose?: boolean;
	strict?: boolean;
	"check-dependencies"?: boolean;
	"output-format"?: "text" | "json";
}

interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	warnings: ValidationWarning[];
	stats: ValidationStats;
}

interface ValidationError {
	type: "error";
	message: string;
	schema?: string;
	field?: string;
	severity: "critical" | "major" | "minor";
}

interface ValidationWarning {
	type: "warning";
	message: string;
	schema?: string;
	field?: string;
}

interface ValidationStats {
	totalSchemas: number;
	primitiveTypes: number;
	complexTypes: number;
	resources: number;
	bindings: number;
	valueSets: number;
	validSchemas: number;
	invalidSchemas: number;
}

/**
 * TypeSchema validate command
 */
export const validateTypeschemaCommand: CommandModule<{}, ValidateCommandArgs> = {
	command: "validate <input..>",
	describe: "Validate TypeSchema files for correctness",
	builder: {
		input: {
			type: "string",
			array: true,
			description: "TypeSchema files or directories to validate",
			demandOption: true,
		},
		verbose: {
			alias: "v",
			type: "boolean",
			default: false,
			description: "Show detailed validation information",
		},
		strict: {
			type: "boolean",
			default: false,
			description: "Enable strict validation (fail on warnings)",
		},
		"check-dependencies": {
			type: "boolean",
			default: true,
			description: "Validate dependency references",
		},
		"output-format": {
			type: "string",
			choices: ["text", "json"] as const,
			default: "text" as const,
			description: "Output format for validation results",
		},
	},
	handler: async (argv) => {
		const result = await validateTypeSchema({
			inputPaths: argv.input,
			verbose: argv.verbose ?? false,
			strict: argv.strict ?? false,
			checkDependencies: argv["check-dependencies"] ?? true,
			outputFormat: argv["output-format"] || "text",
		});

		if (argv["output-format"] === "json") {
			console.log(JSON.stringify(result, null, 2));
		} else {
			printValidationResult(result, argv.verbose ?? false);
		}

		// Exit with error code if validation failed
		if (!result.valid) {
			process.exit(1);
		}
	},
};

interface ValidateOptions {
	inputPaths: string[];
	verbose: boolean;
	strict: boolean;
	checkDependencies: boolean;
	outputFormat: "text" | "json";
}

/**
 * Validate TypeSchema files
 */
export async function validateTypeSchema(options: ValidateOptions): Promise<ValidationResult> {
	const result: ValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
		stats: {
			totalSchemas: 0,
			primitiveTypes: 0,
			complexTypes: 0,
			resources: 0,
			bindings: 0,
			valueSets: 0,
			validSchemas: 0,
			invalidSchemas: 0,
		},
	};

	try {
		// Load all schemas from input paths
		const allSchemas: AnyTypeSchema[] = [];
		for (const inputPath of options.inputPaths) {
			const schemas = await loadSchemasFromPath(resolve(inputPath));
			allSchemas.push(...schemas);
		}

		result.stats.totalSchemas = allSchemas.length;

		if (allSchemas.length === 0) {
			result.errors.push({
				type: "error",
				message: "No TypeSchema files found",
				severity: "critical",
			});
			result.valid = false;
			return result;
		}

		// Create maps for dependency checking
		const schemaMap = new Map<string, AnyTypeSchema>();
		const identifierMap = new Map<string, TypeSchemaIdentifier>();

		// Validate individual schemas and build maps
		for (const schema of allSchemas) {
			const schemaResult = validateSingleSchema(schema);
			result.errors.push(...schemaResult.errors);
			result.warnings.push(...schemaResult.warnings);

			if (schemaResult.valid) {
				result.stats.validSchemas++;
			} else {
				result.stats.invalidSchemas++;
				result.valid = false;
			}

			// Count by type and build maps
			const kind = schema.identifier.kind;
			switch (kind) {
				case "primitive-type":
					result.stats.primitiveTypes++;
					break;
				case "complex-type":
					result.stats.complexTypes++;
					break;
				case "resource":
					result.stats.resources++;
					break;
				case "binding":
					result.stats.bindings++;
					break;
				case "value-set":
					result.stats.valueSets++;
					break;
			}

			// Add to maps for dependency checking
			const key = `${schema.identifier.package}:${schema.identifier.name}`;
			schemaMap.set(key, schema);
			identifierMap.set(key, schema.identifier);
		}

		// Check dependencies if requested
		if (options.checkDependencies) {
			const depResult = validateDependencies(allSchemas, identifierMap);
			result.errors.push(...depResult.errors);
			result.warnings.push(...depResult.warnings);
			
			if (!depResult.valid) {
				result.valid = false;
			}
		}

		// If strict mode, treat warnings as errors
		if (options.strict && result.warnings.length > 0) {
			result.valid = false;
		}

	} catch (error) {
		result.errors.push({
			type: "error",
			message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
			severity: "critical",
		});
		result.valid = false;
	}

	return result;
}

/**
 * Validate a single TypeSchema
 */
function validateSingleSchema(schema: AnyTypeSchema): ValidationResult {
	const result: ValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
		stats: {} as ValidationStats,
	};

	const schemaName = schema.identifier?.name || "unknown";

	// Check required identifier fields
	if (!schema.identifier) {
		result.errors.push({
			type: "error",
			message: "Missing identifier",
			schema: schemaName,
			severity: "critical",
		});
		result.valid = false;
		return result;
	}

	const { identifier } = schema;

	// Validate identifier fields
	if (!identifier.kind) {
		result.errors.push({
			type: "error",
			message: "Missing identifier.kind",
			schema: schemaName,
			severity: "critical",
		});
		result.valid = false;
	}

	if (!identifier.name) {
		result.errors.push({
			type: "error",
			message: "Missing identifier.name",
			schema: schemaName,
			severity: "critical",
		});
		result.valid = false;
	}

	if (!identifier.package) {
		result.errors.push({
			type: "error",
			message: "Missing identifier.package",
			schema: schemaName,
			severity: "major",
		});
	}

	if (!identifier.version) {
		result.warnings.push({
			type: "warning",
			message: "Missing identifier.version",
			schema: schemaName,
		});
	}

	// Type-specific validation
	if (isTypeSchema(schema)) {
		validateTypeSchemaFields(schema, result);
	} else if (isTypeSchemaBinding(schema)) {
		validateBindingFields(schema, result);
	} else if (isTypeSchemaValueSet(schema)) {
		validateValueSetFields(schema, result);
	}

	return result;
}

/**
 * Validate TypeSchema fields
 */
function validateTypeSchemaFields(schema: any, result: ValidationResult): void {
	const schemaName = schema.identifier?.name || "unknown";

	// Check dependencies array
	if (!Array.isArray(schema.dependencies)) {
		result.errors.push({
			type: "error",
			message: "dependencies must be an array",
			schema: schemaName,
			field: "dependencies",
			severity: "major",
		});
		result.valid = false;
	}

	// Validate fields if present
	if (schema.fields) {
		if (typeof schema.fields !== "object") {
			result.errors.push({
				type: "error",
				message: "fields must be an object",
				schema: schemaName,
				field: "fields",
				severity: "major",
			});
			result.valid = false;
		} else {
			for (const [fieldName, field] of Object.entries(schema.fields)) {
				validateField(fieldName, field as any, schemaName, result);
			}
		}
	}
}

/**
 * Validate binding fields
 */
function validateBindingFields(schema: any, result: ValidationResult): void {
	const schemaName = schema.identifier?.name || "unknown";

	if (!schema.valueset) {
		result.errors.push({
			type: "error",
			message: "Binding schema missing valueset",
			schema: schemaName,
			field: "valueset",
			severity: "critical",
		});
		result.valid = false;
	}

	if (!schema.strength) {
		result.warnings.push({
			type: "warning",
			message: "Binding schema missing strength",
			schema: schemaName,
			field: "strength",
		});
	}
}

/**
 * Validate value set fields
 */
function validateValueSetFields(schema: any, result: ValidationResult): void {
	const schemaName = schema.identifier?.name || "unknown";

	// ValueSet should have either concept or compose
	if (!schema.concept && !schema.compose) {
		result.warnings.push({
			type: "warning",
			message: "ValueSet has neither concept nor compose",
			schema: schemaName,
		});
	}
}

/**
 * Validate a single field
 */
function validateField(fieldName: string, field: any, schemaName: string, result: ValidationResult): void {
	if (typeof field !== "object") {
		result.errors.push({
			type: "error",
			message: `Field ${fieldName} must be an object`,
			schema: schemaName,
			field: fieldName,
			severity: "major",
		});
		result.valid = false;
		return;
	}

	// Check required boolean fields
	if (typeof field.array !== "boolean") {
		result.errors.push({
			type: "error",
			message: `Field ${fieldName}.array must be boolean`,
			schema: schemaName,
			field: `${fieldName}.array`,
			severity: "major",
		});
		result.valid = false;
	}

	if (typeof field.required !== "boolean") {
		result.errors.push({
			type: "error",
			message: `Field ${fieldName}.required must be boolean`,
			schema: schemaName,
			field: `${fieldName}.required`,
			severity: "major",
		});
		result.valid = false;
	}

	if (typeof field.excluded !== "boolean") {
		result.errors.push({
			type: "error",
			message: `Field ${fieldName}.excluded must be boolean`,
			schema: schemaName,
			field: `${fieldName}.excluded`,
			severity: "major",
		});
		result.valid = false;
	}
}

/**
 * Validate dependencies between schemas
 */
function validateDependencies(schemas: AnyTypeSchema[], identifierMap: Map<string, TypeSchemaIdentifier>): ValidationResult {
	const result: ValidationResult = {
		valid: true,
		errors: [],
		warnings: [],
		stats: {} as ValidationStats,
	};

	for (const schema of schemas) {
		const schemaName = schema.identifier?.name || "unknown";

		// Check dependencies array
		if (schema.dependencies) {
			for (const dep of schema.dependencies) {
				const depKey = `${dep.package}:${dep.name}`;
				if (!identifierMap.has(depKey)) {
					result.warnings.push({
						type: "warning",
						message: `Missing dependency: ${dep.name} (${dep.package})`,
						schema: schemaName,
					});
				}
			}
		}
	}

	return result;
}

/**
 * Load schemas from file or directory path
 */
async function loadSchemasFromPath(inputPath: string): Promise<AnyTypeSchema[]> {
	const stats = await stat(inputPath);

	if (stats.isFile()) {
		return await loadSchemasFromFile(inputPath);
	} else if (stats.isDirectory()) {
		return await loadSchemasFromDirectory(inputPath);
	} else {
		throw new Error(`Invalid input path: ${inputPath}`);
	}
}

/**
 * Load schemas from a single file
 */
async function loadSchemasFromFile(filePath: string): Promise<AnyTypeSchema[]> {
	const content = await readFile(filePath, "utf-8");
	const ext = extname(filePath);

	if (ext === ".ndjson") {
		const lines = content.trim().split("\n");
		return lines.map(line => JSON.parse(line));
	} else if (ext === ".json") {
		const parsed = JSON.parse(content);
		return Array.isArray(parsed) ? parsed : [parsed];
	} else {
		throw new Error(`Unsupported file format: ${ext}`);
	}
}

/**
 * Load schemas from directory
 */
async function loadSchemasFromDirectory(dirPath: string): Promise<AnyTypeSchema[]> {
	const files = await readdir(dirPath, { recursive: true });
	const schemas: AnyTypeSchema[] = [];

	for (const file of files) {
		const filePath = join(dirPath, file);
		const stats = await stat(filePath);
		
		if (stats.isFile() && (file.endsWith(".json") || file.endsWith(".ndjson"))) {
			const fileSchemas = await loadSchemasFromFile(filePath);
			schemas.push(...fileSchemas);
		}
	}

	return schemas;
}

/**
 * Print validation result to console
 */
function printValidationResult(result: ValidationResult, verbose: boolean): void {
	// Print summary
	console.log(`\n📊 Validation Summary:`);
	console.log(`   Total schemas: ${result.stats.totalSchemas}`);
	console.log(`   Valid: ${result.stats.validSchemas}`);
	console.log(`   Invalid: ${result.stats.invalidSchemas}`);
	console.log(`   Errors: ${result.errors.length}`);
	console.log(`   Warnings: ${result.warnings.length}`);

	if (verbose) {
		console.log(`\n📈 Schema Types:`);
		console.log(`   Primitive types: ${result.stats.primitiveTypes}`);
		console.log(`   Complex types: ${result.stats.complexTypes}`);
		console.log(`   Resources: ${result.stats.resources}`);
		console.log(`   Bindings: ${result.stats.bindings}`);
		console.log(`   Value sets: ${result.stats.valueSets}`);
	}

	// Print errors
	if (result.errors.length > 0) {
		console.log(`\n❌ Errors:`);
		for (const error of result.errors) {
			const location = [error.schema, error.field].filter(Boolean).join(".");
			console.log(`   ${error.severity.toUpperCase()}: ${error.message}${location ? ` (${location})` : ""}`);
		}
	}

	// Print warnings
	if (result.warnings.length > 0) {
		console.log(`\n⚠️  Warnings:`);
		for (const warning of result.warnings) {
			const location = [warning.schema, warning.field].filter(Boolean).join(".");
			console.log(`   ${warning.message}${location ? ` (${location})` : ""}`);
		}
	}

	// Print final result
	if (result.valid) {
		console.log(`\n✅ Validation passed!`);
	} else {
		console.log(`\n❌ Validation failed!`);
	}
}