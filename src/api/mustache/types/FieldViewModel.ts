import type { Field } from "@typeschema/types";
import type { PrimitiveType } from "@mustache/types/PrimitiveType";
import type { IsPrefixed } from "@mustache/UtilityTypes";
import type { NamedViewModel } from "@mustache/types/NamedViewModel";

export type FieldViewModel = {
    owner: NamedViewModel;

    schema: Field;
    name: string;
    saveName: string;

    typeName: string;

    isSizeConstrained: boolean;
    min?: number;
    max?: number;

    isArray: boolean;
    isRequired: boolean;
    isEnum: boolean;

    isPrimitive: Record<IsPrefixed<PrimitiveType>, boolean> | false;
    isComplexType: Record<IsPrefixed<string>, boolean> | false;
    isResource: Record<IsPrefixed<string>, boolean> | false;

    isCode: boolean;
    isIdentifier: boolean;
    isReference: boolean;
};
