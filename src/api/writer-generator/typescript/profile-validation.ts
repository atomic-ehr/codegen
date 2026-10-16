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
import type { ProfileSections } from "./imports";
import type { TypeScript } from "./writer";

type ValidationBody = { errors: string[]; warnings: string[] };

/**
 * Split what a slice element must carry into plain required fields and choice
 * groups. A required choice element (e.g. `value` for a sliced `value[x]`) is
 * satisfied by any one of its permitted typed variants — the choice base name
 * itself is not a FHIR element and can never be present on a conformant
 * resource, so it must never be emitted as a plain required field.
 */
const collectSliceRequirements = (
    tsIndex: TypeSchemaIndex,
    slice: FieldSlice,
    match: Record<string, unknown>,
    field: RegularField | ChoiceFieldInstance,
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
        if (variants && variants.length > 0) choiceGroups.push(variants);
        else requiredFields.push(rf);
    }
    // Constrained choice the slice does not state as required: the single
    // permitted variant stands in for the choice element.
    if (fieldType && slice.elements) {
        const cc = tsIndex.constrainedChoice(fieldType.package, fieldType, slice.elements);
        if (cc && !requiredNames.includes(cc.choiceBase)) requiredFields.push(cc.variant);
    }
    return { requiredFields, choiceGroups };
};

const collectSliceValidation = (
    imports: ProfileSections,
    tsIndex: TypeSchemaIndex,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    fieldSlicing: FieldSlicing,
): string[] => {
    const errors: string[] = [];
    if (!fieldSlicing.slices) return errors;
    for (const [sliceName, slice] of Object.entries(fieldSlicing.slices)) {
        const match = slice.match ?? {};
        if (Object.keys(match).length === 0) continue;
        if (slice.min !== undefined || slice.max !== undefined) {
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;
            errors.push(
                `...${imports.helpers.use("validateSliceCardinality")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
            );
        }
        const { requiredFields, choiceGroups } = collectSliceRequirements(tsIndex, slice, match, field);
        if (requiredFields.length > 0 || choiceGroups.length > 0) {
            const args = [
                JSON.stringify(name),
                JSON.stringify(match),
                JSON.stringify(sliceName),
                JSON.stringify(requiredFields),
            ];
            if (choiceGroups.length > 0) args.push(JSON.stringify(choiceGroups));
            errors.push(
                `...${imports.helpers.use("validateSliceFields")}(res, ${imports.const.use("profileName")}, ${args.join(", ")})`,
            );
        }
    }
    return errors;
};

const collectRegularFieldValidation = (
    imports: ProfileSections,
    tsIndex: TypeSchemaIndex,
    name: string,
    field: RegularField | ChoiceFieldInstance,
    fieldSlicing: FieldSlicing | undefined,
    canonicalUrlExpr: { url: string; expr: string } | undefined,
    enumExprs: ReadonlyMap<string, string>,
): ValidationBody => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (field.excluded) {
        errors.push(
            `...${imports.helpers.use("validateExcluded")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)})`,
        );
        return { errors, warnings };
    }

    if (field.required)
        errors.push(
            `...${imports.helpers.use("validateRequired")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)})`,
        );

    if (field.valueConstraint) {
        const constrainedValueExpr =
            canonicalUrlExpr && name === "url" && field.valueConstraint.value === canonicalUrlExpr.url
                ? canonicalUrlExpr.expr
                : JSON.stringify(field.valueConstraint.value);
        const fn = imports.helpers.use(
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

    if (field.enum) {
        const target = field.enum.isOpen ? warnings : errors;
        const valuesExpr = enumExprs.get(name) ?? JSON.stringify(field.enum.values);
        target.push(
            `...${imports.helpers.use("validateEnum")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${valuesExpr})`,
        );
    }

    if (field.mustSupport && !field.required)
        warnings.push(
            `...${imports.helpers.use("validateMustSupport")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)})`,
        );

    if (field.reference) {
        const allowed = tsIndex.referenceAllowedTypes(field.reference);
        if (allowed.length > 0)
            errors.push(
                `...${imports.helpers.use("validateReference")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(name)}, ${JSON.stringify(allowed)})`,
            );
    }

    if (fieldSlicing?.slices) errors.push(...collectSliceValidation(imports, tsIndex, name, field, fieldSlicing));
    return { errors, warnings };
};

/** Collect validation expressions, registering helper imports at each emitted call. */
const collectValidateBody = (
    imports: ProfileSections,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    canonicalUrlExpr: { url: string; expr: string } | undefined,
    enumExprs: ReadonlyMap<string, string>,
): ValidationBody => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const fields = snapshot.fields;
    for (const [name, field] of Object.entries(fields)) {
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            if (field.required)
                errors.push(
                    `...${imports.helpers.use("validateChoiceRequired")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(field.choices)})`,
                );
            if (field.prohibited?.length)
                errors.push(
                    `...${imports.helpers.use("validateChoiceProhibited")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(field.prohibited)})`,
                );
            continue;
        }

        const validation = collectRegularFieldValidation(
            imports,
            tsIndex,
            name,
            field,
            snapshot.slicing?.[name],
            canonicalUrlExpr,
            enumExprs,
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
            `...${imports.helpers.use("validateRequired")}(res, ${imports.const.use("profileName")}, ${JSON.stringify(inheritedName)})`,
        );
    }
    return { errors, warnings };
};

export const generateValidateMethod = (
    w: TypeScript,
    imports: ProfileSections,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
) => {
    const canonicalUrl = snapshot.identifier.url;
    const canonicalUrlExpr = canonicalUrl ? { url: canonicalUrl, expr: imports.const.use("canonicalUrl") } : undefined;
    const enumLinks = w.enumTerminologyLinks(tsIndex, snapshot);
    imports.const.def("profileName", JSON.stringify(snapshot.identifier.name));
    w.curlyBlock(["validate(): { errors: string[]; warnings: string[] }"], () => {
        const { errors, warnings } = collectValidateBody(imports, tsIndex, snapshot, canonicalUrlExpr, enumLinks.exprs);
        if (errors.length + warnings.length > 0) w.line("const res = this.resource");
        const generateArray = (label: string, exprs: string[]) => {
            if (exprs.length === 0) {
                w.line(`${label}: [],`);
            } else {
                w.squareBlock([`${label}:`], () => {
                    for (const expr of exprs) w.line(`${expr},`);
                }, [","]);
            }
        };
        w.curlyBlock(["return"], () => {
            generateArray("errors", errors);
            generateArray("warnings", warnings);
        });
    });
    w.line();
};
