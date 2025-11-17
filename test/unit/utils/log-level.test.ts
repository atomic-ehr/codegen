/**
 * Tests for log level functionality in CodegenLogger
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CodegenLogger, LogLevel } from "../../../src/utils/codegen-logger";

describe("CodegenLogger - Log Level Support", () => {
    let logCalls: string[] = [];
    let warnCalls: string[] = [];
    let errorCalls: string[] = [];

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    beforeEach(() => {
        logCalls = [];
        warnCalls = [];
        errorCalls = [];

        // Mock console methods
        console.log = (...args: any[]) => {
            logCalls.push(args.join(" "));
        };
        console.warn = (...args: any[]) => {
            warnCalls.push(args.join(" "));
        };
        console.error = (...args: any[]) => {
            errorCalls.push(args.join(" "));
        };
    });

    afterEach(() => {
        // Restore original console methods
        console.log = originalLog;
        console.warn = originalWarn;
        console.error = originalError;
    });

    test("DEBUG level should show all messages", () => {
        const logger = new CodegenLogger({ logLevel: LogLevel.DEBUG });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(logCalls.length).toBe(2); // debug and info
        expect(warnCalls.length).toBe(1); // warn
        expect(errorCalls.length).toBe(1); // error
    });

    test("INFO level should hide DEBUG messages", () => {
        const logger = new CodegenLogger({ logLevel: LogLevel.INFO });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(logCalls.length).toBe(1); // only info (debug hidden)
        expect(warnCalls.length).toBe(1); // warn
        expect(errorCalls.length).toBe(1); // error
    });

    test("WARN level should hide DEBUG and INFO messages", () => {
        const logger = new CodegenLogger({ logLevel: LogLevel.WARN });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(logCalls.length).toBe(0); // debug and info hidden
        expect(warnCalls.length).toBe(1); // warn
        expect(errorCalls.length).toBe(1); // error
    });

    test("ERROR level should only show ERROR messages", () => {
        const logger = new CodegenLogger({ logLevel: LogLevel.ERROR });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(logCalls.length).toBe(0); // debug and info hidden
        expect(warnCalls.length).toBe(0); // warn hidden
        expect(errorCalls.length).toBe(1); // only error
    });

    test("SILENT level should hide all messages", () => {
        const logger = new CodegenLogger({ logLevel: LogLevel.SILENT });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(logCalls.length).toBe(0);
        expect(warnCalls.length).toBe(0);
        expect(errorCalls.length).toBe(0);
    });

    test("verbose option should set log level to DEBUG", () => {
        const logger = new CodegenLogger({ verbose: true });

        logger.debug("debug message");
        logger.info("info message");

        expect(logCalls.length).toBe(2); // both debug and info
    });

    test("explicit logLevel should override verbose", () => {
        const logger = new CodegenLogger({ verbose: true, logLevel: LogLevel.WARN });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");

        expect(logCalls.length).toBe(0); // debug and info hidden
        expect(warnCalls.length).toBe(1); // only warn
    });

    test("child logger should inherit log level", () => {
        const parent = new CodegenLogger({ logLevel: LogLevel.WARN });
        const child = parent.child("child");

        child.debug("debug message");
        child.info("info message");
        child.warn("warn message");

        expect(logCalls.length).toBe(0); // debug and info hidden
        expect(warnCalls.length).toBe(1); // only warn
    });

    test("suppressLoggingLevel should still work with logLevel", () => {
        const logger = new CodegenLogger({
            logLevel: LogLevel.DEBUG,
            suppressLoggingLevel: [LogLevel.WARN],
        });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message"); // suppressed
        logger.error("error message");

        expect(logCalls.length).toBe(2); // debug and info
        expect(warnCalls.length).toBe(0); // warn suppressed
        expect(errorCalls.length).toBe(1); // error
    });

    test("default log level should be INFO", () => {
        const logger = new CodegenLogger();

        logger.debug("debug message");
        logger.info("info message");

        expect(logCalls.length).toBe(1); // only info (debug hidden by default)
    });
});
