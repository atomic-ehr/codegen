/**
 * Enhanced FHIR Error Handling
 *
 * Provides comprehensive error handling for FHIR REST operations with
 * OperationOutcome support, structured error information, and recovery strategies.
 */

import type { Issue, OperationOutcome } from "../../../typeschema/lib-types";

/**
 * Enhanced FHIR Error class with OperationOutcome support
 */
export class FHIRError extends Error {
	public readonly name = "FHIRError";
	public readonly status?: number;
	public readonly operationOutcome?: OperationOutcome;
	public readonly request?: RequestInfo;
	public readonly response?: Response;
	public readonly retryable: boolean;
	public readonly timestamp: Date;

	constructor(
		message: string,
		options: {
			status?: number;
			operationOutcome?: OperationOutcome;
			request?: RequestInfo;
			response?: Response;
			retryable?: boolean;
			cause?: Error;
		} = {},
	) {
		super(message);
		this.status = options.status;
		this.operationOutcome = options.operationOutcome;
		this.request = options.request;
		this.response = options.response;
		this.retryable =
			options.retryable ?? this.isRetryableStatus(options.status);
		this.timestamp = new Date();

		// Set the prototype explicitly for proper instanceof checks
		Object.setPrototypeOf(this, FHIRError.prototype);

		if (options.cause) {
			this.cause = options.cause;
		}
	}

	/**
	 * Get all issues from the OperationOutcome
	 */
	get issues(): Issue[] {
		return this.operationOutcome?.issue || [];
	}

	/**
	 * Check if the error has issues of a specific severity
	 */
	hasIssue(severity: "fatal" | "error" | "warning" | "information"): boolean {
		return this.issues.some((i) => i.severity === severity);
	}

	/**
	 * Get issues of a specific severity
	 */
	getIssues(severity: "fatal" | "error" | "warning" | "information"): Issue[] {
		return this.issues.filter((i) => i.severity === severity);
	}

	/**
	 * Get a formatted error message with all issues
	 */
	getDetailedMessage(): string {
		if (this.issues.length === 0) {
			return this.message;
		}

		const messages = [this.message];
		for (const issue of this.issues) {
			const details = issue.details?.text || issue.diagnostics || "No details";
			messages.push(`${issue.severity.toUpperCase()}: ${details}`);
		}
		return messages.join("\n");
	}

	/**
	 * Check if the error represents a validation failure
	 */
	isValidationError(): boolean {
		return (
			this.status === 400 ||
			this.issues.some((i) => i.code === "invalid" || i.code === "structure")
		);
	}

	/**
	 * Check if the error represents an authentication failure
	 */
	isAuthenticationError(): boolean {
		return this.status === 401;
	}

	/**
	 * Check if the error represents an authorization failure
	 */
	isAuthorizationError(): boolean {
		return this.status === 403;
	}

	/**
	 * Check if the error represents a not found error
	 */
	isNotFoundError(): boolean {
		return this.status === 404;
	}

	/**
	 * Check if the error represents a server error
	 */
	isServerError(): boolean {
		return this.status !== undefined && this.status >= 500;
	}

	/**
	 * Check if the error represents a client error
	 */
	isClientError(): boolean {
		return this.status !== undefined && this.status >= 400 && this.status < 500;
	}

	/**
	 * Check if a status code indicates a retryable error
	 */
	private isRetryableStatus(status?: number): boolean {
		if (!status) return false;

		// Retry on server errors (5xx) and some client errors
		return (
			status >= 500 ||
			status === 408 || // Request Timeout
			status === 429 || // Too Many Requests
			status === 502 || // Bad Gateway
			status === 503 || // Service Unavailable
			status === 504
		); // Gateway Timeout
	}

	/**
	 * Convert to a plain object for serialization
	 */
	toJSON() {
		return {
			name: this.name,
			message: this.message,
			status: this.status,
			operationOutcome: this.operationOutcome,
			retryable: this.retryable,
			timestamp: this.timestamp.toISOString(),
			issues: this.issues,
		};
	}
}

/**
 * Error factory for creating FHIRError instances from various sources
 */
export class FHIRErrorFactory {
	/**
	 * Create FHIRError from HTTP response
	 */
	static async fromResponse(
		response: Response,
		request?: RequestInfo,
	): Promise<FHIRError> {
		let operationOutcome: OperationOutcome | undefined;
		let message = `HTTP ${response.status}: ${response.statusText}`;

		try {
			const contentType = response.headers.get("content-type");
			if (
				contentType?.includes("application/json") ||
				contentType?.includes("application/fhir+json")
			) {
				const body = await response.json();

				if (body.resourceType === "OperationOutcome") {
					operationOutcome = body as OperationOutcome;

					// Extract meaningful message from first issue
					const firstIssue = operationOutcome.issue?.[0];
					if (firstIssue) {
						message =
							firstIssue.details?.text || firstIssue.diagnostics || message;
					}
				} else if (body.message) {
					message = body.message;
				}
			}
		} catch (_parseError) {
			// If we can't parse the response body, use the original error message
		}

		return new FHIRError(message, {
			status: response.status,
			operationOutcome,
			request,
			response,
		});
	}

	/**
	 * Create FHIRError from network error
	 */
	static fromNetworkError(error: Error, request?: RequestInfo): FHIRError {
		return new FHIRError(`Network error: ${error.message}`, {
			request,
			retryable: true,
			cause: error,
		});
	}

	/**
	 * Create FHIRError from timeout
	 */
	static fromTimeout(request?: RequestInfo): FHIRError {
		return new FHIRError("Request timeout", {
			status: 408,
			request,
			retryable: true,
		});
	}

	/**
	 * Create FHIRError from validation failure
	 */
	static fromValidation(message: string, issues: Issue[] = []): FHIRError {
		const operationOutcome: OperationOutcome = {
			resourceType: "OperationOutcome",
			issue: issues,
		};

		return new FHIRError(message, {
			status: 400,
			operationOutcome,
			retryable: false,
		});
	}

	/**
	 * Create FHIRError from OperationOutcome
	 */
	static fromOperationOutcome(
		operationOutcome: OperationOutcome,
		status: number = 400,
	): FHIRError {
		const firstIssue = operationOutcome.issue?.[0];
		const message =
			firstIssue?.details?.text ||
			firstIssue?.diagnostics ||
			"Operation failed";

		return new FHIRError(message, {
			status,
			operationOutcome,
			retryable: status >= 500,
		});
	}
}

/**
 * Error recovery strategies
 */
export interface ErrorRecoveryStrategy {
	canRecover(error: FHIRError): boolean;
	recover(error: FHIRError): Promise<any> | any;
}

/**
 * Authentication refresh recovery strategy
 */
export class AuthRefreshStrategy implements ErrorRecoveryStrategy {
	constructor(private refreshToken: () => Promise<string>) {}

	canRecover(error: FHIRError): boolean {
		return error.isAuthenticationError();
	}

	async recover(_error: FHIRError): Promise<string> {
		return this.refreshToken();
	}
}

/**
 * Validation error recovery strategy
 */
export class ValidationRecoveryStrategy implements ErrorRecoveryStrategy {
	constructor(private fixResource: (resource: any, issues: Issue[]) => any) {}

	canRecover(error: FHIRError): boolean {
		return error.isValidationError() && error.issues.length > 0;
	}

	recover(error: FHIRError, resource?: any): any {
		if (!resource) {
			throw error;
		}
		return this.fixResource(resource, error.issues);
	}
}

/**
 * Error handler with recovery strategies
 */
export class ErrorHandler {
	private strategies: ErrorRecoveryStrategy[] = [];

	/**
	 * Add a recovery strategy
	 */
	addStrategy(strategy: ErrorRecoveryStrategy): void {
		this.strategies.push(strategy);
	}

	/**
	 * Handle an error with recovery attempts
	 */
	async handle(error: FHIRError, context?: any): Promise<any> {
		for (const strategy of this.strategies) {
			if (strategy.canRecover(error)) {
				try {
					return await strategy.recover(error, context);
				} catch (_recoveryError) {}
			}
		}

		// No recovery possible, throw original error
		throw error;
	}
}

/**
 * Generate error handling code for REST client
 */
export function generateErrorHandlingCode(): string {
	return `
  /**
   * Enhanced error handling for FHIR operations
   */
  private async handleError(error: any, request?: RequestInfo): Promise<never> {
    if (error instanceof Response) {
      const fhirError = await FHIRErrorFactory.fromResponse(error, request);
      
      // Try recovery strategies
      try {
        const recovered = await this.errorHandler.handle(fhirError, request);
        return recovered;
      } catch (unrecoverableError) {
        throw unrecoverableError;
      }
    }

    if (error.name === 'AbortError') {
      throw FHIRErrorFactory.fromTimeout(request);
    }

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw FHIRErrorFactory.fromNetworkError(error, request);
    }

    // Unknown error
    throw new FHIRError(error.message || 'Unknown error', {
      cause: error,
      request,
    });
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof FHIRError) {
      return error.retryable;
    }
    return false;
  }
  `;
}

/**
 * Generate error types for TypeScript
 */
export function generateErrorTypes(): string {
	return `
/**
 * FHIR Issue type from OperationOutcome
 */
export interface Issue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code: string;
  details?: {
    text?: string;
    coding?: Array<{
      system?: string;
      code?: string;
      display?: string;
    }>;
  };
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

/**
 * FHIR OperationOutcome resource
 */
export interface OperationOutcome {
  resourceType: 'OperationOutcome';
  id?: string;
  meta?: any;
  issue: Issue[];
}

/**
 * Error context for debugging and logging
 */
export interface ErrorContext {
  request?: RequestInfo;
  response?: Response;
  timestamp: Date;
  retryAttempt?: number;
  operation?: string;
}
  `;
}
