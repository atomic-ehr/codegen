import {
    type ChoiceFieldInstance,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    type ProfileTypeSchema,
    type RegularField,
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

    if (field.reference && field.reference.length > 0)
        errors.push(
            `...validateReference(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.reference.map((ref) => resolveRef(ref).name))})`,
        );

    if (field.slicing?.slices) {
        for (const [sliceName, slice] of Object.entries(field.slicing.slices)) {
            if (slice.min === undefined && slice.max === undefined) continue;
            const match = slice.match ?? {};
            if (Object.keys(match).length === 0) continue;
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;
            errors.push(
                `...validateSliceCardinality(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
            );
        }
    }
};

export const generateValidateMethod = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const fields = flatProfile.fields ?? {};
    const profileName = flatProfile.identifier.name;
    const canonicalUrl = flatProfile.identifier.url;
    const canonicalUrlExpr = canonicalUrl
        ? { url: canonicalUrl, expr: `${tsProfileClassName(flatProfile)}.canonicalUrl` }
        : undefined;
    w.curlyBlock(["validate(): { errors: string[]; warnings: string[] }"], () => {
        w.line(`const profileName = "${profileName}"`);
        w.line("const res = this.resource");

        const errors: string[] = [];
        const warnings: string[] = [];
        for (const [name, field] of Object.entries(fields)) {
            if (isChoiceInstanceField(field)) {
                const decl = fields[field.choiceOf];
                if (decl && isChoiceDeclarationField(decl) && decl.prohibited?.includes(name))
                    errors.push(`...validateExcluded(res, profileName, ${JSON.stringify(name)})`);
                continue;
            }

            if (isChoiceDeclarationField(field)) {
                if (field.required)
                    errors.push(`...validateChoiceRequired(res, profileName, ${JSON.stringify(field.choices)})`);
                continue;
            }

            collectRegularFieldValidation(
                errors,
                warnings,
                name,
                field,
                tsIndex.findLastSpecializationByIdentifier,
                canonicalUrlExpr,
            );
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
