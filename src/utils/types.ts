import type { Log, LogManager } from "./log";

export type CapitalizeFirst<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;

export type IsPrefixed<T extends string> = `is${CapitalizeFirst<T>}`;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type CodegenTag =
    | "BINDING"
    | "LARGE_VALUESET"
    | "FIELD_TYPE_NOT_FOUND"
    | "SKIP_CANONICAL"
    | "DUPLICATE_SCHEMA"
    | "DUPLICATE_CANONICAL"
    | "RESOLVE_BASE";

export type CodegenLog = Log<CodegenTag>;
export type CodegenLogManager = LogManager<CodegenTag>;
