import {
    type ChoiceFieldInstance,
    type FieldSlice,
    type FieldSlicing,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    type RegularField,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { tsProfileClassName } from "./name";
import type { TypeScript } from "./writer";

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
    tsIndex?: TypeSchemaIndex,
): { requiredFields: string[]; choiceGroups: string[][] } => {
    const requiredFields: string[] = [];
    const choiceGroups: string[][] = [];
    const matchKeys = new Set(Object.keys(match));
    const requiredNames = (slice.required ?? []).filter((rf) => !matchKeys.has(rf));
    const fieldType = field.type;
    for (const rf of requiredNames) {
        const variants =
            tsIndex && fieldType
                ? tsIndex.sliceChoiceVariants(fieldType.package, fieldType, slice.elements ?? [], rf)
                : undefined;
        if (variants && variants.length > 0) choiceGroups.push(variants);
        else requiredFields.push(rf);
    }
    // Constrained choice the slice does not state as required: the single
    // permitted variant stands in for the choice element.
    if (tsIndex && fieldType && slice.elements) {
        const cc = tsIndex.constrainedChoice(fieldType.package, fieldType, slice.elements);
        if (cc && !requiredNames.includes(cc.choiceBase)) requiredFields.push(cc.variant);
    }
    return { requiredFields, choiceGroups };
};

export const collectRegularFieldValidation = (
    errors: string[],
    warnings: string[],
    helpers: Set<string>,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    canonicalUrlExpr?: { url: string; expr: string },
    tsIndex?: TypeSchemaIndex,
    fieldSlicing?: FieldSlicing,
    enumExprs?: ReadonlyMap<string, string>,
) => {
    if (field.excluded) {
        helpers.add("validateExcluded");
        errors.push(`...validateExcluded(res, profileName, ${JSON.stringify(name)})`);
        return;
    }

    if (field.required) {
        helpers.add("validateRequired");
        errors.push(`...validateRequired(res, profileName, ${JSON.stringify(name)})`);
    }

    if (field.valueConstraint) {
        const constrainedValueExpr =
            canonicalUrlExpr && name === "url" && field.valueConstraint.value === canonicalUrlExpr.url
                ? canonicalUrlExpr.expr
                : JSON.stringify(field.valueConstraint.value);
        const fn = field.valueConstraint.validateOnly ? "validatePatternValue" : "validateFixedValue";
        // A constraint on a repeating element applies to every repetition, so
        // the helper needs the declared arity: the instance shape alone cannot
        // tell an array-valued element from a wrong value on a single one.
        const repeating = field.array ? ", true" : "";
        helpers.add(fn);
        errors.push(`...${fn}(res, profileName, ${JSON.stringify(name)}, ${constrainedValueExpr}${repeating})`);
    }

    if (field.enum) {
        const target = field.enum.isOpen ? warnings : errors;
        const valuesExpr = enumExprs?.get(name) ?? JSON.stringify(field.enum.values);
        helpers.add("validateEnum");
        target.push(`...validateEnum(res, profileName, ${JSON.stringify(name)}, ${valuesExpr})`);
    }

    if (field.mustSupport && !field.required) {
        helpers.add("validateMustSupport");
        warnings.push(`...validateMustSupport(res, profileName, ${JSON.stringify(name)})`);
    }

    if (field.reference) {
        const allowed = tsIndex?.referenceAllowedTypes(field.reference) ?? [];
        if (allowed.length > 0) {
            helpers.add("validateReference");
            errors.push(`...validateReference(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(allowed)})`);
        }
    }

    if (fieldSlicing?.slices) {
        for (const [sliceName, slice] of Object.entries(fieldSlicing.slices)) {
            const match = slice.match ?? {};
            if (Object.keys(match).length === 0) continue;
            if (slice.min !== undefined || slice.max !== undefined) {
                const min = slice.min ?? 0;
                const max = slice.max ?? 0;
                helpers.add("validateSliceCardinality");
                errors.push(
                    `...validateSliceCardinality(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
                );
            }
            const { requiredFields, choiceGroups } = collectSliceRequirements(slice, match, field, tsIndex);
            if (requiredFields.length > 0 || choiceGroups.length > 0) {
                const args = [
                    JSON.stringify(name),
                    JSON.stringify(match),
                    JSON.stringify(sliceName),
                    JSON.stringify(requiredFields),
                ];
                if (choiceGroups.length > 0) args.push(JSON.stringify(choiceGroups));
                helpers.add("validateSliceFields");
                errors.push(`...validateSliceFields(res, profileName, ${args.join(", ")})`);
            }
        }
    }
};

export type ValidateBody = { errors: string[]; warnings: string[]; helpers: Set<string> };

export const collectValidateBody = (
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    enumExprs: ReadonlyMap<string, string>,
): ValidateBody => {
    const canonicalUrl = snapshot.identifier.url;
    const canonicalUrlExpr = canonicalUrl
        ? { url: canonicalUrl, expr: `${tsProfileClassName(snapshot)}.canonicalUrl` }
        : undefined;
    const errors: string[] = [];
    const warnings: string[] = [];
    const helpers = new Set<string>();
    for (const [name, field] of Object.entries(snapshot.fields)) {
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            if (field.required) {
                helpers.add("validateChoiceRequired");
                errors.push(`...validateChoiceRequired(res, profileName, ${JSON.stringify(field.choices)})`);
            }
            if (field.prohibited?.length) {
                helpers.add("validateChoiceProhibited");
                errors.push(`...validateChoiceProhibited(res, profileName, ${JSON.stringify(field.prohibited)})`);
            }
            continue;
        }

        collectRegularFieldValidation(
            errors,
            warnings,
            helpers,
            name,
            field,
            canonicalUrlExpr,
            tsIndex,
            snapshot.slicing?.[name],
            enumExprs,
        );
    }

    // Base-resource required fields the profile chain did not re-state.
    // Emitted here (not via the regular field loop) because they intentionally
    // live outside `fields` to avoid pulling unrelated base metadata into the
    // profile's getter/setter surface.
    for (const inheritedName of snapshot.inheritedRequiredFields ?? []) {
        helpers.add("validateRequired");
        errors.push(`...validateRequired(res, profileName, ${JSON.stringify(inheritedName)})`);
    }
    return { errors, warnings, helpers };
};

export const generateValidateMethod = (
    w: TypeScript,
    snapshot: SnapshotProfileTypeSchema,
    { errors, warnings }: ValidateBody,
) => {
    w.curlyBlock(["validate(): { errors: string[]; warnings: string[] }"], () => {
        if (errors.length + warnings.length > 0) {
            w.line(`const profileName = "${snapshot.identifier.name}"`);
            w.line("const res = this.resource");
        }
        const emitArray = (label: string, exprs: string[]) => {
            if (exprs.length === 0) {
                w.line(`${label}: [],`);
            } else {
                w.squareBlock([`${label}:`], () => {
                    for (const expr of exprs) w.line(`${expr},`);
                }, [","]);
            }
        };
        w.curlyBlock(["return"], () => {
            emitArray("errors", errors);
            emitArray("warnings", warnings);
        });
    });
    w.line();
};
