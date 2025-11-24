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
    suppressLoggingLevel?: LogLevel[] | "all";
    /** Minimum log level to display. Messages below this level are suppressed. Default: INFO */
    level?: LogLevel;
}

/**
 * Simple code generation logger with pretty colors and clean formatting
 */
export class CodegenLogger {
    private options: LogOptions;
    private dryWarnSet: Set<string> = new Set();

    constructor(options: LogOptions = {}) {
        this.options = {
            timestamp: false,
            level: LogLevel.INFO,
            ...options,
        };
    }

    /**
     * Check if a message at the given level should be logged
     */
    private shouldLog(messageLevel: LogLevel): boolean {
        const currentLevel = this.options.level ?? LogLevel.INFO;
        return messageLevel >= currentLevel;
    }

    private static consoleLevelsMap: Record<LogLevel, (...data: any[]) => void> = {
        [LogLevel.INFO]: console.log,
        [LogLevel.WARN]: console.warn,
        [LogLevel.ERROR]: console.error,
        [LogLevel.DEBUG]: console.log,
        [LogLevel.SILENT]: () => {},
    };

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

    private tryWriteToConsole(level: LogLevel, formattedMessage: string): void {
        if (this.isSuppressed(level)) return;
        if (!this.shouldLog(level)) return;
        const logFn = CodegenLogger.consoleLevelsMap[level] || console.log;
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
        if (this.isSuppressed(LogLevel.ERROR)) return;
        if (!this.shouldLog(LogLevel.ERROR)) return;
        console.error(this.formatMessage("X", message, pc.red));
        // Show error details if verbose or log level is DEBUG
        const showDetails = this.options.level === LogLevel.DEBUG;
        if (error && showDetails) {
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
     * Debug message (only shows when log level is DEBUG or verbose is true)
     */
    debug(message: string): void {
        // Debug shows if verbose is true OR log level allows DEBUG
        if (this.shouldLog(LogLevel.DEBUG)) {
            this.tryWriteToConsole(LogLevel.DEBUG, this.formatMessage("🐛", message, pc.magenta));
        }
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
        return new CodegenLogger({
            ...this.options,
            prefix: this.options.prefix ? `${this.options.prefix}:${prefix}` : prefix,
        });
    }

    /**
     * Update options
     */
    configure(options: Partial<LogOptions>): void {
        this.options = { ...this.options, ...options };
    }

    getLevel(): LogLevel {
        return this.options.level ?? LogLevel.INFO;
    }

    setLevel(level: LogLevel): void {
        this.options.level = level;
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
