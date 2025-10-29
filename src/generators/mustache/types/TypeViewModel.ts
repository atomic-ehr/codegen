import {NamedViewModel} from "@fscg/generators/mustache/types/NamedViewModel";
import {NestedTypeSchema, TypeSchema} from "@fscg/typeschema";
import {FieldViewModel} from "@fscg/generators/mustache/types/FieldViewModel";
import {EnumViewModel} from "@fscg/generators/mustache/types/EnumViewModel";
import {IsPrefixed} from "@fscg/generators/mustache/UtilityTypes";
import {ResolvedTypeViewModel} from "@fscg/generators/mustache/types/ResolvedTypeViewModel";

export type TypeViewModel = NamedViewModel & {
    schema: TypeSchema | NestedTypeSchema;
    fields: FieldViewModel[];

    dependencies: {
        resources: NamedViewModel[],
        complexTypes: NamedViewModel[],
    }

    hasFields: boolean;
    hasNestedComplexTypes: boolean;
    hasNestedEnums: boolean;

    isNested: boolean;
    isComplexType: Record<IsPrefixed<string>, boolean> | false;
    isResource: Record<IsPrefixed<string>, boolean> | false;

    nestedComplexTypes: ResolvedTypeViewModel[];
    nestedEnums: EnumViewModel[];
}