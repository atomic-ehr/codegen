/**
 * Structured Logging System for Atomic Codegen
 *
 * Provides configurable logging with levels, structured output, and context
 */

/**
 * Log levels in order of severity
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4,
}

/**
 * Log entry structure
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    levelName: string;
    message: string;
    context?: Record<string, unknown>;
    error?: {
        name: string;
        message: string;
        code?: string;
        stack?: string;
        context?: Record<string, unknown>;
        suggestions?: string[];
    };
    component?: string;
    operation?: string;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
    level: LogLevel;
    format: "json" | "pretty" | "compact";
    includeTimestamp: boolean;
    includeContext: boolean;
    colorize: boolean;
    component?: string;
    outputs: LogOutput[];
}

/**
 * Log output interface
 */
export interface LogOutput {
    write(entry: LogEntry, formatted: string): void | Promise<void>;
}

/**
 * Logger interface for type safety
 */
export interface ILogger {
    debug(message: string, context?: Record<string, unknown>): Promise<void>;
    info(message: string, context?: Record<string, unknown>): Promise<void>;
    warn(message: string, context?: Record<string, unknown>): Promise<void>;
    error(message: string, error?: Error, context?: Record<string, unknown>): Promise<void>;
    child(component: string): ILogger;
}

/**
 * Console output implementation
 */
export class ConsoleOutput implements LogOutput {
    constructor(private useStderr = false) {}

    write(entry: LogEntry, formatted: string): void {
        const output = this.useStderr || entry.level >= LogLevel.WARN ? console.error : console.log;
        output(formatted);
    }
}

/**
 * File output implementation
 */
export class FileOutput implements LogOutput {
    constructor(private filePath: string) {}

    async write(_entry: LogEntry, formatted: string): Promise<void> {
        const _file = Bun.file(this.filePath);
        const content = `${formatted}\n`;

        try {
            // Append to file
            await Bun.write(this.filePath, content, { createPath: true });
        } catch (error) {
            // Fallback to console if file write fails
            console.error(`Failed to write to log file ${this.filePath}:`, error);
            console.error(formatted);
        }
    }
}

/**
 * Main logger class
 */
export class Logger {
    private config: LoggerConfig;

    constructor(config: Partial<LoggerConfig> = {}) {
        this.config = {
            level: LogLevel.INFO,
            format: "pretty",
            includeTimestamp: true,
            includeContext: true,
            colorize: true,
            outputs: [new ConsoleOutput()],
            ...config,
        };
    }

    /**
     * Update logger configuration
     */
    configure(config: Partial<LoggerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Check if a log level should be output
     */
    private shouldLog(level: LogLevel): boolean {
        return level >= this.config.level;
    }

    /**
     * Create a log entry
     */
    private createEntry(
        level: LogLevel,
        message: string,
        context?: Record<string, unknown>,
        error?: Error,
        operation?: string,
    ): LogEntry {
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            levelName: LogLevel[level],
            message,
            component: this.config.component,
        };

        if (context && this.config.includeContext) {
            entry.context = context;
        }

        if (operation) {
            entry.operation = operation;
        }

        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }

        return entry;
    }

    /**
     * Format log entry for output
     */
    private formatEntry(entry: LogEntry): string {
        switch (this.config.format) {
            case "json":
                return JSON.stringify(entry);

            case "compact":
                return this.formatCompact(entry);
            default:
                return this.formatPretty(entry);
        }
    }

    /**
     * Format entry in compact format
     */
    private formatCompact(entry: LogEntry): string {
        const timestamp = this.config.includeTimestamp ? `${entry.timestamp} ` : "";
        const component = entry.component ? `[${entry.component}] ` : "";
        const operation = entry.operation ? `(${entry.operation}) ` : "";
        const level = this.colorizeLevel(entry.levelName, entry.level);

        return `${timestamp}${level} ${component}${operation}${entry.message}`;
    }

    /**
     * Format entry in pretty format
     */
    private formatPretty(entry: LogEntry): string {
        let formatted = "";

        // Header line
        const timestamp = this.config.includeTimestamp ? `${entry.timestamp} ` : "";
        const component = entry.component ? `[${entry.component}] ` : "";
        const operation = entry.operation ? `(${entry.operation}) ` : "";
        const level = this.colorizeLevel(entry.levelName.padEnd(5), entry.level);

        formatted += `${timestamp}${level} ${component}${operation}${entry.message}`;

        // Context
        if (entry.context && Object.keys(entry.context).length > 0) {
            formatted += `\n  Context: ${JSON.stringify(entry.context, null, 2).split("\n").join("\n  ")}`;
        }

        // Error details
        if (entry.error) {
            formatted += `\n  Error: [${entry.error.code || entry.error.name}] ${entry.error.message}`;

            if (entry.error.context && Object.keys(entry.error.context).length > 0) {
                formatted += `\n  Error Context: ${JSON.stringify(entry.error.context, null, 2).split("\n").join("\n  ")}`;
            }

            if (entry.error.suggestions && entry.error.suggestions.length > 0) {
                formatted += `\n  Suggestions:\n${entry.error.suggestions.map((s) => `    • ${s}`).join("\n")}`;
            }

            if (entry.level === LogLevel.DEBUG && entry.error.stack) {
                formatted += `\n  Stack: ${entry.error.stack.split("\n").join("\n  ")}`;
            }
        }

        return formatted;
    }

    /**
     * Colorize log level if enabled
     */
    private colorizeLevel(levelName: string, level: LogLevel): string {
        if (!this.config.colorize) {
            return levelName;
        }

        const colors = {
            [LogLevel.DEBUG]: "\x1b[36m", // Cyan
            [LogLevel.INFO]: "\x1b[32m", // Green
            [LogLevel.WARN]: "\x1b[33m", // Yellow
            [LogLevel.ERROR]: "\x1b[31m", // Red
        };

        const reset = "\x1b[0m";
        // @ts-ignore
        const color = colors[level] || "";

        return `${color}${levelName}${reset}`;
    }

    /**
     * Write log entry to all outputs
     */
    private async writeEntry(entry: LogEntry): Promise<void> {
        if (!this.shouldLog(entry.level)) {
            return;
        }

        const formatted = this.formatEntry(entry);

        for (const output of this.config.outputs) {
            try {
                await output.write(entry, formatted);
            } catch (error) {
                // Fallback to console if output fails
                console.error("Logger output failed:", error);
                console.error(formatted);
            }
        }
    }

    /**
     * Log debug message
     */
    async debug(message: string, context?: Record<string, unknown>, operation?: string): Promise<void> {
        const entry = this.createEntry(LogLevel.DEBUG, message, context, undefined, operation);
        await this.writeEntry(entry);
    }

    /**
     * Log info message
     */
    async info(message: string, context?: Record<string, unknown>, operation?: string): Promise<void> {
        const entry = this.createEntry(LogLevel.INFO, message, context, undefined, operation);
        await this.writeEntry(entry);
    }

    /**
     * Log warning message
     */
    async warn(message: string, context?: Record<string, unknown>, operation?: string): Promise<void> {
        const entry = this.createEntry(LogLevel.WARN, message, context, undefined, operation);
        await this.writeEntry(entry);
    }

    /**
     * Log error message
     */
    async error(message: string, error?: Error, context?: Record<string, unknown>, operation?: string): Promise<void> {
        const entry = this.createEntry(LogLevel.ERROR, message, context, error, operation);
        await this.writeEntry(entry);
    }

    /**
     * Create a child logger with additional context
     */
    child(component: string, context?: Record<string, unknown>): Logger {
        const childLogger = new Logger({
            ...this.config,
            component: this.config.component ? `${this.config.component}.${component}` : component,
        });

        // If context is provided, wrap all logging methods to include it
        if (context) {
            const originalMethods = {
                debug: childLogger.debug.bind(childLogger),
                info: childLogger.info.bind(childLogger),
                warn: childLogger.warn.bind(childLogger),
                error: childLogger.error.bind(childLogger),
            };

            childLogger.debug = (message, additionalContext, operation) =>
                originalMethods.debug(message, { ...context, ...additionalContext }, operation);

            childLogger.info = (message, additionalContext, operation) =>
                originalMethods.info(message, { ...context, ...additionalContext }, operation);

            childLogger.warn = (message, additionalContext, operation) =>
                originalMethods.warn(message, { ...context, ...additionalContext }, operation);

            childLogger.error = (message, error, additionalContext, operation) =>
                originalMethods.error(message, error, { ...context, ...additionalContext }, operation);
        }

        return childLogger;
    }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Configure the default logger
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
    logger.configure(config);
}

/**
 * Create logger from environment variables and config
 */
export function createLoggerFromConfig(config?: {
    verbose?: boolean;
    debug?: boolean;
    logLevel?: string;
    logFormat?: string;
    logFile?: string;
    component?: string;
}): Logger {
    const level = config?.debug
        ? LogLevel.DEBUG
        : config?.verbose
          ? LogLevel.INFO
          : config?.logLevel
            ? (LogLevel[config.logLevel.toUpperCase() as keyof typeof LogLevel] ?? LogLevel.INFO)
            : LogLevel.INFO;

    const format = config?.logFormat === "json" ? "json" : config?.logFormat === "compact" ? "compact" : "pretty";

    const outputs: LogOutput[] = [new ConsoleOutput()];
    if (config?.logFile) {
        outputs.push(new FileOutput(config.logFile));
    }

    return new Logger({
        level,
        format,
        component: config?.component,
        outputs,
        colorize: !config?.logFile, // Disable colors when logging to file
    });
}
