import {LambdaMixin} from "@fscg/generators/mustache/types/LambdaMixin";
import {ViewModel} from "@fscg/generators/mustache/types/ViewModel";


export type View<T extends ViewModel> = LambdaMixin & {
    model: T,
    meta: {
        timestamp: string,
        generator: string,
    },
    properties: Record<string, unknown>
}