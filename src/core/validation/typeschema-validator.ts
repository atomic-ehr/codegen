/**
 * TypeSchema JSON Schema Validation
 *
 * Validates TypeSchema objects against the reference JSON schema
 * from https://github.com/fhir-clj/type-schema
 */

import Ajv, { type ValidateFunction } from "ajv";
import * as fs from "fs/promises";
import * as path from "path";
import type { AnyTypeSchemaCompliant } from "../typeschema/types";

const SCHEMA_PATH = path.join(
	__dirname,
	"../../../docs/type-schema.schema.json",
);

let ajv: Ajv;
let validateFunction: ValidateFunction;

/**
 * Initialize the AJV validator with the TypeSchema JSON schema
 */
async function initializeValidator(): Promise<void> {
	if (validateFunction) return;

	try {
		const schemaContent = await fs.readFile(SCHEMA_PATH, "utf-8");
		const schema = JSON.parse(schemaContent);

		ajv = new Ajv({
			allErrors: true,
			verbose: true,
			strict: false,
		});

		validateFunction = ajv.compile(schema);
	} catch (error) {
		throw new Error(`Failed to initialize TypeSchema validator: ${error}`);
	}
}

/**
 * Validate a TypeSchema object against the reference JSON schema
 */
export async function validateTypeSchema(
	schema: AnyTypeSchemaCompliant,
): Promise<{ valid: boolean; errors?: string[] }> {
	await initializeValidator();

	const valid = validateFunction(schema);

	if (!valid && validateFunction.errors) {
		const errors = validateFunction.errors.map((error) => {
			const path = error.instancePath || error.schemaPath || "";
			const message = error.message || "Unknown validation error";
			return `${path}: ${message}`;
		});

		return { valid: false, errors };
	}

	return { valid: true };
}

/**
 * Validate multiple TypeSchema objects
 */
export async function validateTypeSchemas(
	schemas: AnyTypeSchemaCompliant[],
): Promise<
	Array<{ schema: AnyTypeSchemaCompliant; valid: boolean; errors?: string[] }>
> {
	await initializeValidator();

	return Promise.all(
		schemas.map(async (schema) => {
			const result = await validateTypeSchema(schema);
			return { schema, ...result };
		}),
	);
}

/**
 * Validate and throw on error
 */
export async function validateTypeSchemaOrThrow(
	schema: AnyTypeSchemaCompliant,
): Promise<void> {
	const result = await validateTypeSchema(schema);

	if (!result.valid) {
		const errorMessage =
			result.errors?.join("\n") || "Unknown validation error";
		throw new Error(`TypeSchema validation failed:\n${errorMessage}`);
	}
}

/**
 * Check if the JSON schema file exists and is accessible
 */
export async function isValidatorAvailable(): Promise<boolean> {
	try {
		await fs.access(SCHEMA_PATH);
		return true;
	} catch {
		return false;
	}
}
