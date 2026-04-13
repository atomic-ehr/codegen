import {
    type ChoiceFieldInstance,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNotChoiceDeclarationField,
    type ProfileTypeSchema,
    type RegularField,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { pyFieldName } from "./profile-naming";

// ---------------------------------------------------------------------------
// Validation body collection
// ---------------------------------------------------------------------------

/** Walk fields once and emit validate() body lines into `out`, returning the
 *  set of helper function names referenced. Pure: no writer side effects. */
export const collectValidateBody = (
    flatProfile: ProfileTypeSchema,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    errorLines: string[],
    warningLines: string[],
): Set<string> => {
    const helpers = new Set<string>();
    for (const [name, field] of Object.entries(flatProfile.fields ?? {})) {
        const pyName = pyFieldName(name);
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) {
            if (field.required) {
                helpers.add("validate_choice_required");
                const pyChoices = field.choices.map(pyFieldName);
                errorLines.push(
                    `errors.extend(validate_choice_required(self._resource, profile_name, ${JSON.stringify(pyChoices)}))`,
                );
            }
            continue;
        }
        if (field.excluded) {
            helpers.add("validate_excluded");
            errorLines.push(
                `errors.extend(validate_excluded(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
            );
            continue;
        }
        if (field.required) {
            helpers.add("validate_required");
            errorLines.push(
                `errors.extend(validate_required(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
            );
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
                target.push(
                    `${listName}.extend(validate_enum(self._resource, profile_name, ${JSON.stringify(pyName)}, ${JSON.stringify(field.enum.values)}))`,
                );
            }
            if (field.mustSupport && !field.required) {
                helpers.add("validate_must_support");
                warningLines.push(
                    `warnings.extend(validate_must_support(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
                );
            }
            if (field.reference && field.reference.length > 0) {
                helpers.add("validate_reference");
                const allowed = field.reference.map((ref) => resolveRef(ref).name);
                errorLines.push(
                    `errors.extend(validate_reference(self._resource, profile_name, ${JSON.stringify(pyName)}, ${JSON.stringify(allowed)}))`,
                );
            }
            if (field.slicing?.slices) {
                collectSliceCardinalityValidation(field, pyName, helpers, errorLines);
            }
        }
    }
    return helpers;
};

const collectSliceCardinalityValidation = (
    field: RegularField | ChoiceFieldInstance,
    name: string,
    helpers: Set<string>,
    errorLines: string[],
): void => {
    if (!isNotChoiceDeclarationField(field) || !field.slicing?.slices) return;
    for (const [sliceName, slice] of Object.entries(field.slicing.slices)) {
        if (slice.min === undefined && slice.max === undefined) continue;
        const match = slice.match ?? {};
        if (Object.keys(match).length === 0) continue;
        const min = slice.min ?? 0;
        const max = slice.max ?? 0;
        helpers.add("validate_slice_cardinality");
        errorLines.push(
            `errors.extend(validate_slice_cardinality(self._resource, profile_name, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max}))`,
        );
    }
};
