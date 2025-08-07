/**
 * Dependency Injection Container
 *
 * Lightweight DI container for managing services and dependencies
 */

import type { Container, RegisterOptions } from "./types";

/**
 * Service descriptor
 */
interface ServiceDescriptor<T = unknown> {
	factory: () => T;
	lifetime: "singleton" | "transient" | "scoped";
	dependencies: Array<string | symbol>;
	tags: string[];
	instance?: T;
}

/**
 * Dependency injection container implementation
 */
export class DIContainer implements Container {
	private services = new Map<string | symbol, ServiceDescriptor>();
	private scopedInstances = new Map<string | symbol, unknown>();
	private parent?: DIContainer;

	constructor(parent?: DIContainer) {
		this.parent = parent;
	}

	/**
	 * Register a service
	 */
	register<T>(
		token: string | symbol,
		factory: () => T,
		options: RegisterOptions = {},
	): void {
		const descriptor: ServiceDescriptor<T> = {
			factory,
			lifetime: options.lifetime || "singleton",
			dependencies: options.dependencies || [],
			tags: options.tags || [],
		};

		this.services.set(token, descriptor);
	}

	/**
	 * Resolve a service
	 */
	resolve<T>(token: string | symbol): T {
		// Check local services first
		const descriptor = this.services.get(token);

		// Check parent container if not found locally
		if (!descriptor && this.parent) {
			return this.parent.resolve<T>(token);
		}

		if (!descriptor) {
			throw new Error(`Service not registered: ${String(token)}`);
		}

		// Handle different lifetimes
		switch (descriptor.lifetime) {
			case "singleton":
				if (!descriptor.instance) {
					descriptor.instance = this.createInstance(descriptor);
				}
				return descriptor.instance as T;

			case "scoped":
				if (!this.scopedInstances.has(token)) {
					this.scopedInstances.set(token, this.createInstance(descriptor));
				}
				return this.scopedInstances.get(token) as T;

			case "transient":
				return this.createInstance(descriptor) as T;

			default:
				throw new Error(`Invalid lifetime: ${descriptor.lifetime}`);
		}
	}

	/**
	 * Check if a service is registered
	 */
	has(token: string | symbol): boolean {
		return this.services.has(token) || (this.parent?.has(token) ?? false);
	}

	/**
	 * Create a child container
	 */
	createScope(): Container {
		return new DIContainer(this);
	}

	/**
	 * Get services by tag
	 */
	getByTag<T>(tag: string): T[] {
		const results: T[] = [];

		for (const [token, descriptor] of this.services.entries()) {
			if (descriptor.tags.includes(tag)) {
				results.push(this.resolve<T>(token));
			}
		}

		// Also check parent container
		if (this.parent) {
			results.push(...this.parent.getByTag<T>(tag));
		}

		return results;
	}

	/**
	 * Clear all scoped instances
	 */
	clearScoped(): void {
		this.scopedInstances.clear();
	}

	/**
	 * Create an instance with dependency injection
	 */
	private createInstance<T>(descriptor: ServiceDescriptor<T>): T {
		// Resolve dependencies
		const deps = descriptor.dependencies.map((dep) => this.resolve(dep));

		// Create instance with dependencies
		if (deps.length > 0) {
			// Assume factory is a constructor-like function that accepts dependencies
			return descriptor.factory.apply(null, deps) as T;
		}

		return descriptor.factory();
	}

	/**
	 * Register common services
	 */
	registerCommonServices(): void {
		// Register a simple cache service
		this.register("cache", () => new MemoryCache(), { lifetime: "singleton" });

		// Register event emitter
		this.register("events", () => new EventEmitter(), {
			lifetime: "singleton",
		});
	}
}

/**
 * Simple memory cache implementation
 */
export class MemoryCache<T = unknown> implements Cache<T> {
	private cache = new Map<string, { value: T; expires?: number }>();

	get(key: string): T | undefined {
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		if (entry.expires && entry.expires < Date.now()) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.value;
	}

	set(key: string, value: T, ttl?: number): void {
		const expires = ttl ? Date.now() + ttl : undefined;
		this.cache.set(key, { value, expires });
	}

	has(key: string): boolean {
		const value = this.get(key);
		return value !== undefined;
	}

	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	size(): number {
		// Clean up expired entries first
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (entry.expires && entry.expires < now) {
				this.cache.delete(key);
			}
		}
		return this.cache.size;
	}
}

/**
 * Simple event emitter implementation
 */
export class EventEmitter {
	private events = new Map<string, Set<(...args: any[]) => void>>();

	on(event: string, handler: (...args: any[]) => void): void {
		if (!this.events.has(event)) {
			this.events.set(event, new Set());
		}
		this.events.get(event)?.add(handler);
	}

	off(event: string, handler: (...args: any[]) => void): void {
		this.events.get(event)?.delete(handler);
	}

	emit(event: string, ...args: any[]): void {
		const handlers = this.events.get(event);
		if (handlers) {
			for (const handler of handlers) {
				try {
					handler(...args);
				} catch (error) {
					console.error(`Error in event handler for ${event}:`, error);
				}
			}
		}
	}

	once(event: string, handler: (...args: any[]) => void): void {
		const wrapper = (...args: any[]) => {
			handler(...args);
			this.off(event, wrapper);
		};
		this.on(event, wrapper);
	}

	removeAllListeners(event?: string): void {
		if (event) {
			this.events.delete(event);
		} else {
			this.events.clear();
		}
	}
}

/**
 * Create a new DI container
 */
export function createContainer(): DIContainer {
	const container = new DIContainer();
	container.registerCommonServices();
	return container;
}

/**
 * Global container instance
 */
export const globalContainer = createContainer();

// Re-export types
import type { Cache } from "./types";
export type { Container, RegisterOptions, Cache };
