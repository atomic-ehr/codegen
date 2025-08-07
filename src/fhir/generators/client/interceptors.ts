/**
 * FHIR Client Interceptors System
 *
 * Provides a comprehensive interceptor system for request/response manipulation,
 * authentication, logging, transformations, and middleware functionality.
 */

import { FHIRError } from "./error-handling";

/**
 * Request context for interceptors
 */
export interface RequestContext {
	method: string;
	url: string;
	headers: Record<string, string>;
	body?: any;
	resourceType?: string;
	resourceId?: string;
	operation?: string;
	timestamp: Date;
	requestId: string;
	metadata: Record<string, any>;
}

/**
 * Response context for interceptors
 */
export interface ResponseContext {
	status: number;
	statusText: string;
	headers: Record<string, string>;
	data?: any;
	timestamp: Date;
	duration: number;
	requestId: string;
	metadata: Record<string, any>;
}

/**
 * Error context for interceptors
 */
export interface ErrorContext {
	error: Error;
	request: RequestContext;
	response?: ResponseContext;
	timestamp: Date;
	requestId: string;
	metadata: Record<string, any>;
}

/**
 * Request interceptor interface
 */
export interface RequestInterceptor {
	name: string;
	priority?: number; // Higher numbers execute first
	intercept(context: RequestContext): Promise<RequestContext> | RequestContext;
}

/**
 * Response interceptor interface
 */
export interface ResponseInterceptor {
	name: string;
	priority?: number; // Higher numbers execute first
	intercept(
		context: ResponseContext,
		request: RequestContext,
	): Promise<ResponseContext> | ResponseContext;
}

/**
 * Error interceptor interface
 */
export interface ErrorInterceptor {
	name: string;
	priority?: number; // Higher numbers execute first
	intercept(context: ErrorContext): Promise<void> | void;
}

/**
 * Combined interceptor interface
 */
export interface Interceptor {
	name: string;
	priority?: number;
	onRequest?: (
		context: RequestContext,
	) => Promise<RequestContext> | RequestContext;
	onResponse?: (
		context: ResponseContext,
		request: RequestContext,
	) => Promise<ResponseContext> | ResponseContext;
	onError?: (context: ErrorContext) => Promise<void> | void;
}

/**
 * Interceptor manager
 */
export class InterceptorManager {
	private requestInterceptors: RequestInterceptor[] = [];
	private responseInterceptors: ResponseInterceptor[] = [];
	private errorInterceptors: ErrorInterceptor[] = [];

	/**
	 * Add a request interceptor
	 */
	addRequestInterceptor(interceptor: RequestInterceptor): void {
		this.requestInterceptors.push(interceptor);
		this.sortInterceptors(this.requestInterceptors);
	}

	/**
	 * Add a response interceptor
	 */
	addResponseInterceptor(interceptor: ResponseInterceptor): void {
		this.responseInterceptors.push(interceptor);
		this.sortInterceptors(this.responseInterceptors);
	}

	/**
	 * Add an error interceptor
	 */
	addErrorInterceptor(interceptor: ErrorInterceptor): void {
		this.errorInterceptors.push(interceptor);
		this.sortInterceptors(this.errorInterceptors);
	}

	/**
	 * Add a combined interceptor
	 */
	addInterceptor(interceptor: Interceptor): void {
		if (interceptor.onRequest) {
			this.addRequestInterceptor({
				name: interceptor.name,
				priority: interceptor.priority,
				intercept: interceptor.onRequest,
			});
		}

		if (interceptor.onResponse) {
			this.addResponseInterceptor({
				name: interceptor.name,
				priority: interceptor.priority,
				intercept: interceptor.onResponse,
			});
		}

		if (interceptor.onError) {
			this.addErrorInterceptor({
				name: interceptor.name,
				priority: interceptor.priority,
				intercept: interceptor.onError,
			});
		}
	}

	/**
	 * Remove interceptors by name
	 */
	removeInterceptor(name: string): void {
		this.requestInterceptors = this.requestInterceptors.filter(
			(i) => i.name !== name,
		);
		this.responseInterceptors = this.responseInterceptors.filter(
			(i) => i.name !== name,
		);
		this.errorInterceptors = this.errorInterceptors.filter(
			(i) => i.name !== name,
		);
	}

	/**
	 * Process request through all request interceptors
	 */
	async processRequest(context: RequestContext): Promise<RequestContext> {
		let processedContext = context;

		for (const interceptor of this.requestInterceptors) {
			try {
				processedContext = await interceptor.intercept(processedContext);
			} catch (error) {
				throw new FHIRError(
					`Request interceptor '${interceptor.name}' failed: ${error.message}`,
					{ cause: error },
				);
			}
		}

		return processedContext;
	}

	/**
	 * Process response through all response interceptors
	 */
	async processResponse(
		context: ResponseContext,
		request: RequestContext,
	): Promise<ResponseContext> {
		let processedContext = context;

		for (const interceptor of this.responseInterceptors) {
			try {
				processedContext = await interceptor.intercept(
					processedContext,
					request,
				);
			} catch (error) {
				throw new FHIRError(
					`Response interceptor '${interceptor.name}' failed: ${error.message}`,
					{ cause: error },
				);
			}
		}

		return processedContext;
	}

	/**
	 * Process error through all error interceptors
	 */
	async processError(context: ErrorContext): Promise<void> {
		for (const interceptor of this.errorInterceptors) {
			try {
				await interceptor.intercept(context);
			} catch (interceptorError) {
				// Log interceptor errors but don't throw to prevent masking original error
				console.error(
					`Error interceptor '${interceptor.name}' failed:`,
					interceptorError,
				);
			}
		}
	}

	/**
	 * Sort interceptors by priority (highest first)
	 */
	private sortInterceptors<T extends { priority?: number }>(
		interceptors: T[],
	): void {
		interceptors.sort((a, b) => (b.priority || 0) - (a.priority || 0));
	}

	/**
	 * Get all interceptor names
	 */
	getInterceptorNames(): string[] {
		const names = new Set<string>();
		this.requestInterceptors.forEach((i) => names.add(i.name));
		this.responseInterceptors.forEach((i) => names.add(i.name));
		this.errorInterceptors.forEach((i) => names.add(i.name));
		return Array.from(names);
	}

	/**
	 * Clear all interceptors
	 */
	clear(): void {
		this.requestInterceptors = [];
		this.responseInterceptors = [];
		this.errorInterceptors = [];
	}
}

/**
 * Built-in authentication interceptor
 */
export class AuthenticationInterceptor implements RequestInterceptor {
	name = "authentication";
	priority = 1000; // High priority

	constructor(
		private authProvider: () => Promise<string> | string,
		private authType: "Bearer" | "Basic" | "Custom" = "Bearer",
	) {}

	async intercept(context: RequestContext): Promise<RequestContext> {
		try {
			const token = await this.authProvider();

			if (token) {
				const authHeader =
					this.authType === "Basic"
						? `Basic ${token}`
						: this.authType === "Bearer"
							? `Bearer ${token}`
							: token;

				context.headers.Authorization = authHeader;
			}
		} catch (error) {
			throw new FHIRError(`Authentication failed: ${error.message}`, {
				cause: error,
			});
		}

		return context;
	}
}

/**
 * Built-in logging interceptor
 */
export class LoggingInterceptor implements Interceptor {
	name = "logging";
	priority = -1000; // Low priority (execute last)

	constructor(
		private logger: {
			info: (message: string, data?: any) => void;
			error: (message: string, data?: any) => void;
			warn: (message: string, data?: any) => void;
		} = console,
	) {}

	onRequest(context: RequestContext): RequestContext {
		this.logger.info(`FHIR Request: ${context.method} ${context.url}`, {
			requestId: context.requestId,
			resourceType: context.resourceType,
			operation: context.operation,
			timestamp: context.timestamp.toISOString(),
		});
		return context;
	}

	onResponse(
		context: ResponseContext,
		_request: RequestContext,
	): ResponseContext {
		this.logger.info(
			`FHIR Response: ${context.status} ${context.statusText} (${context.duration}ms)`,
			{
				requestId: context.requestId,
				status: context.status,
				duration: context.duration,
				timestamp: context.timestamp.toISOString(),
			},
		);
		return context;
	}

	onError(context: ErrorContext): void {
		this.logger.error(`FHIR Error: ${context.error.message}`, {
			requestId: context.requestId,
			error: context.error.name,
			status: context.response?.status,
			timestamp: context.timestamp.toISOString(),
		});
	}
}

/**
 * Built-in request ID interceptor
 */
export class RequestIdInterceptor implements RequestInterceptor {
	name = "request-id";
	priority = 999; // Very high priority

	constructor(private headerName = "X-Request-ID") {}

	intercept(context: RequestContext): RequestContext {
		if (!context.headers[this.headerName]) {
			context.headers[this.headerName] = context.requestId;
		}
		return context;
	}
}

/**
 * Built-in retry interceptor
 */
export class RetryInterceptor implements ErrorInterceptor {
	name = "retry";
	priority = 100;

	constructor(
		private retryConfig: {
			maxRetries: number;
			retryDelay: number;
			retryCondition: (error: Error) => boolean;
		},
	) {}

	async intercept(context: ErrorContext): Promise<void> {
		const shouldRetry = this.retryConfig.retryCondition(context.error);

		if (shouldRetry) {
			context.metadata.shouldRetry = true;
			context.metadata.retryDelay = this.retryConfig.retryDelay;
		}
	}
}

/**
 * Built-in rate limiting interceptor
 */
export class RateLimitingInterceptor implements RequestInterceptor {
	name = "rate-limiting";
	priority = 800;

	private requestQueue: Array<{ timestamp: number; resolve: Function }> = [];
	private processing = false;

	constructor(
		private config: {
			requestsPerSecond: number;
			burstSize?: number;
		},
	) {}

	async intercept(context: RequestContext): Promise<RequestContext> {
		return new Promise((resolve) => {
			this.requestQueue.push({
				timestamp: Date.now(),
				resolve: () => resolve(context),
			});

			if (!this.processing) {
				this.processQueue();
			}
		});
	}

	private async processQueue(): Promise<void> {
		this.processing = true;
		const intervalMs = 1000 / this.config.requestsPerSecond;

		while (this.requestQueue.length > 0) {
			const request = this.requestQueue.shift();
			if (request) {
				request.resolve();

				if (this.requestQueue.length > 0) {
					await this.sleep(intervalMs);
				}
			}
		}

		this.processing = false;
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Built-in caching interceptor
 */
export class CachingInterceptor implements Interceptor {
	name = "caching";
	priority = 500;

	private cache = new Map<
		string,
		{
			data: any;
			timestamp: number;
			ttl: number;
			etag?: string;
		}
	>();

	constructor(
		private config: {
			defaultTTL: number; // TTL in milliseconds
			maxCacheSize?: number;
			cacheable?: (context: RequestContext) => boolean;
		},
	) {}

	onRequest(context: RequestContext): RequestContext {
		if (context.method !== "GET") {
			return context; // Only cache GET requests
		}

		if (this.config.cacheable && !this.config.cacheable(context)) {
			return context;
		}

		const cacheKey = this.getCacheKey(context);
		const cached = this.cache.get(cacheKey);

		if (cached && this.isCacheValid(cached)) {
			// Add If-None-Match header for conditional requests
			if (cached.etag) {
				context.headers["If-None-Match"] = cached.etag;
			}

			context.metadata.cacheKey = cacheKey;
			context.metadata.cached = cached;
		}

		return context;
	}

	onResponse(
		context: ResponseContext,
		request: RequestContext,
	): ResponseContext {
		if (request.method !== "GET") {
			return context; // Only cache GET responses
		}

		// Handle 304 Not Modified
		if (context.status === 304 && request.metadata.cached) {
			const cached = request.metadata.cached;
			context.data = cached.data;
			context.status = 200;
			context.statusText = "OK (Cached)";
			return context;
		}

		// Cache successful responses
		if (context.status === 200 && context.data) {
			const cacheKey = request.metadata.cacheKey || this.getCacheKey(request);

			this.cache.set(cacheKey, {
				data: context.data,
				timestamp: Date.now(),
				ttl: this.config.defaultTTL,
				etag: context.headers.etag || context.headers.ETag,
			});

			this.cleanupCache();
		}

		return context;
	}

	private getCacheKey(context: RequestContext): string {
		return `${context.method}:${context.url}`;
	}

	private isCacheValid(cached: { timestamp: number; ttl: number }): boolean {
		return Date.now() - cached.timestamp < cached.ttl;
	}

	private cleanupCache(): void {
		if (
			!this.config.maxCacheSize ||
			this.cache.size <= this.config.maxCacheSize
		) {
			return;
		}

		// Remove oldest entries
		const entries = Array.from(this.cache.entries()).sort(
			(a, b) => a[1].timestamp - b[1].timestamp,
		);

		const toRemove = entries.slice(
			0,
			entries.length - this.config.maxCacheSize,
		);
		toRemove.forEach(([key]) => this.cache.delete(key));
	}

	clearCache(): void {
		this.cache.clear();
	}
}

/**
 * Request transformation interceptor
 */
export class RequestTransformInterceptor implements RequestInterceptor {
	name = "request-transform";
	priority = 200;

	constructor(
		private transformers: Array<{
			condition: (context: RequestContext) => boolean;
			transform: (
				context: RequestContext,
			) => RequestContext | Promise<RequestContext>;
		}>,
	) {}

	async intercept(context: RequestContext): Promise<RequestContext> {
		let processedContext = context;

		for (const transformer of this.transformers) {
			if (transformer.condition(processedContext)) {
				processedContext = await transformer.transform(processedContext);
			}
		}

		return processedContext;
	}
}

/**
 * Response transformation interceptor
 */
export class ResponseTransformInterceptor implements ResponseInterceptor {
	name = "response-transform";
	priority = 200;

	constructor(
		private transformers: Array<{
			condition: (context: ResponseContext, request: RequestContext) => boolean;
			transform: (
				context: ResponseContext,
				request: RequestContext,
			) => ResponseContext | Promise<ResponseContext>;
		}>,
	) {}

	async intercept(
		context: ResponseContext,
		request: RequestContext,
	): Promise<ResponseContext> {
		let processedContext = context;

		for (const transformer of this.transformers) {
			if (transformer.condition(processedContext, request)) {
				processedContext = await transformer.transform(
					processedContext,
					request,
				);
			}
		}

		return processedContext;
	}
}

/**
 * Generate interceptor support code for REST client
 */
export function generateInterceptorCode(): string {
	return `
  private interceptorManager = new InterceptorManager();
  private requestIdCounter = 0;

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.interceptorManager.addRequestInterceptor(interceptor);
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.interceptorManager.addResponseInterceptor(interceptor);
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.interceptorManager.addErrorInterceptor(interceptor);
  }

  /**
   * Add a combined interceptor
   */
  addInterceptor(interceptor: Interceptor): void {
    this.interceptorManager.addInterceptor(interceptor);
  }

  /**
   * Remove interceptor by name
   */
  removeInterceptor(name: string): void {
    this.interceptorManager.removeInterceptor(name);
  }

  /**
   * Enhanced request method with interceptor support
   */
  private async requestWithInterceptors<T = any>(
    method: string,
    url: string,
    data?: any,
    headers: Record<string, string> = {}
  ): Promise<T> {
    const startTime = Date.now();
    const requestId = \`req-\${++this.requestIdCounter}\`;
    
    // Create request context
    let requestContext: RequestContext = {
      method: method.toUpperCase(),
      url,
      headers: { ...this.headers, ...headers },
      body: data,
      resourceType: this.extractResourceType(url),
      resourceId: this.extractResourceId(url),
      operation: this.extractOperation(url),
      timestamp: new Date(),
      requestId,
      metadata: {}
    };

    try {
      // Process request through interceptors
      requestContext = await this.interceptorManager.processRequest(requestContext);

      // Make the actual request
      const fullUrl = requestContext.url.startsWith('http') 
        ? requestContext.url 
        : \`\${this.baseUrl}/\${requestContext.url}\`;

      const config: RequestInit = {
        method: requestContext.method,
        headers: requestContext.headers,
        body: requestContext.body ? JSON.stringify(requestContext.body) : undefined,
      };

      const response = await fetch(fullUrl, config);
      const responseData = await response.json().catch(() => null);
      
      // Create response context
      let responseContext: ResponseContext = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        data: responseData,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        requestId,
        metadata: {}
      };

      if (!response.ok) {
        const error = await FHIRErrorFactory.fromResponse(response, fullUrl);
        
        // Process error through interceptors
        await this.interceptorManager.processError({
          error,
          request: requestContext,
          response: responseContext,
          timestamp: new Date(),
          requestId,
          metadata: {}
        });
        
        throw error;
      }

      // Process response through interceptors
      responseContext = await this.interceptorManager.processResponse(
        responseContext,
        requestContext
      );

      return responseContext.data;
    } catch (error) {
      // Process error through interceptors
      await this.interceptorManager.processError({
        error: error instanceof Error ? error : new Error(String(error)),
        request: requestContext,
        timestamp: new Date(),
        requestId,
        metadata: {}
      });
      
      throw error;
    }
  }

  /**
   * Extract resource type from URL
   */
  private extractResourceType(url: string): string | undefined {
    const match = url.match(/^([A-Z][a-zA-Z]+)/);
    return match?.[1];
  }

  /**
   * Extract resource ID from URL
   */
  private extractResourceId(url: string): string | undefined {
    const match = url.match(/^[A-Z][a-zA-Z]+\\/([a-zA-Z0-9\\-\\.]+)/);
    return match?.[1];
  }

  /**
   * Extract operation from URL
   */
  private extractOperation(url: string): string | undefined {
    const match = url.match(/\\$(\\w+)/);
    return match?.[1];
  }
  `;
}
