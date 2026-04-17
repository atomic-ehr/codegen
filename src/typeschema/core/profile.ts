import {
    isChoiceDeclarationField,
    isChoiceInstanceField,
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
