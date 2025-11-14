import type { NamedViewModel } from "@mustache/types/NamedViewModel";
import type { NestedType, TypeSchema } from "@typeschema/types";
import type { FieldViewModel } from "@mustache/types/FieldViewModel";
import type { EnumViewModel } from "@mustache/types/EnumViewModel";
import type { IsPrefixed } from "@mustache/UtilityTypes";
import type { ResolvedTypeViewModel } from "@mustache/types/ResolvedTypeViewModel";

export type TypeViewModel = NamedViewModel & {
    schema: TypeSchema | NestedType;
    fields: FieldViewModel[];

    dependencies: {
        resources: NamedViewModel[];
        complexTypes: NamedViewModel[];
    };

    hasFields: boolean;
    hasNestedComplexTypes: boolean;
    hasNestedEnums: boolean;

    isNested: boolean;
    isComplexType: Record<IsPrefixed<string>, boolean> | false;
    isResource: Record<IsPrefixed<string>, boolean> | false;

    nestedComplexTypes: ResolvedTypeViewModel[];
    nestedEnums: EnumViewModel[];
};
