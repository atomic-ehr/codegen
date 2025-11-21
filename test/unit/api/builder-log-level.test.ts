/**
 * Tests for APIBuilder log level functionality
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { LogLevel } from "@root/utils/codegen-logger";

describe("APIBuilder - Log Level Support", () => {
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

    test("builder should support logLevel method", () => {
        const builder = new APIBuilder();

        // Should return builder for chaining
        const result = builder.logLevel(LogLevel.WARN);
        expect(result).toBe(builder);
    });

    test("builder logLevel should affect logger output", () => {
        const builder = new APIBuilder({ verbose: true });

        // With DEBUG level (verbose), should see debug messages
        // @ts-expect-error - accessing private logger for testing
        builder.logger.debug("debug1");
        expect(logCalls.length).toBeGreaterThan(0);

        logCalls = [];

        // Change to WARN level
        builder.logLevel(LogLevel.WARN);

        // @ts-expect-error - accessing private logger for testing
        builder.logger.debug("debug2");
        // @ts-expect-error - accessing private logger for testing
        builder.logger.info("info2");

        // Debug and info should be hidden
        expect(logCalls.length).toBe(0);

        // @ts-expect-error - accessing private logger for testing
        builder.logger.warn("warn2");

        // Warn should be visible
        expect(warnCalls.length).toBe(1);
    });

    test("builder logLevel should chain with other methods", () => {
        const builder = new APIBuilder().logLevel(LogLevel.ERROR).verbose(false).outputTo("./test-output");

        expect(builder).toBeInstanceOf(APIBuilder);
    });

    test("logLevel should override verbose setting", () => {
        const builder = new APIBuilder({ verbose: true });

        // Initially verbose (DEBUG level)
        // @ts-expect-error - accessing private logger for testing
        builder.logger.debug("debug1");
        expect(logCalls.length).toBeGreaterThan(0);

        logCalls = [];

        // Set explicit log level should override verbose
        builder.logLevel(LogLevel.SILENT);

        // @ts-expect-error - accessing private logger for testing
        builder.logger.debug("debug2");
        // @ts-expect-error - accessing private logger for testing
        builder.logger.info("info2");
        // @ts-expect-error - accessing private logger for testing
        builder.logger.warn("warn2");
        // @ts-expect-error - accessing private logger for testing
        builder.logger.error("error2");

        // All should be hidden
        expect(logCalls.length).toBe(0);
        expect(warnCalls.length).toBe(0);
        expect(errorCalls.length).toBe(0);
    });
});
