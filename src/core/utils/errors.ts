/**
 * Structured Error Types for Atomic Codegen
 *
 * Provides custom error classes with contextual information and suggestions
 */

/**
 * Base error class with enhanced context and suggestions
 */
export abstract class AtomicCodegenError extends Error {
	public readonly code: string;
	public readonly context?: Record<string, unknown>;
	public readonly suggestions?: string[];
	public readonly recoverable: boolean;

	constructor(
		message: string,
		options: {
			code: string;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		},
	) {
		super(message);
		this.name = this.constructor.name;
		this.code = options.code;
		this.context = options.context;
		this.suggestions = options.suggestions;
		this.recoverable = options.recoverable ?? false;

		if (options.cause) {
			this.cause = options.cause;
		}

		// Maintain proper stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * Get formatted error message with context and suggestions
	 */
	getFormattedMessage(): string {
		let formatted = `[${this.code}] ${this.message}`;

		if (this.context && Object.keys(this.context).length > 0) {
			formatted += `\nContext: ${JSON.stringify(this.context, null, 2)}`;
		}

		if (this.suggestions && this.suggestions.length > 0) {
			formatted += `\nSuggestions:\n${this.suggestions.map((s) => `  • ${s}`).join("\n")}`;
		}

		return formatted;
	}

	/**
	 * Convert to JSON for structured logging
	 */
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			code: this.code,
			context: this.context,
			suggestions: this.suggestions,
			recoverable: this.recoverable,
			stack: this.stack,
		};
	}
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		super(message, {
			code: "CONFIG_ERROR",
			...options,
		});
	}
}

/**
 * File system operation errors
 */
export class FileSystemError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			path?: string;
			operation?: string;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		const context = {
			...options.context,
			...(options.path && { path: options.path }),
			...(options.operation && { operation: options.operation }),
		};

		super(message, {
			code: "FILESYSTEM_ERROR",
			context,
			suggestions: options.suggestions,
			recoverable: options.recoverable,
			cause: options.cause,
		});
	}
}

/**
 * TypeSchema processing errors
 */
export class TypeSchemaError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			schemaPath?: string;
			schemaType?: string;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		const context = {
			...options.context,
			...(options.schemaPath && { schemaPath: options.schemaPath }),
			...(options.schemaType && { schemaType: options.schemaType }),
		};

		super(message, {
			code: "TYPESCHEMA_ERROR",
			context,
			suggestions: options.suggestions,
			recoverable: options.recoverable,
			cause: options.cause,
		});
	}
}

/**
 * Code generation errors
 */
export class GenerationError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			generator?: string;
			outputPath?: string;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		const context = {
			...options.context,
			...(options.generator && { generator: options.generator }),
			...(options.outputPath && { outputPath: options.outputPath }),
		};

		super(message, {
			code: "GENERATION_ERROR",
			context,
			suggestions: options.suggestions,
			recoverable: options.recoverable,
			cause: options.cause,
		});
	}
}

/**
 * Validation errors
 */
export class ValidationError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			validationType?: string;
			invalidValue?: unknown;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		const context = {
			...options.context,
			...(options.validationType && { validationType: options.validationType }),
			...(options.invalidValue !== undefined && {
				invalidValue: options.invalidValue,
			}),
		};

		super(message, {
			code: "VALIDATION_ERROR",
			context,
			suggestions: options.suggestions,
			recoverable: options.recoverable ?? true, // Validation errors are often recoverable
			cause: options.cause,
		});
	}
}

/**
 * Network/HTTP errors
 */
export class NetworkError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			url?: string;
			statusCode?: number;
			method?: string;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		const context = {
			...options.context,
			...(options.url && { url: options.url }),
			...(options.statusCode && { statusCode: options.statusCode }),
			...(options.method && { method: options.method }),
		};

		super(message, {
			code: "NETWORK_ERROR",
			context,
			suggestions: options.suggestions,
			recoverable: options.recoverable ?? true, // Network errors are often recoverable
			cause: options.cause,
		});
	}
}

/**
 * FHIR package processing errors
 */
export class FHIRPackageError extends AtomicCodegenError {
	constructor(
		message: string,
		options: {
			packageName?: string;
			version?: string;
			context?: Record<string, unknown>;
			suggestions?: string[];
			recoverable?: boolean;
			cause?: Error;
		} = {},
	) {
		const context = {
			...options.context,
			...(options.packageName && { packageName: options.packageName }),
			...(options.version && { version: options.version }),
		};

		super(message, {
			code: "FHIR_PACKAGE_ERROR",
			context,
			suggestions: options.suggestions,
			recoverable: options.recoverable,
			cause: options.cause,
		});
	}
}

/**
 * Error factory functions for common scenarios
 */
export const ErrorFactory = {
	/**
	 * Create a configuration error for missing required config
	 */
	missingConfig(key: string, suggestions: string[] = []): ConfigurationError {
		return new ConfigurationError(`Missing required configuration: ${key}`, {
			context: { missingKey: key },
			suggestions: [
				`Add "${key}" to your .atomic-codegen.json file`,
				'Run "atomic-codegen config init" to create a configuration file',
				...suggestions,
			],
			recoverable: true,
		});
	},

	/**
	 * Create a file not found error
	 */
	fileNotFound(path: string, suggestions: string[] = []): FileSystemError {
		return new FileSystemError(`File not found: ${path}`, {
			path,
			operation: "read",
			suggestions: [
				"Check that the file path is correct",
				"Ensure the file exists and is readable",
				...suggestions,
			],
			recoverable: true,
		});
	},

	/**
	 * Create an invalid input format error
	 */
	invalidFormat(path: string, expectedFormats: string[]): ValidationError {
		return new ValidationError(`Invalid file format for: ${path}`, {
			context: { path, expectedFormats },
			suggestions: [
				`Expected one of: ${expectedFormats.join(", ")}`,
				"Check the file extension and content format",
			],
			recoverable: true,
		});
	},

	/**
	 * Create a network timeout error
	 */
	networkTimeout(url: string, timeoutMs: number): NetworkError {
		return new NetworkError(`Request timeout after ${timeoutMs}ms`, {
			url,
			context: { timeoutMs },
			suggestions: [
				"Check your internet connection",
				"Try increasing the timeout value",
				"Verify the URL is accessible",
			],
			recoverable: true,
		});
	},
};
