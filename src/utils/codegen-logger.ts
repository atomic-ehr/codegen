/**
 * CodeGen Logger
 *
 * Clean, colorful logging designed for code generation tools
 */

import pc from "picocolors";

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4,
}

export interface LogOptions {
    prefix?: string;
    timestamp?: boolean;
    verbose?: boolean;
    logLevel?: LogLevel;
    suppressLoggingLevel?: LogLevel[] | "all";
}

/**
 * Simple code generation logger with pretty colors and clean formatting
 */
export class CodegenLogger {
    private options: LogOptions;
    private dryWarnSet: Set<string> = new Set();
    private effectiveLogLevel: LogLevel;

    constructor(options: LogOptions = {}) {
        this.options = {
            timestamp: false,
            verbose: false,
            ...options,
        };

        // Calculate effectivFrom our e log level
        // Priority: explicit logLevel > verbose flag > default INFO
        if (this.options.logLevel !== undefined) {
            this.effectiveLogLevel = this.options.logLevel;
        } else if (this.options.verbose) {
            this.effectiveLogLevel = LogLevel.DEBUG;
        } else {
            this.effectiveLogLevel = LogLevel.INFO;
        }
    }

    private static getConsoleMethod(level: LogLevel): (...data: any[]) => void {
        switch (level) {
            case LogLevel.INFO:
                return console.log;
            case LogLevel.WARN:
                return console.warn;
            case LogLevel.ERROR:
                return console.error;
            case LogLevel.DEBUG:
                return console.log;
            case LogLevel.SILENT:
                return () => {};
            default:
                return console.log;
        }
    }

    private formatMessage(level: string, message: string, color: (str: string) => string): string {
        const timestamp = this.options.timestamp ? `${pc.gray(new Date().toLocaleTimeString())} ` : "";
        const prefix = this.options.prefix ? `${pc.cyan(`[${this.options.prefix}]`)} ` : "";
        return `${timestamp}${color(level)} ${prefix}${message}`;
    }

    private isSuppressed(level: LogLevel): boolean {
        return (
            this.options.suppressLoggingLevel === "all" || this.options.suppressLoggingLevel?.includes(level) || false
        );
    }

    private shouldLog(level: LogLevel): boolean {
        // Check if suppressed first
        if (this.isSuppressed(level)) return false;

        // Check against effective log level
        return level >= this.effectiveLogLevel;
    }

    private tryWriteToConsole(level: LogLevel, formattedMessage: string): void {
        if (!this.shouldLog(level)) return;
        const logFn = CodegenLogger.getConsoleMethod(level);
        logFn(formattedMessage);
    }

    /**
     * Success message with checkmark
     */
    success(message: string): void {
        this.tryWriteToConsole(LogLevel.INFO, this.formatMessage("", message, pc.green));
    }

    /**
     * Error message with X mark
     */
    error(message: string, error?: Error): void {
        if (!this.shouldLog(LogLevel.ERROR)) return;
        console.error(this.formatMessage("X", message, pc.red));
        if (error && this.options.verbose) {
            console.error(pc.red(`   ${error.message}`));
            if (error.stack) {
                console.error(pc.gray(error.stack));
            }
        }
    }

    /**
     * Warning message with warning sign
     */
    warn(message: string): void {
        this.tryWriteToConsole(LogLevel.WARN, this.formatMessage("!", message, pc.yellow));
    }

    dry_warn(message: string): void {
        if (!this.dryWarnSet.has(message)) {
            this.warn(message);
            this.dryWarnSet.add(message);
        }
    }

    /**
     * Info message with info icon
     */
    info(message: string): void {
        this.tryWriteToConsole(LogLevel.INFO, this.formatMessage("i", message, pc.blue));
    }

    /**
     * Debug message (only shows when log level is DEBUG)
     */
    debug(message: string): void {
        this.tryWriteToConsole(LogLevel.DEBUG, this.formatMessage("🐛", message, pc.magenta));
    }

    /**
     * Step message with rocket
     */
    step(message: string): void {
        this.tryWriteToConsole(LogLevel.INFO, this.formatMessage("🚀", message, pc.cyan));
    }

    /**
     * Progress message with clock
     */
    progress(message: string): void {
        this.tryWriteToConsole(LogLevel.INFO, this.formatMessage("⏳", message, pc.blue));
    }

    /**
     * Plain message (no icon, just colored text)
     */
    plain(message: string, color: (str: string) => string = (s) => s): void {
        const timestamp = this.options.timestamp ? `${pc.gray(new Date().toLocaleTimeString())} ` : "";
        const prefix = this.options.prefix ? `${pc.cyan(`[${this.options.prefix}]`)} ` : "";
        this.tryWriteToConsole(LogLevel.INFO, `${timestamp}${prefix}${color(message)}`);
    }

    /**
     * Dimmed/gray text for less important info
     */
    dim(message: string): void {
        this.plain(message, pc.gray);
    }

    /**
     * Create a child logger with a prefix
     */
    child(prefix: string): CodegenLogger {
        const child = new CodegenLogger({
            ...this.options,
            prefix: this.options.prefix ? `${this.options.prefix}:${prefix}` : prefix,
        });
        // Ensure child inherits the effective log level
        child.effectiveLogLevel = this.effectiveLogLevel;
        return child;
    }

    /**
     * Update options
     */
    configure(options: Partial<LogOptions>): void {
        this.options = { ...this.options, ...options };

        // Recalculate effective log level
        if (options.logLevel !== undefined) {
            this.effectiveLogLevel = options.logLevel;
        } else if (options.verbose !== undefined) {
            this.effectiveLogLevel = options.verbose ? LogLevel.DEBUG : LogLevel.INFO;
        }
    }
}

/**
 * Quick logging functions for simple usage
 */

const defaultLogger = new CodegenLogger();

export function success(message: string): void {
    defaultLogger.success(message);
}

export function error(message: string, err?: Error): void {
    defaultLogger.error(message, err);
}

export function warn(message: string): void {
    defaultLogger.warn(message);
}

export function info(message: string): void {
    defaultLogger.info(message);
}

function _debug(message: string): void {
    defaultLogger.debug(message);
}

export function step(message: string): void {
    defaultLogger.step(message);
}

function _progress(message: string): void {
    defaultLogger.progress(message);
}

function _plain(message: string, color?: (str: string) => string): void {
    defaultLogger.plain(message, color);
}

export function dim(message: string): void {
    defaultLogger.dim(message);
}

/**
 * Configure the default logger
 */
export function configure(options: Partial<LogOptions>): void {
    defaultLogger.configure(options);
}

/**
 * Create a new logger instance
 */
export function createLogger(options: LogOptions = {}): CodegenLogger {
    return new CodegenLogger(options);
}

/**
 * Convenience functions for common CLI patterns
 */

/**
 * Show a command header with separator
 */
export function header(title: string): void {
    console.log();
    console.log(pc.cyan(pc.bold(`━━━ ${title} ━━━`)));
}

/**
 * Show a section break
 */
function _section(title: string): void {
    console.log();
    console.log(pc.bold(title));
}

/**
 * Show completion message with stats
 */
export function complete(message: string, duration?: number, stats?: Record<string, number>): void {
    let msg = message;
    if (duration) {
        msg += ` ${pc.gray(`(${duration}ms)`)}`;
    }
    success(msg);

    if (stats) {
        Object.entries(stats).forEach(([key, value]) => {
            dim(`  ${key}: ${value}`);
        });
    }
}

/**
 * Show a list of items
 */
export function list(items: string[], bullet = "•"): void {
    items.forEach((item) => {
        console.log(pc.gray(`  ${bullet} ${item}`));
    });
}

/**
 * Show key-value pairs
 */
function _table(data: Record<string, string | number>): void {
    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));
    Object.entries(data).forEach(([key, value]) => {
        const paddedKey = key.padEnd(maxKeyLength);
        console.log(`  ${pc.blue(paddedKey)} ${pc.gray("─")} ${value}`);
    });
}
