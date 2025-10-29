import {FieldViewModel} from "@fscg/generators/mustache/types/FieldViewModel";
import {TypeViewModel} from "@fscg/generators/mustache/types/TypeViewModel";


export type ResolvedTypeViewModel = TypeViewModel & {
    allFields: FieldViewModel[];
    inheritedFields: FieldViewModel[];
    parents: TypeViewModel[];
    children: TypeViewModel[];

    hasChildren: boolean;
    hasParents: boolean;
    hasInheritedFields: boolean;
}