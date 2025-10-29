import {NamedViewModel} from "@fscg/generators/mustache/types/NamedViewModel";
import {EnumValueViewModel} from "@fscg/generators/mustache/types/EnumValueViewModel";

export type EnumViewModel = NamedViewModel & {
    values: EnumValueViewModel[];
}