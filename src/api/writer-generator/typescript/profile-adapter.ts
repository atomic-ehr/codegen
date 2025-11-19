/**
 * Profile Adapter Class Generation
 *
 * Generates adapter classes for FHIR profiles following the adapter pattern.
 * Adapters wrap base resources and provide type-safe access with runtime validation.
 */

import type { Writer } from "@root/api/writer-generator/writer";
import type { Field, ProfileTypeSchema } from "@root/typeschema/types";
import { isChoiceDeclarationField } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { generateExtensionAccessor } from "./extension-accessor";
import { resolveFieldType } from "./field";
import { generateEnhancedFieldAccessor } from "./field-accessor";
import { resolvePrimitiveType, tsFieldName, tsResourceName } from "./utils";

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
export function generateProfileAdapter(writer: Writer, tsIndex: TypeSchemaIndex, profile: ProfileTypeSchema): void {
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

        // toJSON method for serialization
        generateToJSON(writer, baseResourceName);
        writer.line();

        // Enhanced field accessors with validation (Task 5)
        generateEnhancedFieldAccessors(writer, tsIndex, profile);

        // Extension accessors (Task 6)
        generateExtensionAccessors(writer, profile);
    });

    // Generate type predicate for profile
    writer.line();
    generateProfileTypePredicate(writer, profile, baseResourceName);
}

/**
 * Generate static profileUrl property
 */
function generateStaticProfileUrl(writer: Writer, profile: ProfileTypeSchema): void {
    const url = profile.identifier.url || "";
    writer.lineSM(`static readonly profileUrl = "${url}"`);
}

/**
 * Generate constructor with meta.profile validation
 */
function generateConstructor(writer: Writer, className: string, baseResourceName: string): void {
    writer.curlyBlock(["constructor(private _resource:", baseResourceName, ")"], () => {
        // Validate that resource claims this profile
        writer.comment("Validate that resource claims this profile");
        writer.curlyBlock(["if (!_resource.meta?.profile?.includes(", className, ".profileUrl))"], () => {
            writer.lineSM(`console.warn(\`Resource does not declare profile \${${className}.profileUrl}\`)`);
        });
    });
}

/**
 * Generate resource getter (access to underlying resource)
 */
function generateResourceGetter(writer: Writer, baseResourceName: string): void {
    writer.comment("Access to underlying FHIR resource (readonly)");
    writer.comment("Use profile accessors to modify fields with validation");
    writer.curlyBlock(["get resource():", "Readonly<" + baseResourceName + ">"], () => {
        writer.lineSM("return this._resource");
    });
}

/**
 * Generate toJSON method for proper JSON serialization
 */
function generateToJSON(writer: Writer, baseResourceName: string): void {
    writer.comment("Return the underlying resource for JSON serialization");
    writer.curlyBlock(["toJSON():", baseResourceName], () => {
        writer.lineSM("return this._resource");
    });
}

/**
 * Generate enhanced field accessors with validation
 */
function generateEnhancedFieldAccessors(writer: Writer, tsIndex: TypeSchemaIndex, profile: ProfileTypeSchema): void {
    if (!profile.fields) return;

    writer.comment("Profile-constrained field accessors with validation");

    // Get sorted field entries
    const fieldEntries = Object.entries(profile.fields).sort((a, b) => a[0].localeCompare(b[0]));

    // Generate enhanced accessors with validation
    for (const [fieldName, field] of fieldEntries) {
        // Skip choice declarations (handled separately)
        if (isChoiceDeclarationField(field)) continue;

        // Generate enhanced accessor (handles excluded fields internally)
        generateEnhancedFieldAccessor(writer, tsIndex, profile, fieldName, field);
    }
}

/**
 * Generate extension accessors
 */
function generateExtensionAccessors(writer: Writer, profile: ProfileTypeSchema): void {
    if (!profile.extensions || profile.extensions.length === 0) return;

    writer.line();
    writer.comment("Extension accessors");

    // Sort extensions by path for consistent output
    const sortedExtensions = [...profile.extensions].sort((a, b) => a.path.localeCompare(b.path));

    for (const extension of sortedExtensions) {
        writer.line();
        generateExtensionAccessor(writer, extension);
    }
}

/**
 * Generate type predicate function for profile type checking
 */
function generateProfileTypePredicate(writer: Writer, profile: ProfileTypeSchema, baseResourceName: string): void {
    const className = tsResourceName(profile.identifier);
    const resourceTypeName = profile.base.name;

    writer.curlyBlock(["export", "function", `is${className}(resource: any): resource is ${className}`], () => {
        writer.lineSM(
            `return resource?.resourceType === "${resourceTypeName}" && (resource.meta?.profile?.includes(${className}.profileUrl) ?? false)`,
        );
    });
}
