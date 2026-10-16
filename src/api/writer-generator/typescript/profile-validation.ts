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
import type { ProfileSections } from "./profile";
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

/** A bound field must carry a listed code: an error for a closed binding, a warning for an open one. */
const collectEnumValidation = (
    imports: ProfileSections,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    enumExprs?: ReadonlyMap<string, string>,
): { errors: string[]; warnings: string[] } => {
    if (!field.enum) return { errors: [], warnings: [] };
    const valuesExpr = enumExprs?.get(name) ?? JSON.stringify(field.enum.values);
    const check = `...${imports.helper.use("validateEnum")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${valuesExpr})`;
    return field.enum.isOpen ? { errors: [], warnings: [check] } : { errors: [check], warnings: [] };
};

/** A reference must point at one of the field's allowed targets. */
const collectReferenceValidation = (
    imports: ProfileSections,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    tsIndex?: TypeSchemaIndex,
): string[] => {
    const allowed = field.reference ? (tsIndex?.referenceAllowedTypes(field.reference) ?? []) : [];
    if (allowed.length === 0) return [];
    return [
        `...${imports.helper.use("validateReference")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${JSON.stringify(allowed)})`,
    ];
};

export const collectRegularFieldValidation = (
    imports: ProfileSections,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    canonicalUrlExpr?: { url: string; expr: string },
    tsIndex?: TypeSchemaIndex,
    fieldSlicing?: FieldSlicing,
    enumExprs?: ReadonlyMap<string, string>,
): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (field.excluded) {
        errors.push(
            `...${imports.helper.use("validateExcluded")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)})`,
        );
        return { errors, warnings };
    }

    if (field.required)
        errors.push(
            `...${imports.helper.use("validateRequired")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)})`,
        );

    if (field.valueConstraint) {
        const constrainedValueExpr =
            canonicalUrlExpr && name === "url" && field.valueConstraint.value === canonicalUrlExpr.url
                ? canonicalUrlExpr.expr
                : JSON.stringify(field.valueConstraint.value);
        const fn = imports.helper.use(
            field.valueConstraint.validateOnly ? "validatePatternValue" : "validateFixedValue",
        );
        // A constraint on a repeating element applies to every repetition, so
        // the helper needs the declared arity: the instance shape alone cannot
        // tell an array-valued element from a wrong value on a single one.
        const repeating = field.array ? ", true" : "";
        errors.push(
            `...${fn}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${constrainedValueExpr}${repeating})`,
        );
    }

    const enumChecks = collectEnumValidation(imports, name, field, enumExprs);
    errors.push(...enumChecks.errors);
    warnings.push(...enumChecks.warnings);

    if (field.mustSupport && !field.required)
        warnings.push(
            `...${imports.helper.use("validateMustSupport")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)})`,
        );

    errors.push(...collectReferenceValidation(imports, name, field, tsIndex));

    if (fieldSlicing?.slices) {
        for (const [sliceName, slice] of Object.entries(fieldSlicing.slices)) {
            const match = slice.match ?? {};
            if (Object.keys(match).length === 0) continue;
            if (slice.min !== undefined || slice.max !== undefined) {
                const min = slice.min ?? 0;
                const max = slice.max ?? 0;
                errors.push(
                    `...${imports.helper.use("validateSliceCardinality")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
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
                errors.push(
                    `...${imports.helper.use("validateSliceFields")}(res, ${imports.const.use("profileName")}, ${args.join(", ")})`,
                );
            }
        }
    }
    return { errors, warnings };
};

export const generateValidateMethod = (
    w: TypeScript,
    imports: ProfileSections,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
) => {
    const fields = snapshot.fields;
    const canonicalUrl = snapshot.identifier.url;
    const canonicalUrlExpr = canonicalUrl ? { url: canonicalUrl, expr: imports.const.use("canonicalUrl") } : undefined;
    const enumLinks = w.enumTerminologyLinks(tsIndex, snapshot);
    imports.const.def("profileName", JSON.stringify(snapshot.identifier.name));
    w.curlyBlock(["validate(): { errors: string[]; warnings: string[] }"], () => {
        const errors: string[] = [];
        const warnings: string[] = [];
        for (const [name, field] of Object.entries(fields)) {
            // A choice variant's accessors carry its reference targets and binding, so
            // validate those; presence is the choice declaration's check.
            if (isChoiceInstanceField(field)) {
                const enumChecks = collectEnumValidation(imports, name, field, enumLinks.exprs);
                errors.push(...enumChecks.errors, ...collectReferenceValidation(imports, name, field, tsIndex));
                warnings.push(...enumChecks.warnings);
                continue;
            }

            if (isChoiceDeclarationField(field)) {
                if (field.required)
                    errors.push(
                        `...${imports.helper.use("validateChoiceRequired")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(field.choices)})`,
                    );
                if (field.prohibited?.length)
                    errors.push(
                        `...${imports.helper.use("validateChoiceProhibited")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(field.prohibited)})`,
                    );
                continue;
            }

            const validation = collectRegularFieldValidation(
                imports,
                name,
                field,
                canonicalUrlExpr,
                tsIndex,
                snapshot.slicing?.[name],
                enumLinks.exprs,
            );
            errors.push(...validation.errors);
            warnings.push(...validation.warnings);
        }

        // Base-resource required fields the profile chain did not re-state.
        // Emitted here (not via the regular field loop) because they intentionally
        // live outside `fields` to avoid pulling unrelated base metadata into the
        // profile's getter/setter surface.
        for (const inheritedName of snapshot.inheritedRequiredFields ?? []) {
            errors.push(
                `...${imports.helper.use("validateRequired")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(inheritedName)})`,
            );
        }

        if (errors.length + warnings.length > 0) w.line("const res = this.resource");
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
