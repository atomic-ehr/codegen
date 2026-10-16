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
import type { ProfileImports } from "./imports";
import { pyLiteral } from "./naming-utils";
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
const buildListValidation = (target: string, fn: string, args: string[], items: unknown[]): string[] => {
    const argList = ["self._resource", "profile_name", ...args].join(", ");
    return [
        `${target}.extend(`,
        `    ${fn}(${argList}, [`,
        `        ${items.map((i) => JSON.stringify(i)).join(",")}`,
        "]))",
    ];
};

type ValidationBody = { errorLines: string[]; warningLines: string[] };

/** Collect validation expressions, registering helper imports at each emitted call. */
export const collectValidateBody = (
    imports: ProfileImports,
    flatProfile: SnapshotProfileTypeSchema,
    tsIndex: TypeSchemaIndex,
    formatName: (s: string) => string,
): ValidationBody => {
    const errorLines: string[] = [];
    const warningLines: string[] = [];
    const fields = flatProfile.fields;
    for (const [name, field] of Object.entries(fields)) {
        const pyName = pyFieldName(name, formatName);
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) {
            if (field.required) {
                const pyChoices = field.choices.map((c) => pyFieldName(c, formatName));
                errorLines.push(
                    ...buildListValidation("errors", imports.helpers.use("validate_choice_required"), [], pyChoices),
                );
            }
            if (field.prohibited?.length) {
                const pyProhibited = field.prohibited.map((c) => pyFieldName(c, formatName));
                errorLines.push(
                    ...buildListValidation(
                        "errors",
                        imports.helpers.use("validate_choice_prohibited"),
                        [],
                        pyProhibited,
                    ),
                );
            }
            continue;
        }
        const validation = collectRegularFieldValidation(
            imports,
            field,
            flatProfile.slicing?.[name],
            pyName,
            tsIndex,
            formatName,
        );
        errorLines.push(...validation.errorLines);
        warningLines.push(...validation.warningLines);
    }
    // Base-resource required fields the profile chain did not re-state.
    // Emitted here (not via the regular field loop) because they intentionally
    // live outside `fields` to avoid pulling unrelated base metadata into the
    // profile's getter/setter surface.
    for (const inheritedName of flatProfile.inheritedRequiredFields ?? []) {
        errorLines.push(
            `errors.extend(${imports.helpers.use("validate_required")}(self._resource, profile_name, ${JSON.stringify(pyFieldName(inheritedName, formatName))}))`,
        );
    }
    return { errorLines, warningLines };
};

const collectRegularFieldValidation = (
    imports: ProfileImports,
    field: RegularField | ChoiceFieldInstance,
    fieldSlicing: FieldSlicing | undefined,
    pyName: string,
    tsIndex: TypeSchemaIndex,
    formatName: (s: string) => string,
): ValidationBody => {
    const errorLines: string[] = [];
    const warningLines: string[] = [];
    if (field.excluded) {
        errorLines.push(
            `errors.extend(${imports.helpers.use("validate_excluded")}(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
        );
        return { errorLines, warningLines };
    }
    if (field.required) {
        errorLines.push(
            `errors.extend(${imports.helpers.use("validate_required")}(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
        );
    }
    if (field.valueConstraint) {
        const fn = imports.helpers.use(
            field.valueConstraint.validateOnly ? "validate_pattern_value" : "validate_fixed_value",
        );

        const value = pyLiteral(field.valueConstraint.value);
        // A constraint on a repeating element applies to every repetition, so
        // the helper needs the declared arity: the instance shape alone cannot
        // tell an array-valued element from a wrong value on a single one.
        const repeating = field.array ? ", True" : "";
        errorLines.push(
            `errors.extend(${fn}(self._resource, profile_name, ${JSON.stringify(pyName)}, ${value}${repeating}))`,
        );
    }
    if (isNotChoiceDeclarationField(field)) {
        if (field.enum) {
            const target = field.enum.isOpen ? warningLines : errorLines;
            const listName = field.enum.isOpen ? "warnings" : "errors";
            target.push(
                ...buildListValidation(
                    listName,
                    imports.helpers.use("validate_enum"),
                    [JSON.stringify(pyName)],
                    field.enum.values,
                ),
            );
        }
        if (field.mustSupport && !field.required) {
            warningLines.push(
                `warnings.extend(${imports.helpers.use("validate_must_support")}(self._resource, profile_name, ${JSON.stringify(pyName)}))`,
            );
        }
        if (field.reference) {
            const allowed = tsIndex.referenceAllowedTypes(field.reference);
            if (allowed.length > 0) {
                errorLines.push(
                    ...buildListValidation(
                        "errors",
                        imports.helpers.use("validate_reference"),
                        [JSON.stringify(pyName)],
                        allowed,
                    ),
                );
            }
        }
        if (fieldSlicing?.slices) {
            errorLines.push(...collectSliceValidation(imports, field, fieldSlicing, pyName, tsIndex, formatName));
        }
    }
    return { errorLines, warningLines };
};

/**
 * Split what a slice element must carry into plain required fields and choice
 * groups. A required choice element (e.g. `value` for a sliced `value[x]`) is
 * satisfied by any one of its permitted typed variants — the choice base name
 * itself is not a FHIR element and can never be present on a conformant
 * resource, so it must never be emitted as a plain required field.
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
    imports: ProfileImports,
    field: RegularField | ChoiceFieldInstance,
    fieldSlicing: FieldSlicing,
    name: string,
    tsIndex: TypeSchemaIndex,
    formatName: (s: string) => string,
): string[] => {
    const errorLines: string[] = [];
    if (!fieldSlicing.slices) return errorLines;
    for (const [sliceName, slice] of Object.entries(fieldSlicing.slices)) {
        const match = slice.match ?? {};
        if (Object.keys(match).length === 0) continue;
        if (slice.min !== undefined || slice.max !== undefined) {
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;

            errorLines.push(
                `errors.extend(${imports.helpers.use("validate_slice_cardinality")}(self._resource, profile_name, ${JSON.stringify(name)}, ${pyLiteral(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max}))`,
            );
        }
        const { requiredFields, choiceGroups } = collectSliceRequirements(slice, match, field, tsIndex, formatName);
        if (requiredFields.length === 0 && choiceGroups.length === 0) continue;

        const args = [JSON.stringify(name), pyLiteral(match), JSON.stringify(sliceName)];
        if (choiceGroups.length === 0) {
            errorLines.push(
                ...buildListValidation("errors", imports.helpers.use("validate_slice_fields"), args, requiredFields),
            );
            continue;
        }
        // The choice groups become the trailing list argument, so the plain
        // required fields move into the inline argument list.
        errorLines.push(
            ...buildListValidation(
                "errors",
                imports.helpers.use("validate_slice_fields"),
                [...args, JSON.stringify(requiredFields)],
                choiceGroups,
            ),
        );
    }
    return errorLines;
};
