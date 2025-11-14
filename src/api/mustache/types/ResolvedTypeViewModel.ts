import type { FieldViewModel } from "@mustache/types/FieldViewModel";
import type { TypeViewModel } from "@mustache/types/TypeViewModel";

export type ResolvedTypeViewModel = TypeViewModel & {
    allFields: FieldViewModel[];
    inheritedFields: FieldViewModel[];
    parents: TypeViewModel[];
    children: TypeViewModel[];

    hasChildren: boolean;
    hasParents: boolean;
    hasInheritedFields: boolean;
};
