import {ClassField} from "@fscg/typeschema";
import {PrimitiveType} from "@fscg/generators/mustache/types/PrimitiveType";
import {IsPrefixed} from "@fscg/generators/mustache/UtilityTypes";
import {TypeViewModel} from "@fscg/generators/mustache/types/TypeViewModel";
import {NamedViewModel} from "@fscg/generators/mustache/types/NamedViewModel";

export type FieldViewModel = {
    owner: NamedViewModel;

    schema: ClassField;
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
}