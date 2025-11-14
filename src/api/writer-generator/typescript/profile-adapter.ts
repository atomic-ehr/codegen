/**
 * Profile Adapter Class Generation
 *
 * Generates adapter classes for FHIR profiles following the adapter pattern.
 * Adapters wrap base resources and provide type-safe access with runtime validation.
 */

import type { Writer } from "@root/api/writer-generator/writer";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type {
	Field,
	ProfileTypeSchema,
	RegularField,
} from "@root/typeschema/types";
import { isChoiceDeclarationField } from "@root/typeschema/types";
import { resolvePrimitiveType, tsFieldName, tsResourceName } from "./utils";
import { resolveFieldType } from "./field";

/**
 * Generate adapter class for a FHIR profile
 *
 * The adapter pattern wraps a base resource and provides:
 * - Runtime validation of profile conformance
 * - Type-safe accessors for constrained fields
 * - Prevention of invalid state (excluded fields, cardinality violations)
 *
 * Example output:
 * ```typescript
 * export class USCorePatient {
 *   static readonly profileUrl = "http://...";
 *   constructor(private _resource: Patient) { ... }
 *   get resource(): Patient { return this._resource; }
 *   get birthDate(): string | undefined { ... }
 *   set birthDate(value: string | undefined) { ... }
 * }
 * ```
 */
export function generateProfileAdapter(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	profile: ProfileTypeSchema,
): void {
	const className = tsResourceName(profile.identifier);
	const baseResourceName = tsResourceName(profile.base);

	writer.comment(`Profile Adapter: ${className}`);
	writer.comment(`Base Resource: ${baseResourceName}`);
	if (profile.identifier.url) {
		writer.comment(`Canonical URL: ${profile.identifier.url}`);
	}
	if (profile.description) {
		writer.comment(profile.description);
	}
	writer.line();

	// Class declaration
	writer.curlyBlock(["export", "class", className], () => {
		// Static profileUrl property
		generateStaticProfileUrl(writer, profile);
		writer.line();

		// Constructor with validation
		generateConstructor(writer, className, baseResourceName);
		writer.line();

		// Resource getter
		generateResourceGetter(writer, baseResourceName);
		writer.line();

		// Basic field accessors (Task 5 will enhance these)
		generateBasicFieldAccessors(writer, tsIndex, profile);
	});
}

/**
 * Generate static profileUrl property
 */
function generateStaticProfileUrl(
	writer: Writer,
	profile: ProfileTypeSchema,
): void {
	const url = profile.identifier.url || "";
	writer.lineSM(`static readonly profileUrl = "${url}"`);
}

/**
 * Generate constructor with meta.profile validation
 */
function generateConstructor(
	writer: Writer,
	className: string,
	baseResourceName: string,
): void {
	writer.curlyBlock(
		["constructor(private _resource:", baseResourceName, ")"],
		() => {
			// Validate that resource claims this profile
			writer.comment("Validate that resource claims this profile");
			writer.curlyBlock(
				[
					"if (!_resource.meta?.profile?.includes(",
					className,
					".profileUrl))",
				],
				() => {
					writer.lineSM(
						`console.warn(\`Resource does not declare profile \${${className}.profileUrl}\`)`,
					);
				},
			);
		},
	);
}

/**
 * Generate resource getter (access to underlying resource)
 */
function generateResourceGetter(
	writer: Writer,
	baseResourceName: string,
): void {
	writer.comment("Access to underlying FHIR resource");
	writer.curlyBlock(["get resource():", baseResourceName], () => {
		writer.lineSM("return this._resource");
	});
}

/**
 * Generate basic field accessors (will be enhanced in Task 5)
 */
function generateBasicFieldAccessors(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	profile: ProfileTypeSchema,
): void {
	if (!profile.fields) return;

	writer.comment("Profile-constrained field accessors");

	// Get sorted field entries
	const fieldEntries = Object.entries(profile.fields).sort((a, b) =>
		a[0].localeCompare(b[0]),
	);

	// For now, generate simple pass-through accessors
	// Task 5 will add validation, choice clearing, etc.
	for (const [fieldName, field] of fieldEntries) {
		// Skip choice declarations (handled separately)
		if (isChoiceDeclarationField(field)) continue;

		// Skip excluded fields (max=0)
		if (field.excluded) continue;

		generateFieldAccessor(writer, tsIndex, fieldName, field);
	}
}

/**
 * Generate getter/setter for a single field
 */
function generateFieldAccessor(
	writer: Writer,
	tsIndex: TypeSchemaIndex,
	fieldName: string,
	field: RegularField,
): void {
	const tsField = tsFieldName(fieldName);
	const fieldTypeStr = resolveFieldTypeString(field, tsIndex);
	const optional = field.required ? "" : "?";
	const arrayMark = field.array ? "[]" : "";

	// Getter
	writer.curlyBlock(
		["get", `${tsField}()${optional}:`, `${fieldTypeStr}${arrayMark}`],
		() => {
			writer.lineSM(`return this._resource.${tsField}`);
		},
	);
	writer.line();

	// Setter
	writer.curlyBlock(
		["set", `${tsField}(value:`, `${fieldTypeStr}${arrayMark}${optional})`],
		() => {
			writer.lineSM(`this._resource.${tsField} = value`);
		},
	);
	writer.line();
}

/**
 * Resolve field type to TypeScript type string
 * (Simplified version for this task; reuses field.ts utilities)
 */
function resolveFieldTypeString(
	field: RegularField,
	tsIndex: TypeSchemaIndex,
): string {
	if (!field.type) return "unknown";

	// Use existing field resolution
	return resolveFieldType(field, tsIndex);
}
