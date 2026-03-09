import { type Log, type LogManager, mkLogger } from "./log";

export type CapitalizeFirst<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;

export type IsPrefixed<T extends string> = `is${CapitalizeFirst<T>}`;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type CodegenTag =
    | "#binding"
    | "#largeValueSet"
    | "#fieldTypeNotFound"
    | "#skipCanonical"
    | "#duplicateSchema"
    | "#duplicateCanonical"
    | "#resolveBase";

export type CodegenLog = Log<CodegenTag>;
export type CodegenLogManager = LogManager<CodegenTag>;

export const mkCodegenLogger = (
    opts: { prefix?: string; suppressTags?: CodegenTag[]; level?: "DEBUG" | "INFO" | "WARN" | "ERROR" | "SILENT" } = {},
) => mkLogger<CodegenTag>(opts);
