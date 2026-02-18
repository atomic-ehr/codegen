type TagsOf<L> = L extends Logger<infer T> ? T : never;

export type ExtendLogger<Extra extends string, Parent extends Logger<any>> = Logger<TagsOf<Parent> | Extra>;

export type LogLevel = "info" | "warn" | "error" | "debug";

export type LogEntry<T extends string = string> = {
    level: LogLevel;
    tag?: T;
    message: string;
    suppressed: boolean;
    prefix: string;
    timestamp: number;
};

export type LoggerOptions<T extends string> = {
    prefix?: string;
    suppressTags?: T[];
    level?: LogLevel;
};

export type TaggedLogFn<T extends string> = {
    (msg: string): void;
    (tag: T, msg: string): void;
};

export type Logger<T extends string = string> = {
    warn: TaggedLogFn<T>;
    dryWarn: TaggedLogFn<T>;
    info: TaggedLogFn<T>;
    error: TaggedLogFn<T>;
    debug: TaggedLogFn<T>;

    fork<C extends string = T>(prefix: string, opts?: Partial<LoggerOptions<C>>): Logger<C>;
    as<Narrower extends string>(): Logger<Narrower>;

    suppress(...tags: T[]): void;
    setLevel(level: LogLevel): void;
    tagCounts(): ReadonlyMap<string, number>;
    printSuppressedSummary(): void;

    buffer(): readonly LogEntry<T>[];
    bufferClear(): void;
};

const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function makeLogger<T extends string>(opts: LoggerOptions<T> = {}): Logger<T> {
    const prefix = opts.prefix ?? "";
    const suppressedSet = new Set<string>(opts.suppressTags ?? []);
    const tagCountsMap = new Map<string, number>();
    const entries: LogEntry<T>[] = [];
    const drySet = new Set<string>();
    let currentLevel: LogLevel = opts.level ?? "info";

    const shouldLog = (level: LogLevel): boolean => LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[currentLevel];

    const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
    const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
    const colorize: Record<LogLevel, (s: string) => string> = {
        debug: (s) => s,
        info: (s) => s,
        warn: yellow,
        error: red,
    };

    const fmt = (level: LogLevel, icon: string, msg: string, tag?: string) => {
        const pfx = prefix ? `[${prefix}] ` : "";
        const tagStr = tag ? `[${tag}] ` : "";
        return colorize[level](`${icon} ${pfx}${tagStr}${msg}`);
    };

    const pushEntry = (level: LogLevel, msg: string, tag?: T, suppressed = false) => {
        entries.push({ level, tag, message: msg, suppressed, prefix, timestamp: Date.now() });
    };

    const parseArgs = (a: string, b?: string): { tag?: T; msg: string } => {
        if (b !== undefined) return { tag: a as T, msg: b };
        return { msg: a };
    };

    const mkLogFn = (level: LogLevel, icon: string, consoleFn: (...args: any[]) => void): TaggedLogFn<T> => {
        return ((a: string, b?: string) => {
            const { tag, msg } = parseArgs(a, b);
            if (tag) tagCountsMap.set(tag, (tagCountsMap.get(tag) ?? 0) + 1);
            const isSuppressed = tag !== undefined && suppressedSet.has(tag);
            pushEntry(level, msg, tag, isSuppressed);
            if (isSuppressed) return;
            if (!shouldLog(level)) return;
            consoleFn(fmt(level, icon, msg, tag));
        }) as TaggedLogFn<T>;
    };

    const mkDryLogFn = (level: LogLevel, icon: string, consoleFn: (...args: any[]) => void): TaggedLogFn<T> => {
        return ((a: string, b?: string) => {
            const { tag, msg } = parseArgs(a, b);
            if (tag) tagCountsMap.set(tag, (tagCountsMap.get(tag) ?? 0) + 1);
            const isSuppressed = tag !== undefined && suppressedSet.has(tag);
            pushEntry(level, msg, tag, isSuppressed);
            if (isSuppressed) return;
            if (!shouldLog(level)) return;
            const dedupeKey = `${level}::${tag ?? ""}::${msg}`;
            if (drySet.has(dedupeKey)) return;
            drySet.add(dedupeKey);
            consoleFn(fmt(level, icon, msg, tag));
        }) as TaggedLogFn<T>;
    };

    const logger: Logger<T> = {
        warn: mkLogFn("warn", "!", console.warn),
        dryWarn: mkDryLogFn("warn", "!", console.warn),
        info: mkLogFn("info", "i", console.log),
        error: mkLogFn("error", "X", console.error),
        debug: mkLogFn("debug", "D", console.log),

        fork<C extends string = T>(childPrefix: string, childOpts?: Partial<LoggerOptions<C>>): Logger<C> {
            const fullPrefix = prefix ? `${prefix}:${childPrefix}` : childPrefix;
            return makeLogger<C>({
                prefix: fullPrefix,
                suppressTags: [...((opts.suppressTags ?? []) as unknown as C[]), ...(childOpts?.suppressTags ?? [])],
                level: childOpts?.level ?? currentLevel,
            });
        },

        as<Narrower extends string>(): Logger<Narrower> {
            return logger as unknown as Logger<Narrower>;
        },

        suppress(...tags: T[]) {
            for (const tag of tags) suppressedSet.add(tag);
        },

        setLevel(level: LogLevel) {
            currentLevel = level;
        },

        tagCounts(): ReadonlyMap<string, number> {
            return tagCountsMap;
        },

        printSuppressedSummary() {
            const suppressed = [...tagCountsMap.entries()]
                .filter(([tag]) => suppressedSet.has(tag))
                .map(([tag, count]) => `${tag}: ${count}`);
            if (suppressed.length > 0) {
                logger.info(`Suppressed: ${suppressed.join(", ")}`);
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
