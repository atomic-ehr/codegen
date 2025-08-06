import { test, expect } from "bun:test";
import {
	AtomicCodegenError,
	ConfigurationError,
	FileSystemError,
	GenerationError,
	ValidationError,
	ErrorFactory
} from "../src/lib/core/errors";
import { Logger, LogLevel, ConsoleOutput } from "../src/lib/core/logger";

test("AtomicCodegenError should provide structured error information", () => {
	const error = new ConfigurationError("Missing config", {
		context: { key: "outputDir" },
		suggestions: ["Add outputDir to config"],
		recoverable: true,
	});

	expect(error.name).toBe("ConfigurationError");
	expect(error.code).toBe("CONFIG_ERROR");
	expect(error.message).toBe("Missing config");
	expect(error.context).toEqual({ key: "outputDir" });
	expect(error.suggestions).toEqual(["Add outputDir to config"]);
	expect(error.recoverable).toBe(true);
});

test("AtomicCodegenError should format messages with context and suggestions", () => {
	const error = new GenerationError("Generation failed", {
		generator: "typescript",
		context: { outputPath: "/tmp/output" },
		suggestions: ["Check permissions", "Verify input files"],
	});

	const formatted = error.getFormattedMessage();

	expect(formatted).toContain("[GENERATION_ERROR]");
	expect(formatted).toContain("Generation failed");
	expect(formatted).toContain("Context:");
	expect(formatted).toContain("outputPath");
	expect(formatted).toContain("Suggestions:");
	expect(formatted).toContain("• Check permissions");
	expect(formatted).toContain("• Verify input files");
});

test("ErrorFactory should create common error types", () => {
	const configError = ErrorFactory.missingConfig("outputDir");
	expect(configError).toBeInstanceOf(ConfigurationError);
	expect(configError.message).toContain("Missing required configuration: outputDir");
	expect(configError.suggestions).toContain('Add "outputDir" to your .atomic-codegen.json file');

	const fileError = ErrorFactory.fileNotFound("/path/to/file");
	expect(fileError).toBeInstanceOf(FileSystemError);
	expect(fileError.message).toContain("File not found: /path/to/file");
	expect(fileError.suggestions).toContain("Check that the file path is correct");

	const formatError = ErrorFactory.invalidFormat("/path/to/file.txt", [".json", ".ndjson"]);
	expect(formatError).toBeInstanceOf(ValidationError);
	expect(formatError.message).toContain("Invalid file format for: /path/to/file.txt");
	expect(formatError.suggestions).toContain("Expected one of: .json, .ndjson");
});

test("Logger should handle different log levels", async () => {
	const messages: string[] = [];
	const testOutput = {
		write: (entry: any, formatted: string) => {
			messages.push(formatted);
		}
	};

	const logger = new Logger({
		level: LogLevel.INFO,
		format: 'compact',
		outputs: [testOutput],
		colorize: false,
		includeTimestamp: false,
	});

	await logger.debug("Debug message"); // Should not appear (below INFO level)
	await logger.info("Info message");
	await logger.warn("Warning message");
	await logger.error("Error message");

	expect(messages).toHaveLength(3); // debug should be filtered out
	expect(messages[0]).toContain("INFO");
	expect(messages[0]).toContain("Info message");
	expect(messages[1]).toContain("WARN");
	expect(messages[1]).toContain("Warning message");
	expect(messages[2]).toContain("ERROR");
	expect(messages[2]).toContain("Error message");
});

test("Logger should format AtomicCodegenError properly", async () => {
	const messages: string[] = [];
	const testOutput = {
		write: (entry: any, formatted: string) => {
			messages.push(formatted);
		}
	};

	const logger = new Logger({
		level: LogLevel.ERROR,
		format: 'pretty',
		outputs: [testOutput],
		colorize: false,
		includeTimestamp: false,
	});

	const error = new ValidationError("Invalid input", {
		context: { value: "test" },
		suggestions: ["Check input format"],
	});

	await logger.error("Operation failed", error);

	expect(messages).toHaveLength(1);
	const message = messages[0];
	expect(message).toContain("ERROR");
	expect(message).toContain("Operation failed");
	expect(message).toContain("[VALIDATION_ERROR]");
	expect(message).toContain("Invalid input");
	expect(message).toContain("Context:");
	expect(message).toContain("value");
	expect(message).toContain("Suggestions:");
	expect(message).toContain("• Check input format");
});

test("Logger should create child loggers with additional context", async () => {
	const messages: string[] = [];
	const testOutput = {
		write: (entry: any, formatted: string) => {
			messages.push(formatted);
		}
	};

	const parentLogger = new Logger({
		level: LogLevel.INFO,
		format: 'compact',
		outputs: [testOutput],
		colorize: false,
		includeTimestamp: false,
		component: 'Parent',
	});

	const childLogger = parentLogger.child('Child', { operation: 'test' });

	await childLogger.info("Child message");

	expect(messages).toHaveLength(1);
	expect(messages[0]).toContain("[Parent.Child]");
	expect(messages[0]).toContain("Child message");
});

test("Error JSON serialization should include all relevant fields", () => {
	const error = new FileSystemError("File operation failed", {
		path: "/tmp/test",
		operation: "write",
		context: { permissions: "755" },
		suggestions: ["Check permissions"],
		recoverable: true,
	});

	const json = error.toJSON();

	expect(json.name).toBe("FileSystemError");
	expect(json.message).toBe("File operation failed");
	expect(json.code).toBe("FILESYSTEM_ERROR");
	expect(json.context).toEqual({ path: "/tmp/test", operation: "write", permissions: "755" });
	expect(json.suggestions).toEqual(["Check permissions"]);
	expect(json.recoverable).toBe(true);
	expect(json.stack).toBeDefined();
});
