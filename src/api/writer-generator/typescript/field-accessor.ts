/**
 * Enhanced Field Accessor Generation
 *
 * Generates field getters and setters with:
 * - Cardinality validation (min/max)
 * - Choice field clearing
 * - Required field enforcement
 */

import type { Writer } from "@root/api/writer-generator/writer";
import type { ChoiceFieldInstance, Field, ProfileTypeSchema } from "@root/typeschema/types";
import { isChoiceDeclarationField } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { resolveFieldType } from "./field";
import { tsFieldName } from "./utils";

/**
 * Check if field is a choice field instance
 */
function isChoiceFieldInstance(field: Field): field is ChoiceFieldInstance {
    return "choiceOf" in field && typeof field.choiceOf === "string" && field.choiceOf.length > 0;
}

/**
 * Check if profile field adds constraints compared to base resource
 */
function fieldAddsConstraints(profileField: Field, baseField: Field | undefined): boolean {
    if (!baseField) return true; // New field added by profile
    if (isChoiceDeclarationField(profileField) || isChoiceDeclarationField(baseField)) return false;

    // Check cardinality constraints
    const profileMin = profileField.min ?? 0;
    const baseMin = baseField.min ?? 0;
    const profileMax = profileField.max;
    const baseMax = baseField.max;

    if (profileMin > baseMin) return true; // Stricter min
    if (profileMax !== baseMax && profileMax !== undefined) return true; // Different max

    // Check if field is required in profile but not in base
    if (profileField.required && !baseField.required) return true;

    // Check if references are narrowed
    const profileRefs = profileField.reference?.length ?? 0;
    const baseRefs = baseField.reference?.length ?? 0;
    if (profileRefs > 0 && profileRefs < baseRefs) return true; // Narrowed references

    // Check if enum is added
    if (profileField.enum && !baseField.enum) return true;

    return false;
}

/**
 * Generate enhanced field accessor (getter + setter) with validation
 */
export function generateEnhancedFieldAccessor(
    writer: Writer,
    tsIndex: TypeSchemaIndex,
    profile: ProfileTypeSchema,
    fieldName: string,
    field: Field,
): void {
    // Skip choice declarations and excluded fields
    if (isChoiceDeclarationField(field)) return;
    if (field.excluded || field.max === 0) {
        writer.comment("Field " + fieldName + " is excluded (max=0) in this profile");
        return;
    }

    // Only generate accessors for fields that add constraints
    const baseResource = tsIndex.findLastSpecialization(profile);
    const baseField = "fields" in baseResource ? baseResource.fields?.[fieldName] : undefined;
    if (!fieldAddsConstraints(field, baseField)) {
        // Field doesn't add constraints, skip generating accessor
        return;
    }

    const tsField = tsFieldName(fieldName);
    const tsType = resolveFieldType(field, tsIndex);
    const optional = field.required ? "" : " | undefined";
    const arrayMark = field.array ? "[]" : "";

    // Generate getter function
    generateGetterFunction(writer, tsField, fieldName, field, tsType, optional, arrayMark);
    writer.line();

    // Generate setter function with validation
    generateSetterFunction(writer, profile, tsField, fieldName, field, tsType, optional, arrayMark);
    writer.line();
}

/**
 * Generate getter function (e.g., getName(): string)
 */
function generateGetterFunction(
    writer: Writer,
    tsField: string,
    fieldName: string,
    field: Field,
    tsType: string,
    optional: string,
    arrayMark: string,
): void {
    // Convert field name to method name (e.g., "birthDate" -> "getBirthDate")
    const methodName = tsField.startsWith('"')
        ? `"get${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}"`
        : `get${tsField.charAt(0).toUpperCase()}${tsField.slice(1)}`;

    // Add JSDoc with cardinality information
    if (!isChoiceDeclarationField(field)) {
        const min = field.min ?? 0;
        const max = field.max ?? (field.array ? "*" : "1");
        writer.comment(`Get ${fieldName} (cardinality: ${min}..${max})`);
    }

    writer.curlyBlock([methodName + "():", tsType + arrayMark + optional], () => {
        writer.lineSM("return this._resource." + tsField);
    });
}

/**
 * Generate setter function with validation and choice clearing (e.g., setName(value: string): void)
 */
function generateSetterFunction(
    writer: Writer,
    profile: ProfileTypeSchema,
    tsField: string,
    fieldName: string,
    field: Field,
    tsType: string,
    optional: string,
    arrayMark: string,
): void {
    // Convert field name to method name (e.g., "birthDate" -> "setBirthDate")
    const methodName = tsField.startsWith('"')
        ? `"set${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}"`
        : `set${tsField.charAt(0).toUpperCase()}${tsField.slice(1)}`;

    // Add JSDoc with cardinality information
    if (!isChoiceDeclarationField(field)) {
        const min = field.min ?? 0;
        const max = field.max ?? (field.array ? "*" : "1");
        writer.comment(`Set ${fieldName} (cardinality: ${min}..${max})`);
        if (min > 0) {
            writer.comment(`@param value - Required field (min: ${min})`);
        }
    }

    // For required fields, don't allow undefined in the setter signature
    const setterOptional = (field.min ?? 0) > 0 ? "" : optional;

    writer.curlyBlock([methodName + "(value:", tsType + arrayMark + setterOptional + "):", "void"], () => {
        // Handle choice field clearing
        if (isChoiceFieldInstance(field)) {
            generateChoiceClearing(writer, profile, fieldName, field.choiceOf);
        }

        // Validate and assign
        if (field.array) {
            // Array field validation
            const min = field.min ?? 0;
            const max = field.max !== undefined ? '"' + field.max + '"' : "undefined";
            writer.lineSM(
                "assignArrayField(this._resource, " +
                    '"' +
                    tsField +
                    '", value, { min: ' +
                    min +
                    ", max: " +
                    max +
                    " })",
            );
        } else {
            // Scalar field validation
            const min = field.min ?? 0;
            const max = field.max !== undefined ? '"' + field.max + '"' : "undefined";
            writer.lineSM(
                "assignScalarField(this._resource, " +
                    '"' +
                    tsField +
                    '", value, { min: ' +
                    min +
                    ", max: " +
                    max +
                    " })",
            );
        }
    });
}

/**
 * Generate code to clear other choice fields when setting a choice variant
 */
function generateChoiceClearing(
    writer: Writer,
    profile: ProfileTypeSchema,
    currentFieldName: string,
    choiceBaseName: string,
): void {
    if (!profile.fields) return;

    // Find all other choice variants for this choice base
    const choiceVariants: string[] = [];
    for (const [fieldName, field] of Object.entries(profile.fields)) {
        if (isChoiceDeclarationField(field)) continue;
        if (isChoiceFieldInstance(field) && field.choiceOf === choiceBaseName && fieldName !== currentFieldName) {
            choiceVariants.push(tsFieldName(fieldName));
        }
    }

    if (choiceVariants.length === 0) return;

    // Generate clearing code
    writer.comment("Clear other choice[x] variants for " + choiceBaseName + "[x]");
    for (const variantField of choiceVariants) {
        writer.lineSM("this._resource." + variantField + " = undefined");
    }
}
