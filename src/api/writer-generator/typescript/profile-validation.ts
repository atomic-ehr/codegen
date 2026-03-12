import {
    type ChoiceFieldInstance,
    type Identifier,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    type ProfileTypeSchema,
    type RegularField,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { TypeScript } from "./writer";

export const collectRegularFieldValidation = (
    errors: string[],
    warnings: string[],
    name: string,
    field: RegularField | ChoiceFieldInstance,
    resolveRef: (ref: Identifier) => Identifier,
) => {
    if (field.excluded) {
        errors.push(`...validateExcluded(res, profileName, ${JSON.stringify(name)})`);
        return;
    }

    if (field.required) errors.push(`...validateRequired(res, profileName, ${JSON.stringify(name)})`);

    if (field.valueConstraint)
        errors.push(
            `...validateFixedValue(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.valueConstraint.value)})`,
        );

    if (field.enum) {
        const target = field.enum.isOpen ? warnings : errors;
        target.push(`...validateEnum(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.enum.values)})`);
    }

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
                continue;
            }

            collectRegularFieldValidation(errors, warnings, name, field, tsIndex.findLastSpecializationByIdentifier);
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
