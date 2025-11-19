/**
 * Enhanced Field Accessor Generation
 *
 * Generates TypeScript property accessors with:
 * - Native getters/setters for all fields
 * - Array helper methods (add/remove)
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
 * Generate enhanced field accessor (TypeScript property getter + setter) with validation
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

    // Skip base extension field in profiles - use dedicated extension accessors instead
    // Profiles define extension slices, not constraints on the base extension array
    if (fieldName === "extension") {
        writer.comment("Use dedicated extension accessors (birthsex, race, etc.) instead of generic extension field");
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

    // Generate TypeScript property getter
    generatePropertyGetter(writer, tsField, fieldName, field, tsType, optional, arrayMark);
    writer.line();

    // Generate TypeScript property setter with validation
    generatePropertySetter(writer, profile, tsField, fieldName, field, tsType, optional, arrayMark);
    writer.line();

    // For array fields, generate helper methods (add/remove)
    if (field.array) {
        generateArrayHelpers(writer, profile, tsField, fieldName, field, tsType);
    }
}

/**
 * Generate TypeScript property getter (e.g., get name(): string)
 */
function generatePropertyGetter(
    writer: Writer,
    tsField: string,
    fieldName: string,
    field: Field,
    tsType: string,
    optional: string,
    arrayMark: string,
): void {
    // Add JSDoc with cardinality information
    if (!isChoiceDeclarationField(field)) {
        const min = field.min ?? 0;
        const max = field.max ?? (field.array ? "*" : "1");
        writer.comment(`Get ${fieldName} (cardinality: ${min}..${max})`);
    }

    // For array fields, return empty array if undefined
    const returnType = tsType + arrayMark + optional;
    writer.curlyBlock(["get " + tsField + "():", returnType], () => {
        if (field.array) {
            writer.lineSM("return this._resource." + tsField + " ?? []");
        } else {
            writer.lineSM("return this._resource." + tsField);
        }
    });
}

/**
 * Generate TypeScript property setter with validation and choice clearing (e.g., set name(value: string))
 */
function generatePropertySetter(
    writer: Writer,
    profile: ProfileTypeSchema,
    tsField: string,
    fieldName: string,
    field: Field,
    tsType: string,
    optional: string,
    arrayMark: string,
): void {
    // Get cardinality constraints
    const min = field.min ?? 0;
    const max = field.max ?? (field.array ? "*" : "1");

    // Add JSDoc with cardinality information
    if (!isChoiceDeclarationField(field)) {
        writer.comment(`Set ${fieldName} (cardinality: ${min}..${max})`);
        if (min > 0) {
            writer.comment(`@param value - Required field (min: ${min})`);
            writer.comment(`@throws Error if value is undefined (field is required)`);
        }
    }

    // For required fields, don't allow undefined in the setter signature
    const setterOptional = min > 0 ? "" : optional;

    writer.curlyBlock(["set " + tsField + "(value:", tsType + arrayMark + setterOptional + ")"], () => {
        // Handle choice field clearing
        if (isChoiceFieldInstance(field)) {
            generateChoiceClearing(writer, profile, fieldName, field.choiceOf);
        }

        // Generate inline validation
        if (field.array) {
            // Array field validation
            generateInlineArrayValidation(writer, tsField, fieldName, min, max);
        } else {
            // Scalar field validation
            generateInlineScalarValidation(writer, tsField, fieldName, min);
        }
    });
}

/**
 * Generate array helper methods (add/remove)
 */
function generateArrayHelpers(
    writer: Writer,
    profile: ProfileTypeSchema,
    tsField: string,
    fieldName: string,
    field: Field,
    tsType: string,
): void {
    const min = field.min ?? 0;
    const max = field.max ?? "*";
    const capitalizedFieldName = tsField.startsWith('"')
        ? fieldName.charAt(0).toUpperCase() + fieldName.slice(1)
        : tsField.charAt(0).toUpperCase() + tsField.slice(1);

    // Generate add method
    writer.comment(`Add a single item to ${fieldName} array`);
    if (max !== "*" && typeof max === "number") {
        writer.comment(`@throws Error if array exceeds max cardinality (${max})`);
    }
    writer.curlyBlock(["add" + capitalizedFieldName + "(item:", tsType + "):", "void"], () => {
        writer.curlyBlock(["if (!this._resource." + tsField + ")"], () => {
            writer.lineSM("this._resource." + tsField + " = []");
        });

        // Max validation before adding
        if (max !== "*" && typeof max === "number") {
            writer.curlyBlock(["if (this._resource." + tsField + ".length >= " + max + ")"], () => {
                writer.lineSM(`throw new Error("${fieldName} cannot exceed ${max} element(s)")`);
            });
        }

        writer.lineSM("this._resource." + tsField + ".push(item)");
    });
    writer.line();

    // Generate remove method
    writer.comment(`Remove item(s) from ${fieldName} array that match the predicate`);
    if (min > 0) {
        writer.comment(`@throws Error if removal would violate min cardinality (${min})`);
    }
    writer.comment("@returns true if any items were removed, false otherwise");
    writer.curlyBlock(
        ["remove" + capitalizedFieldName + "(predicate:", "(item: " + tsType + ") => boolean):", "boolean"],
        () => {
            writer.curlyBlock(["if (!this._resource." + tsField + " || this._resource." + tsField + ".length === 0)"], () => {
                writer.lineSM("return false");
            });

            writer.lineSM("const arr = this._resource." + tsField);
            writer.lineSM("const initialLength = arr.length");
            writer.lineSM("this._resource." + tsField + " = arr.filter(item => !predicate(item))");
            writer.lineSM("const newArr = this._resource." + tsField);
            writer.lineSM("const removed = initialLength - newArr.length");

            // Min validation after removing
            if (min > 0) {
                writer.curlyBlock(["if (removed > 0 && newArr.length < " + min + ")"], () => {
                    writer.lineSM(`throw new Error("${fieldName} must have at least ${min} element(s)")`);
                });
            }

            writer.lineSM("return removed > 0");
        }
    );
    writer.line();
}

/**
 * Generate inline validation for scalar fields
 */
function generateInlineScalarValidation(writer: Writer, tsField: string, fieldName: string, min: number): void {
    if (min > 0) {
        writer.curlyBlock(["if (value === undefined)"], () => {
            writer.lineSM(`throw new Error("${fieldName} is required (min: ${min})")`);
        });
    }
    writer.lineSM(`this._resource.${tsField} = value`);
}

/**
 * Generate inline validation for array fields
 */
function generateInlineArrayValidation(
    writer: Writer,
    tsField: string,
    fieldName: string,
    min: number,
    max: string | number,
): void {
    // Min validation
    if (min > 0) {
        writer.curlyBlock(["if (!value || value.length < " + min + ")"], () => {
            writer.lineSM(`throw new Error("${fieldName} must have at least ${min} element(s)")`);
        });
    }

    // Max validation (only if not *)
    if (max !== "*" && typeof max === "number") {
        writer.curlyBlock(["if (value && value.length > " + max + ")"], () => {
            writer.lineSM(`throw new Error("${fieldName} must have at most ${max} element(s)")`);
        });
    }

    writer.lineSM(`this._resource.${tsField} = value`);
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
