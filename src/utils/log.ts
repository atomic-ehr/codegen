import { type Log, type LoggerOptions, type LogManager, mkLogger } from "./common-log";

export type {
    ExtendLogManager,
    Log,
    LogEntry,
    LoggerOptions,
    LogLevel,
    LogManager,
} from "./common-log";
export { mkLogger } from "./common-log";

export type CodegenTag =
    | "#binding"
    | "#largeValueSet"
    | "#fieldTypeNotFound"
    | "#skipCanonical"
    | "#duplicateSchema"
    | "#duplicateCanonical"
    | "#resolveBase"
    | "#resolveCollisionMiss";

export type CodegenLog = Log<CodegenTag>;
export type CodegenLogManager = LogManager<CodegenTag>;

export const mkCodegenLogger = (opts: LoggerOptions<CodegenTag> = {}) => mkLogger<CodegenTag>(opts);
