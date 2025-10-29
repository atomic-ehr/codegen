import {FilterType} from "@fscg/generators/mustache/types/FilterType";

export type Rendering = {
    source: string;
    fileNameFormat: string;
    path: string;
    filter?: FilterType;
    properties?: Record<string, any>;
}