import type { NamedViewModel } from "@mustache/types/NamedViewModel";
import type { EnumValueViewModel } from "@mustache/types/EnumValueViewModel";

export type EnumViewModel = NamedViewModel & {
    values: EnumValueViewModel[];
};
