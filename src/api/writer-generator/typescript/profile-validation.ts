import { isExtensionOwnedField } from "@root/api/writer-generator/utils";
import {
    type ChoiceFieldInstance,
    type FieldSlicing,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    type RegularField,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { tsProfileClassName } from "./name";
import type { TypeScript } from "./writer";

export const collectRegularFieldValidation = (
    errors: string[],
    warnings: string[],
    name: string,
    field: RegularField | ChoiceFieldInstance,
    resolveRef: (ref: TypeIdentifier) => TypeIdentifier,
    canonicalUrlExpr?: { url: string; expr: string },
    _tsIndex?: TypeSchemaIndex,
    fieldSlicing?: FieldSlicing,
) => {
    if (field.excluded) {
        errors.push(`...validateExcluded(res, profileName, ${JSON.stringify(name)})`);
        return;
    }

    if (field.required) errors.push(`...validateRequired(res, profileName, ${JSON.stringify(name)})`);

    if (field.valueConstraint) {
        const valueExpr =
            canonicalUrlExpr && name === "url" && field.valueConstraint.value === canonicalUrlExpr.url
                ? canonicalUrlExpr.expr
                : JSON.stringify(field.valueConstraint.value);
        errors.push(`...validateFixedValue(res, profileName, ${JSON.stringify(name)}, ${valueExpr})`);
    }

    if (field.enum) {
        const target = field.enum.isOpen ? warnings : errors;
        target.push(`...validateEnum(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.enum.values)})`);
    }

    if (field.mustSupport && !field.required)
        warnings.push(`...validateMustSupport(res, profileName, ${JSON.stringify(name)})`);

    if (field.reference && field.reference.resource.length > 0)
        errors.push(
            `...validateReference(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.reference.resource.map((ref) => resolveRef(ref).name))})`,
        );

    if (fieldSlicing?.slices) {
        for (const [sliceName, slice] of Object.entries(fieldSlicing.slices)) {
            const match = slice.match?.value;
            if (!match) continue;
            if (slice.min !== undefined || slice.max !== undefined) {
                const min = slice.min ?? 0;
                const max = slice.max ?? 0;
                errors.push(
                    `...validateSliceCardinality(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
                );
            }
            // Required fields within the slice element; for a constrained
            // choice the single variant is required
            const sliceRequiredFields = [...(slice.effectiveRequired ?? [])];
            if (slice.constrainedChoice) sliceRequiredFields.push(slice.constrainedChoice.variant);
            if (sliceRequiredFields.length > 0) {
                errors.push(
                    `...validateSliceFields(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${JSON.stringify(sliceRequiredFields)})`,
                );
            }
        }
    }
};

export const generateValidateMethod = (
    w: TypeScript,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
) => {
    const fields = snapshot.fields;
    const profileName = snapshot.identifier.name;
    const canonicalUrl = snapshot.identifier.url;
    const canonicalUrlExpr = canonicalUrl
        ? { url: canonicalUrl, expr: `${tsProfileClassName(snapshot)}.canonicalUrl` }
        : undefined;
    w.curlyBlock(["validate(): { errors: string[]; warnings: string[] }"], () => {
        w.line(`const profileName = "${profileName}"`);
        w.line("const res = this.resource");

        const errors: string[] = [];
        const warnings: string[] = [];
        for (const [name, field] of Object.entries(fields)) {
            if (isChoiceInstanceField(field)) continue;

            if (isChoiceDeclarationField(field)) {
                if (field.required)
                    errors.push(`...validateChoiceRequired(res, profileName, ${JSON.stringify(field.choices)})`);
                if (field.prohibited?.length)
                    errors.push(`...validateChoiceProhibited(res, profileName, ${JSON.stringify(field.prohibited)})`);
                continue;
            }

            collectRegularFieldValidation(
                errors,
                warnings,
                name,
                field,
                tsIndex.findLastSpecializationByIdentifier,
                canonicalUrlExpr,
                tsIndex,
                isExtensionOwnedField(name) && snapshot.base.name !== "Extension"
                    ? undefined
                    : snapshot.slicing?.[name],
            );
        }

        // Base-resource required fields the profile chain did not re-state.
        // Emitted here (not via the regular field loop) because they intentionally
        // live outside `fields` to avoid pulling unrelated base metadata into the
        // profile's getter/setter surface.
        for (const inheritedName of snapshot.inheritedRequiredFields ?? []) {
            errors.push(`...validateRequired(res, profileName, ${JSON.stringify(inheritedName)})`);
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
