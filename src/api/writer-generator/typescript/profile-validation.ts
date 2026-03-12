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
    exprs: string[],
    name: string,
    field: RegularField | ChoiceFieldInstance,
    resolveRef: (ref: Identifier) => Identifier,
) => {
    if (field.excluded) {
        exprs.push(`...validateExcluded(res, profileName, ${JSON.stringify(name)})`);
        return;
    }

    if (field.required) exprs.push(`...validateRequired(res, profileName, ${JSON.stringify(name)})`);

    if (field.valueConstraint)
        exprs.push(
            `...validateFixedValue(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.valueConstraint.value)})`,
        );

    if (field.enum && !field.enum.isOpen)
        exprs.push(`...validateEnum(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.enum.values)})`);

    if (field.reference && field.reference.length > 0)
        exprs.push(
            `...validateReference(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(field.reference.map((ref) => resolveRef(ref).name))})`,
        );

    if (field.slicing?.slices) {
        for (const [sliceName, slice] of Object.entries(field.slicing.slices)) {
            if (slice.min === undefined && slice.max === undefined) continue;
            const match = slice.match ?? {};
            if (Object.keys(match).length === 0) continue;
            const min = slice.min ?? 0;
            const max = slice.max ?? 0;
            exprs.push(
                `...validateSliceCardinality(res, profileName, ${JSON.stringify(name)}, ${JSON.stringify(match)}, ${JSON.stringify(sliceName)}, ${min}, ${max})`,
            );
        }
    }
};

export const generateValidateMethod = (w: TypeScript, tsIndex: TypeSchemaIndex, flatProfile: ProfileTypeSchema) => {
    const fields = flatProfile.fields ?? {};
    const profileName = flatProfile.identifier.name;
    w.curlyBlock(["validate(): string[]"], () => {
        w.line(`const profileName = "${profileName}"`);
        w.line("const res = this.resource");

        const exprs: string[] = [];
        for (const [name, field] of Object.entries(fields)) {
            if (isChoiceInstanceField(field)) continue;

            if (isChoiceDeclarationField(field)) {
                if (field.required)
                    exprs.push(`...validateChoiceRequired(res, profileName, ${JSON.stringify(field.choices)})`);
                continue;
            }

            collectRegularFieldValidation(exprs, name, field, tsIndex.findLastSpecializationByIdentifier);
        }

        if (exprs.length === 0) {
            w.line("return []");
        } else {
            w.squareBlock(["return"], () => {
                for (const expr of exprs) w.line(`${expr},`);
            });
        }
    });
    w.line();
};
