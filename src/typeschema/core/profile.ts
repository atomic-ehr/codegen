import {
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNotChoiceDeclarationField,
    isResourceIdentifier,
    type ProfileTypeSchema,
    type TypeIdentifier,
} from "../types";

export type FixedField = {
    array: boolean;
    typeId?: TypeIdentifier;
    value: unknown;
};

/** Collect fields with fixed values (valueConstraint) from a constraint profile. */
export const collectFixedFields = (flatProfile: ProfileTypeSchema): Record<string, FixedField> => {
    const result: Record<string, FixedField> = {};

    if (isResourceIdentifier(flatProfile.base)) {
        result.resourceType = { value: flatProfile.base.name, array: false };
    }

    Object.entries(flatProfile.fields ?? []).forEach(([name, field]) => {
        if (field.excluded) return;
        if (isChoiceInstanceField(field) || isChoiceDeclarationField(field)) return;
        if (!field.valueConstraint) return;
        result[name] = {
            value: field.valueConstraint.value,
            array: field.array ?? false,
            typeId: field.type,
        };
    });

    return result;
};

export type SliceAutoField = {
    sliceNames: string[];
    typeId: TypeIdentifier;
};

/** Collect array fields with required slices that can be auto-populated from discriminator match alone. */
export const collectSliceAutoFields = (flatProfile: ProfileTypeSchema): Record<string, SliceAutoField> => {
    const fixedFields = collectFixedFields(flatProfile);

    const result: Record<string, SliceAutoField> = {};

    Object.entries(flatProfile.fields ?? []).forEach(([name, field]) => {
        if (field.excluded || name in fixedFields) return;
        if (!isNotChoiceDeclarationField(field) || !field.array || !field.type) return;
        if (!field.slicing?.slices) return;
        if (field.slicing.discriminator?.some((d) => d.type === "type")) return;
        const sliceNames = Object.entries(field.slicing.slices)
            .filter(([_, s]) => {
                if (s.min === undefined || s.min < 1 || !s.match || Object.keys(s.match).length === 0) return false;
                const matchKeys = new Set(Object.keys(s.match));
                return (s.required ?? []).every((n) => matchKeys.has(n));
            })
            .map(([n]) => n);
        if (sliceNames.length > 0) {
            result[name] = { sliceNames, typeId: field.type };
        }
    });

    return result;
};
