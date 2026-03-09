import pc from "picocolors";

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "SILENT";

export type LogEntry<T extends string = string> = {
    level: LogLevel;
    tag?: T;
    message: string;
    suppressed: boolean;
    prefix: string;
    timestamp: number;
};

export type Log<T extends string = string> = {
    warn: TaggedLogFn<T>;
    dryWarn: TaggedLogFn<T>;
    info: TaggedLogFn<T>;
    error: TaggedLogFn<T>;
    debug: TaggedLogFn<T>;
};

export type LogManager<T extends string = string> = Log<T> & {
    fork(prefix: string, opts?: Partial<LoggerOptions<T>>): LogManager<T>;
    as<Narrower extends string>(): LogManager<Narrower>;

    tagCounts(): Readonly<Record<string, number>>;
    printTagSummary(): void;

    buffer(): readonly LogEntry<T>[];
    bufferClear(): void;
};

type TagsOf<L> = L extends LogManager<infer T> ? T : never;

export type ExtendLogManager<Extra extends string, Parent extends LogManager<any>> = LogManager<TagsOf<Parent> | Extra>;

type TaggedLogFn<T extends string> = (...args: [string] | [T, string]) => void;

export type LoggerOptions<T extends string> = {
    prefix?: string;
    suppressTags?: T[];
    level?: LogLevel;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, SILENT: 4 };

export function mkLogger<T extends string>(opts: LoggerOptions<T> = {}): LogManager<T> {
    const prefix = opts.prefix ?? "";
    const suppressedSet = new Set<string>(opts.suppressTags ?? []);
    const tagCounts: Record<string, number> = {};
    const entries: LogEntry<T>[] = [];
    const drySet = new Set<string>();
    const currentLevel: LogLevel = opts.level ?? "INFO";

    const shouldLog = (level: LogLevel): boolean => LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];

    const colorize: Record<LogLevel, (s: string) => string> = {
        DEBUG: (s) => s,
        INFO: (s) => s,
        WARN: pc.yellow,
        ERROR: pc.red,
        SILENT: (s) => s,
    };

    const fmt = (level: LogLevel, icon: string, msg: string, tag?: string) => {
        const pfx = prefix ? `${prefix}: ` : "";
        const tagSuffix = tag ? ` ${pc.dim(`(${tag})`)}` : "";
        return colorize[level](`${icon} ${pfx}${msg}`) + tagSuffix;
    };

    const pushEntry = (level: LogLevel, msg: string, tag?: T, suppressed = false) => {
        entries.push({ level, tag, message: msg, suppressed, prefix, timestamp: Date.now() });
    };

    const mkLogFn = (
        level: LogLevel,
        icon: string,
        consoleFn: (...args: any[]) => void,
        dedupe = false,
    ): TaggedLogFn<T> => {
        return (...args: [string] | [T, string]) => {
            const tag = args.length === 2 ? args[0] : undefined;
            const msg = args.length === 2 ? args[1] : args[0];
            if (tag) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
            const isSuppressed = tag !== undefined && suppressedSet.has(tag);
            pushEntry(level, msg, tag, isSuppressed);
            if (isSuppressed) return;
            if (!shouldLog(level)) return;
            if (dedupe) {
                const key = `${level}::${tag ?? ""}::${msg}`;
                if (drySet.has(key)) return;
                drySet.add(key);
            }
            consoleFn(fmt(level, icon, msg, tag));
        };
    };

    const logger: LogManager<T> = {
        warn: mkLogFn("WARN", "!", console.warn),
        dryWarn: mkLogFn("WARN", "!", console.warn, true),
        info: mkLogFn("INFO", "i", console.log),
        error: mkLogFn("ERROR", "X", console.error),
        debug: mkLogFn("DEBUG", "D", console.log),

        fork(childPrefix: string, childOpts?: Partial<LoggerOptions<T>>): LogManager<T> {
            const fullPrefix = prefix ? `${prefix}/${childPrefix}` : childPrefix;
            const merged = [...suppressedSet, ...(childOpts?.suppressTags ?? [])] as T[];
            return mkLogger<T>({
                prefix: fullPrefix,
                suppressTags: merged,
                level: childOpts?.level ?? currentLevel,
            });
        },

        as<Narrower extends string>(): LogManager<Narrower> {
            return logger as unknown as LogManager<Narrower>;
        },

        tagCounts(): Readonly<Record<string, number>> {
            return tagCounts;
        },

        printTagSummary() {
            const allTags = Object.entries(tagCounts);
            if (allTags.length === 0) return;
            const pfx = prefix ? `${prefix}: ` : "";
            const emitted = allTags.filter(([tag]) => !suppressedSet.has(tag));
            const suppressed = allTags.filter(([tag]) => suppressedSet.has(tag));
            if (emitted.length > 0) {
                const total = emitted.reduce((sum, [, c]) => sum + c, 0);
                const detail = emitted.map(([tag, c]) => `${tag}: ${c}`).join(", ");
                console.warn(pc.yellow(`! ${pfx}${total} warnings (${detail})`));
            }
            if (suppressed.length > 0) {
                const total = suppressed.reduce((sum, [, c]) => sum + c, 0);
                const detail = suppressed.map(([tag, c]) => `${tag}: ${c}`).join(", ");
                console.log(pc.dim(`i ${pfx}${total} suppressed (${detail})`));
            }
        },

        buffer(): readonly LogEntry<T>[] {
            return entries;
        },

        bufferClear() {
            entries.length = 0;
        },
    };

    return logger;
}
