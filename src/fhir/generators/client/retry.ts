/**
 * Retry Strategies and Circuit Breaker for FHIR REST Client
 *
 * Implements sophisticated retry mechanisms including exponential backoff,
 * jitter, circuit breaker pattern, and fault tolerance for FHIR operations.
 */

import { FHIRError } from "./error-handling";

/**
 * Backoff strategy interface
 */
export interface BackoffStrategy {
	calculateDelay(attempt: number): number;
	reset(): void;
}

/**
 * Exponential backoff with optional jitter
 */
export class ExponentialBackoff implements BackoffStrategy {
	private readonly initialDelay: number;
	private readonly maxDelay: number;
	private readonly multiplier: number;
	private readonly jitter: boolean;

	constructor(
		options: {
			initialDelay?: number;
			maxDelay?: number;
			multiplier?: number;
			jitter?: boolean;
		} = {},
	) {
		this.initialDelay = options.initialDelay ?? 1000;
		this.maxDelay = options.maxDelay ?? 30000;
		this.multiplier = options.multiplier ?? 2;
		this.jitter = options.jitter ?? true;
	}

	calculateDelay(attempt: number): number {
		const exponentialDelay = Math.min(
			this.initialDelay * this.multiplier ** attempt,
			this.maxDelay,
		);

		if (this.jitter) {
			// Add random jitter to prevent thundering herd
			const jitterAmount = exponentialDelay * 0.1;
			const jitterOffset = (Math.random() - 0.5) * 2 * jitterAmount;
			return Math.max(0, exponentialDelay + jitterOffset);
		}

		return exponentialDelay;
	}

	reset(): void {
		// No state to reset for exponential backoff
	}
}

/**
 * Linear backoff strategy
 */
export class LinearBackoff implements BackoffStrategy {
	private readonly baseDelay: number;
	private readonly maxDelay: number;

	constructor(
		options: {
			baseDelay?: number;
			maxDelay?: number;
		} = {},
	) {
		this.baseDelay = options.baseDelay ?? 1000;
		this.maxDelay = options.maxDelay ?? 30000;
	}

	calculateDelay(attempt: number): number {
		return Math.min(this.baseDelay * (attempt + 1), this.maxDelay);
	}

	reset(): void {
		// No state to reset for linear backoff
	}
}

/**
 * Fixed delay backoff strategy
 */
export class FixedBackoff implements BackoffStrategy {
	constructor(private readonly delay: number = 1000) {}

	calculateDelay(_attempt: number): number {
		return this.delay;
	}

	reset(): void {
		// No state to reset for fixed backoff
	}
}

/**
 * Retry condition function
 */
export type RetryCondition = (error: any, attempt: number) => boolean;

/**
 * Default retry conditions
 */
export const RetryConditions = {
	/**
	 * Retry on any FHIRError that is marked as retryable
	 */
	retryableFHIRError: (error: any, _attempt: number): boolean => {
		return error instanceof FHIRError && error.retryable;
	},

	/**
	 * Retry on server errors (5xx status codes)
	 */
	serverErrors: (error: any, _attempt: number): boolean => {
		return error instanceof FHIRError && error.isServerError();
	},

	/**
	 * Retry on network errors
	 */
	networkErrors: (error: any, _attempt: number): boolean => {
		return error.name === "TypeError" && error.message.includes("fetch");
	},

	/**
	 * Retry on timeout errors
	 */
	timeoutErrors: (error: any, _attempt: number): boolean => {
		return (
			error.name === "AbortError" ||
			(error instanceof FHIRError && error.status === 408)
		);
	},

	/**
	 * Combine multiple retry conditions with OR logic
	 */
	any: (...conditions: RetryCondition[]): RetryCondition => {
		return (error: any, attempt: number): boolean => {
			return conditions.some((condition) => condition(error, attempt));
		};
	},

	/**
	 * Combine multiple retry conditions with AND logic
	 */
	all: (...conditions: RetryCondition[]): RetryCondition => {
		return (error: any, attempt: number): boolean => {
			return conditions.every((condition) => condition(error, attempt));
		};
	},
};

/**
 * Retry configuration
 */
export interface RetryConfig {
	maxAttempts: number;
	backoffStrategy: BackoffStrategy;
	retryCondition: RetryCondition;
	onRetry?: (error: any, attempt: number) => void;
}

/**
 * Retry strategy implementation
 */
export class RetryStrategy {
	private readonly config: RetryConfig;

	constructor(config: Partial<RetryConfig> = {}) {
		this.config = {
			maxAttempts: config.maxAttempts ?? 3,
			backoffStrategy: config.backoffStrategy ?? new ExponentialBackoff(),
			retryCondition:
				config.retryCondition ?? RetryConditions.retryableFHIRError,
			onRetry: config.onRetry,
		};
	}

	/**
	 * Execute a function with retry logic
	 */
	async execute<T>(operation: () => Promise<T>): Promise<T> {
		let lastError: any;

		for (let attempt = 0; attempt <= this.config.maxAttempts; attempt++) {
			try {
				const result = await operation();
				this.config.backoffStrategy.reset();
				return result;
			} catch (error) {
				lastError = error;

				const shouldRetry =
					attempt < this.config.maxAttempts &&
					this.config.retryCondition(error, attempt);

				if (!shouldRetry) {
					throw error;
				}

				// Call retry callback if provided
				this.config.onRetry?.(error, attempt);

				// Wait before retry
				const delay = this.config.backoffStrategy.calculateDelay(attempt);
				await this.sleep(delay);
			}
		}

		throw lastError;
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Circuit breaker states
 */
export enum CircuitBreakerState {
	CLOSED = "closed", // Normal operation
	OPEN = "open", // Blocking requests due to failures
	HALF_OPEN = "half_open", // Testing if service has recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
	failureThreshold: number; // Number of failures to open circuit
	recoveryTimeout: number; // Time to wait before trying to recover (ms)
	monitoringPeriod: number; // Time window for monitoring failures (ms)
	minimumRequests: number; // Minimum requests before considering circuit state
	successThreshold: number; // Successful requests needed to close circuit in half-open state
}

/**
 * Circuit breaker statistics
 */
export interface CircuitBreakerStats {
	state: CircuitBreakerState;
	failures: number;
	successes: number;
	requests: number;
	lastFailureTime: Date | null;
	lastSuccessTime: Date | null;
}

/**
 * Circuit breaker implementation for FHIR operations
 */
export class CircuitBreaker {
	private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
	private failures = 0;
	private successes = 0;
	private requests = 0;
	private lastFailureTime: Date | null = null;
	private lastSuccessTime: Date | null = null;
	private nextAttempt = Date.now();

	constructor(private readonly config: CircuitBreakerConfig) {}

	/**
	 * Execute operation through circuit breaker
	 */
	async execute<T>(operation: () => Promise<T>): Promise<T> {
		if (this.state === CircuitBreakerState.OPEN) {
			if (Date.now() < this.nextAttempt) {
				throw new FHIRError("Circuit breaker is OPEN - operation blocked", {
					retryable: true,
				});
			} else {
				// Transition to half-open to test service
				this.state = CircuitBreakerState.HALF_OPEN;
			}
		}

		this.requests++;

		try {
			const result = await operation();
			this.onSuccess();
			return result;
		} catch (error) {
			this.onFailure();
			throw error;
		}
	}

	/**
	 * Handle successful operation
	 */
	private onSuccess(): void {
		this.successes++;
		this.lastSuccessTime = new Date();

		if (this.state === CircuitBreakerState.HALF_OPEN) {
			if (this.successes >= this.config.successThreshold) {
				this.reset();
			}
		}
	}

	/**
	 * Handle failed operation
	 */
	private onFailure(): void {
		this.failures++;
		this.lastFailureTime = new Date();

		if (this.shouldOpenCircuit()) {
			this.openCircuit();
		}
	}

	/**
	 * Check if circuit should be opened
	 */
	private shouldOpenCircuit(): boolean {
		if (this.requests < this.config.minimumRequests) {
			return false;
		}

		const failureRate = this.failures / this.requests;
		const thresholdRate =
			this.config.failureThreshold / this.config.minimumRequests;

		return failureRate >= thresholdRate;
	}

	/**
	 * Open the circuit
	 */
	private openCircuit(): void {
		this.state = CircuitBreakerState.OPEN;
		this.nextAttempt = Date.now() + this.config.recoveryTimeout;
	}

	/**
	 * Reset circuit breaker to closed state
	 */
	private reset(): void {
		this.state = CircuitBreakerState.CLOSED;
		this.failures = 0;
		this.successes = 0;
		this.requests = 0;
		this.nextAttempt = Date.now();
	}

	/**
	 * Get current circuit breaker statistics
	 */
	getStats(): CircuitBreakerStats {
		return {
			state: this.state,
			failures: this.failures,
			successes: this.successes,
			requests: this.requests,
			lastFailureTime: this.lastFailureTime,
			lastSuccessTime: this.lastSuccessTime,
		};
	}

	/**
	 * Manually open the circuit (for testing or maintenance)
	 */
	manualOpen(): void {
		this.openCircuit();
	}

	/**
	 * Manually close the circuit
	 */
	manualClose(): void {
		this.reset();
	}
}

/**
 * Combined retry and circuit breaker strategy
 */
export class ResilientExecutor {
	constructor(
		private readonly retryStrategy: RetryStrategy,
		private readonly circuitBreaker: CircuitBreaker,
	) {}

	/**
	 * Execute operation with both retry and circuit breaker protection
	 */
	async execute<T>(operation: () => Promise<T>): Promise<T> {
		return this.retryStrategy.execute(async () => {
			return this.circuitBreaker.execute(operation);
		});
	}

	/**
	 * Get circuit breaker statistics
	 */
	getCircuitBreakerStats(): CircuitBreakerStats {
		return this.circuitBreaker.getStats();
	}
}

/**
 * Generate retry strategy code for REST client
 */
export function generateRetryStrategyCode(): string {
	return `
  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    if (!this.retryStrategy) {
      return operation();
    }

    return this.retryStrategy.execute(async () => {
      if (this.circuitBreaker) {
        return this.circuitBreaker.execute(operation);
      }
      return operation();
    });
  }

  /**
   * Configure retry behavior for the client
   */
  setRetryStrategy(strategy: RetryStrategy): void {
    this.retryStrategy = strategy;
  }

  /**
   * Configure circuit breaker for the client
   */
  setCircuitBreaker(circuitBreaker: CircuitBreaker): void {
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Get circuit breaker statistics if configured
   */
  getCircuitBreakerStats(): CircuitBreakerStats | null {
    return this.circuitBreaker?.getStats() ?? null;
  }
  `;
}

/**
 * Default retry configurations for common scenarios
 */
export const DefaultRetryConfigs = {
	/**
	 * Conservative retry for critical operations
	 */
	conservative: (): RetryConfig => ({
		maxAttempts: 2,
		backoffStrategy: new ExponentialBackoff({
			initialDelay: 1000,
			maxDelay: 5000,
			multiplier: 2,
			jitter: true,
		}),
		retryCondition: RetryConditions.any(
			RetryConditions.serverErrors,
			RetryConditions.timeoutErrors,
		),
	}),

	/**
	 * Aggressive retry for non-critical operations
	 */
	aggressive: (): RetryConfig => ({
		maxAttempts: 5,
		backoffStrategy: new ExponentialBackoff({
			initialDelay: 500,
			maxDelay: 30000,
			multiplier: 2,
			jitter: true,
		}),
		retryCondition: RetryConditions.retryableFHIRError,
	}),

	/**
	 * Quick retry for time-sensitive operations
	 */
	quick: (): RetryConfig => ({
		maxAttempts: 3,
		backoffStrategy: new FixedBackoff(500),
		retryCondition: RetryConditions.any(
			RetryConditions.serverErrors,
			RetryConditions.networkErrors,
		),
	}),
};

/**
 * Default circuit breaker configurations
 */
export const DefaultCircuitBreakerConfigs = {
	/**
	 * Standard circuit breaker configuration
	 */
	standard: (): CircuitBreakerConfig => ({
		failureThreshold: 5,
		recoveryTimeout: 60000, // 1 minute
		monitoringPeriod: 300000, // 5 minutes
		minimumRequests: 10,
		successThreshold: 3,
	}),

	/**
	 * Sensitive circuit breaker for critical services
	 */
	sensitive: (): CircuitBreakerConfig => ({
		failureThreshold: 3,
		recoveryTimeout: 30000, // 30 seconds
		monitoringPeriod: 120000, // 2 minutes
		minimumRequests: 5,
		successThreshold: 2,
	}),

	/**
	 * Tolerant circuit breaker for less critical services
	 */
	tolerant: (): CircuitBreakerConfig => ({
		failureThreshold: 10,
		recoveryTimeout: 120000, // 2 minutes
		monitoringPeriod: 600000, // 10 minutes
		minimumRequests: 20,
		successThreshold: 5,
	}),
};
