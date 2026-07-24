import {
    type ChoiceFieldInstance,
    type FieldSlicing,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNotChoiceDeclarationField,
    type RegularField,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { pyFieldName } from "./profile-naming";

// ---------------------------------------------------------------------------
// Validation body collection
// ---------------------------------------------------------------------------

/** Emit `<target>.extend(<fn>(self._resource, profile_name, <args>, [<items>]))`
 *  with the call and its trailing list argument split across lines:
 *
 *      errors.extend(
 *          validate_enum(self._resource, profile_name, "code", [
 *              "85353-1","9279-1",...
 *      ]))
 */
const pushListValidation = (lines: string[], target: string, fn: string, args: string[], items: string[]): void => {
    const argList = ["self._resource", "profile_name", ...args].join(", ");
    lines.push(
        `${target}.extend(`,
        `    ${fn}(${argList}, [`,
        `        ${items.map((i) => JSON.stringify(i)).join(",")}`,
        "]))",
    );
};

/** Walk fields once and emit validate() body lines into `out`, returning the
 *  set of helper function names referenced. Pure: no writer side effects. */
export const collectValidateBody = (
    flatProfile: SnapshotProfileTypeSchema,
    tsIndex: TypeSchemaIndex,
    errorLines: string[],
    warningLines: string[],
    formatName: (s: string) => string,
): Set<string> => {
    const helpers = new Set<string>();
    const fields = flatProfile.fields;
    for (const [name, field] of Object.entries(fields)) {
        const pyName = pyFieldName(name, formatName);
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) {
            if (field.required) {
                helpers.add("validate_choice_required");
                const pyChoices = field.choices.map((c) => pyFieldName(c, formatName));
                pushListValidation(errorLines, "errors", "validate_choice_required", [], pyChoices);
            }
            if (field.prohibited?.length) {
                helpers.add("validate_choice_prohibited");
                const pyProhibited = field.prohibited.map((c) => pyFieldName(c, formatName));
                pushListValidation(errorLines, "errors", "validate_choice_prohibited", [], pyProhibited);
            }
            continue;
        }
        collectRegularFieldValidation(
            field,
            flatProfile.slicing?.[name],
            pyName,
            helpers,
            errorLines,
            warningLines,
            tsIndex,
            formatName,
        );
    }
    // Base-resource required fields the profile chain did not re-state.
    // Emitted here (not via the regular field loop) because they intentionally
    // live outside `fields` to avoid pulling unrelated base metadata into the
    // profile's getter/setter surface.
    for (const inheritedName of flatProfile.inheritedRequiredFields ?? []) {
        helpers.add("validate_required");
        errorLines.push(
            `errors.extend(validate_required(self._resource, profile_name, ${JSON.stringify(pyFieldName(inheritedName, formatName))}))`,
        );
    }
    return helpers;
};

const collectRegularFieldValidation = (
    field: RegularField | ChoiceFieldInstance,
    fieldSlicing: FieldSlicing | undefined,
    pyName: string,
    helpers: Set<string>,
    errorLines: string[],
    warningLines: string[],
    tsIndex: TypeSchemaIndex,
    formatName: (s: string) => string,
): void => {
    if (field.excluded) {
        helpers.add("validate_excluded");
        errorLines.push(`errors.extend(validate_excluded(self._resource, profile_name, ${JSON.stringify(pyName)}))`);
        return;
    }
    if (field.required) {
        helpers.add("validate_required");
        errorLines.push(`errors.extend(validate_required(self._resource, profile_name, ${JSON.stringify(pyName)}))`);
    }
    if (field.valueConstraint) {
        helpers.add("validate_fixed_value");
        const value = JSON.stringify(field.valueConstraint.value);
        errorLines.push(
            `errors.extend(validate_fixed_value(self._resource, profile_name, ${JSON.stringify(pyName)}, ${value}))`,
        );
    }
    if (isNotChoiceDeclarationField(field)) {
        if (field.enum) {
            helpers.add("validate_enum");
            const target = field.enum.isOpen ? warningLines : errorLines;
            const listName = field.enum.isOpen ? "warnings" : "errors";
            pushListValidation(target, listName, "validate_enum", [JSON.stringify(pyName)], field.enum.values);
        }
        if (field.mustSupport && !field.required) {
            helpers.add("validate_must_support");
            warningLines.push(
                `warnings.extend(validate_must_support(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
            );
        }
        if (field.reference && field.reference.resource.length > 0) {
            helpers.add("validate_reference");
            const allowed = field.reference.resource.map((ref) => tsIndex.findLastSpecializationByIdentifier(ref).name);
            pushListValidation(errorLines, "errors", "validate_reference", [JSON.stringify(pyName)], allowed);
        }
        if (fieldSlicing?.slices) {
            collectSliceValidation(fieldSlicing, pyName, helpers, errorLines, formatName);
        }
    }
};

const collectSliceValidation = (
    fieldSlicing: FieldSlicing,
    name: string,
    helpers: Set<string>,
    errorLines: string[],
    formatName: (s: string) => string,
): void => {
    if (!fieldSlicing.slices) return;
    for (const [sliceName, slice] of Object.entries(fieldSlicing.slices)) {
        const match = slice.match ?? {};
        if (Object.keys(match).length === 0) continue;
        if (slice.min !== undefined || slice.max !== undefined) {
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;
            helpers.add("validate_slice_cardinality");
            errorLines.push(
                `errors.extend(validate_slice_cardinality(self._resource, profile_name, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max}))`,
            );
        }
        // Required fields within the slice element; for a constrained choice
        // the single variant is required
        const sliceRequiredFields = (slice.effectiveRequired ?? []).map((rf) => pyFieldName(rf, formatName));
        if (slice.constrainedChoice) sliceRequiredFields.push(pyFieldName(slice.constrainedChoice.variant, formatName));
        if (sliceRequiredFields.length > 0) {
            helpers.add("validate_slice_fields");
            pushListValidation(
                errorLines,
                "errors",
                "validate_slice_fields",
                [JSON.stringify(name), JSON.stringify(match), JSON.stringify(sliceName)],
                sliceRequiredFields,
            );
        }
    }
};
