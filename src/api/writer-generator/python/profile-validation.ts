import {
    type ChoiceFieldInstance,
    type FieldSlice,
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
const pushListValidation = (lines: string[], target: string, fn: string, args: string[], items: unknown[]): void => {
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
        const fn = field.valueConstraint.validateOnly ? "validate_pattern_value" : "validate_fixed_value";
        helpers.add(fn);
        const value = JSON.stringify(field.valueConstraint.value);
        errorLines.push(`errors.extend(${fn}(self._resource, profile_name, ${JSON.stringify(pyName)}, ${value}))`);
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
            collectSliceValidation(field, fieldSlicing, pyName, helpers, errorLines, tsIndex, formatName);
        }
    }
};

/**
 * Split what a slice element must carry into plain required fields and choice
 * groups. A required choice element (e.g. `value` for a sliced `value[x]`) is
 * satisfied by any one of its permitted typed variants — the choice base name
 * itself is not a FHIR element and can never be present on a conformant
 * resource, so it must never be emitted as a plain required field.
 *
 * Mirrors `collectSliceRequirements` in the TypeScript writer.
 */
const collectSliceRequirements = (
    slice: FieldSlice,
    match: Record<string, unknown>,
    field: RegularField | ChoiceFieldInstance,
    tsIndex: TypeSchemaIndex,
    formatName: (s: string) => string,
): { requiredFields: string[]; choiceGroups: string[][] } => {
    const requiredFields: string[] = [];
    const choiceGroups: string[][] = [];
    const matchKeys = new Set(Object.keys(match));
    const requiredNames = (slice.required ?? []).filter((rf) => !matchKeys.has(rf));
    const fieldType = field.type;
    for (const rf of requiredNames) {
        const variants = fieldType
            ? tsIndex.sliceChoiceVariants(fieldType.package, fieldType, slice.elements ?? [], rf)
            : undefined;
        if (variants && variants.length > 0) choiceGroups.push(variants.map((v) => pyFieldName(v, formatName)));
        else requiredFields.push(pyFieldName(rf, formatName));
    }
    // Constrained choice the slice does not state as required: the single
    // permitted variant stands in for the choice element.
    if (fieldType && slice.elements) {
        const cc = tsIndex.constrainedChoice(fieldType.package, fieldType, slice.elements);
        if (cc && !requiredNames.includes(cc.choiceBase)) requiredFields.push(pyFieldName(cc.variant, formatName));
    }
    return { requiredFields, choiceGroups };
};

const collectSliceValidation = (
    field: RegularField | ChoiceFieldInstance,
    fieldSlicing: FieldSlicing,
    name: string,
    helpers: Set<string>,
    errorLines: string[],
    tsIndex: TypeSchemaIndex,
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
        const { requiredFields, choiceGroups } = collectSliceRequirements(slice, match, field, tsIndex, formatName);
        if (requiredFields.length === 0 && choiceGroups.length === 0) continue;
        helpers.add("validate_slice_fields");
        const args = [JSON.stringify(name), JSON.stringify(match), JSON.stringify(sliceName)];
        if (choiceGroups.length === 0) {
            pushListValidation(errorLines, "errors", "validate_slice_fields", args, requiredFields);
            continue;
        }
        // The choice groups become the trailing list argument, so the plain
        // required fields move into the inline argument list.
        pushListValidation(
            errorLines,
            "errors",
            "validate_slice_fields",
            [...args, JSON.stringify(requiredFields)],
            choiceGroups,
        );
    }
};
