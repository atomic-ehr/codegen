import type { LambdaMixin } from "@mustache/types/LambdaMixin";
import type { ViewModel } from "@mustache/types/ViewModel";

export type View<T extends ViewModel> = LambdaMixin & {
    model: T;
    meta: {
        timestamp: string;
        generator: string;
    };
    properties: Record<string, unknown>;
};
