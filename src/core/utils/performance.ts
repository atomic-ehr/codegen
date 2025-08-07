/**
 * Performance Utilities
 *
 * Caching, memoization, and performance optimization utilities
 */

/**
 * LRU Cache interface
 */
export interface LRUCache<K, V> {
	get(key: K): V | undefined;
	set(key: K, value: V): void;
	has(key: K): boolean;
	delete(key: K): boolean;
	clear(): void;
	size(): number;
	keys(): IterableIterator<K>;
	values(): IterableIterator<V>;
	entries(): IterableIterator<[K, V]>;
}

/**
 * LRU Cache node
 */
class CacheNode<K, V> {
	constructor(
		public key: K,
		public value: V,
		public prev?: CacheNode<K, V>,
		public next?: CacheNode<K, V>,
	) {}
}

/**
 * LRU Cache implementation
 */
export class LRUCacheImpl<K, V> implements LRUCache<K, V> {
	private capacity: number;
	private cache = new Map<K, CacheNode<K, V>>();
	private head: CacheNode<K, V>;
	private tail: CacheNode<K, V>;

	constructor(capacity: number) {
		this.capacity = capacity;

		// Create dummy head and tail nodes
		this.head = new CacheNode<K, V>(null as any, null as any);
		this.tail = new CacheNode<K, V>(null as any, null as any);
		this.head.next = this.tail;
		this.tail.prev = this.head;
	}

	get(key: K): V | undefined {
		const node = this.cache.get(key);
		if (!node) {
			return undefined;
		}

		// Move to front (most recently used)
		this.moveToFront(node);
		return node.value;
	}

	set(key: K, value: V): void {
		const existingNode = this.cache.get(key);

		if (existingNode) {
			// Update existing node
			existingNode.value = value;
			this.moveToFront(existingNode);
			return;
		}

		// Create new node
		const newNode = new CacheNode(key, value);

		if (this.cache.size >= this.capacity) {
			// Remove least recently used
			this.removeLRU();
		}

		this.cache.set(key, newNode);
		this.addToFront(newNode);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	delete(key: K): boolean {
		const node = this.cache.get(key);
		if (!node) {
			return false;
		}

		this.cache.delete(key);
		this.removeNode(node);
		return true;
	}

	clear(): void {
		this.cache.clear();
		this.head.next = this.tail;
		this.tail.prev = this.head;
	}

	size(): number {
		return this.cache.size;
	}

	keys(): IterableIterator<K> {
		return this.cache.keys();
	}

	values(): IterableIterator<V> {
		const values: V[] = [];
		for (const node of this.cache.values()) {
			values.push(node.value);
		}
		return values[Symbol.iterator]();
	}

	entries(): IterableIterator<[K, V]> {
		const entries: [K, V][] = [];
		for (const node of this.cache.values()) {
			entries.push([node.key, node.value]);
		}
		return entries[Symbol.iterator]();
	}

	private addToFront(node: CacheNode<K, V>): void {
		node.prev = this.head;
		node.next = this.head.next;
		this.head.next!.prev = node;
		this.head.next = node;
	}

	private removeNode(node: CacheNode<K, V>): void {
		node.prev!.next = node.next;
		node.next!.prev = node.prev;
	}

	private moveToFront(node: CacheNode<K, V>): void {
		this.removeNode(node);
		this.addToFront(node);
	}

	private removeLRU(): void {
		const lru = this.tail.prev!;
		this.cache.delete(lru.key);
		this.removeNode(lru);
	}
}

/**
 * Create LRU cache
 */
export function createLRUCache<K, V>(capacity: number): LRUCache<K, V> {
	return new LRUCacheImpl<K, V>(capacity);
}

/**
 * Memoization decorator
 */
export function memoize<Args extends any[], Return>(
	fn: (...args: Args) => Return,
	options?: {
		cacheSize?: number;
		keyFn?: (...args: Args) => string;
	},
): (...args: Args) => Return {
	const { cacheSize = 100, keyFn = (...args) => JSON.stringify(args) } =
		options || {};
	const cache = createLRUCache<string, Return>(cacheSize);

	return (...args: Args): Return => {
		const key = keyFn(...args);

		if (cache.has(key)) {
			return cache.get(key)!;
		}

		const result = fn(...args);
		cache.set(key, result);
		return result;
	};
}

/**
 * Async memoization decorator
 */
export function memoizeAsync<Args extends any[], Return>(
	fn: (...args: Args) => Promise<Return>,
	options?: {
		cacheSize?: number;
		keyFn?: (...args: Args) => string;
		ttl?: number;
	},
): (...args: Args) => Promise<Return> {
	const {
		cacheSize = 100,
		keyFn = (...args) => JSON.stringify(args),
		ttl,
	} = options || {};
	const cache = createLRUCache<
		string,
		{ value: Promise<Return>; timestamp?: number }
	>(cacheSize);

	return async (...args: Args): Promise<Return> => {
		const key = keyFn(...args);
		const cached = cache.get(key);

		// Check TTL if specified
		if (cached && ttl) {
			const now = Date.now();
			if (cached.timestamp && now - cached.timestamp > ttl) {
				cache.delete(key);
			} else if (cached) {
				return await cached.value;
			}
		} else if (cached) {
			return await cached.value;
		}

		const promise = fn(...args);
		cache.set(key, {
			value: promise,
			timestamp: ttl ? Date.now() : undefined,
		});

		return await promise;
	};
}

/**
 * Batch processor for handling large datasets efficiently
 */
export class BatchProcessor<T, R> {
	private batchSize: number;
	private concurrency: number;
	private processor: (batch: T[]) => Promise<R[]> | R[];

	constructor(
		processor: (batch: T[]) => Promise<R[]> | R[],
		options?: {
			batchSize?: number;
			concurrency?: number;
		},
	) {
		this.processor = processor;
		this.batchSize = options?.batchSize || 100;
		this.concurrency = options?.concurrency || 5;
	}

	async process(items: T[]): Promise<R[]> {
		const batches: T[][] = [];

		// Split into batches
		for (let i = 0; i < items.length; i += this.batchSize) {
			batches.push(items.slice(i, i + this.batchSize));
		}

		const results: R[][] = [];

		// Process batches with concurrency control
		for (let i = 0; i < batches.length; i += this.concurrency) {
			const batchGroup = batches.slice(i, i + this.concurrency);
			const batchPromises = batchGroup.map((batch) =>
				Promise.resolve(this.processor(batch)),
			);
			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);
		}

		// Flatten results
		return results.flat();
	}
}

/**
 * Resource pool for managing expensive resources
 */
export class ResourcePool<T> {
	private resources: T[] = [];
	private inUse = new Set<T>();
	private factory: () => Promise<T> | T;
	private destroyer?: (resource: T) => Promise<void> | void;
	private maxSize: number;
	private minSize: number;

	constructor(options: {
		factory: () => Promise<T> | T;
		destroyer?: (resource: T) => Promise<void> | void;
		minSize?: number;
		maxSize?: number;
	}) {
		this.factory = options.factory;
		this.destroyer = options.destroyer;
		this.minSize = options.minSize || 1;
		this.maxSize = options.maxSize || 10;
	}

	async initialize(): Promise<void> {
		// Pre-populate with minimum resources
		const promises = Array.from({ length: this.minSize }, () => this.factory());
		const resources = await Promise.all(promises);
		this.resources.push(...resources);
	}

	async acquire(): Promise<T> {
		// Return available resource if exists
		if (this.resources.length > 0) {
			const resource = this.resources.pop()!;
			this.inUse.add(resource);
			return resource;
		}

		// Create new resource if under max size
		if (this.inUse.size < this.maxSize) {
			const resource = await this.factory();
			this.inUse.add(resource);
			return resource;
		}

		// Wait for a resource to be released
		return new Promise((resolve) => {
			const checkForResource = () => {
				if (this.resources.length > 0) {
					const resource = this.resources.pop()!;
					this.inUse.add(resource);
					resolve(resource);
				} else {
					setTimeout(checkForResource, 10);
				}
			};
			checkForResource();
		});
	}

	async release(resource: T): Promise<void> {
		if (!this.inUse.has(resource)) {
			return; // Resource not in use
		}

		this.inUse.delete(resource);

		// Keep minimum resources available
		if (this.resources.length < this.minSize) {
			this.resources.push(resource);
		} else if (this.destroyer) {
			await this.destroyer(resource);
		} else {
			this.resources.push(resource);
		}
	}

	async destroy(): Promise<void> {
		// Destroy all resources
		const allResources = [...this.resources, ...this.inUse];

		if (this.destroyer) {
			await Promise.all(
				allResources.map((resource) => this.destroyer?.(resource)),
			);
		}

		this.resources = [];
		this.inUse.clear();
	}

	get available(): number {
		return this.resources.length;
	}

	get total(): number {
		return this.resources.length + this.inUse.size;
	}
}

/**
 * Debounced map for caching with automatic cleanup
 */
export class DebouncedMap<K, V> {
	private map = new Map<K, { value: V; timeoutId: NodeJS.Timeout }>();
	private timeout: number;

	constructor(timeout = 5000) {
		this.timeout = timeout;
	}

	set(key: K, value: V): void {
		// Clear existing timeout
		const existing = this.map.get(key);
		if (existing) {
			clearTimeout(existing.timeoutId);
		}

		// Set new value with timeout
		const timeoutId = setTimeout(() => {
			this.map.delete(key);
		}, this.timeout);

		this.map.set(key, { value, timeoutId });
	}

	get(key: K): V | undefined {
		const item = this.map.get(key);
		return item?.value;
	}

	has(key: K): boolean {
		return this.map.has(key);
	}

	delete(key: K): boolean {
		const item = this.map.get(key);
		if (item) {
			clearTimeout(item.timeoutId);
			return this.map.delete(key);
		}
		return false;
	}

	clear(): void {
		for (const item of this.map.values()) {
			clearTimeout(item.timeoutId);
		}
		this.map.clear();
	}

	size(): number {
		return this.map.size;
	}
}

/**
 * Performance monitor
 */
export class PerformanceMonitor {
	private metrics = new Map<
		string,
		{
			count: number;
			totalTime: number;
			minTime: number;
			maxTime: number;
		}
	>();

	async measure<T>(name: string, operation: () => Promise<T> | T): Promise<T> {
		const start = process.hrtime.bigint();

		try {
			const result = await operation();
			this.recordMetric(name, start);
			return result;
		} catch (error) {
			this.recordMetric(name, start);
			throw error;
		}
	}

	private recordMetric(name: string, startTime: bigint): void {
		const endTime = process.hrtime.bigint();
		const duration = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds

		const existing = this.metrics.get(name) || {
			count: 0,
			totalTime: 0,
			minTime: Infinity,
			maxTime: 0,
		};

		existing.count++;
		existing.totalTime += duration;
		existing.minTime = Math.min(existing.minTime, duration);
		existing.maxTime = Math.max(existing.maxTime, duration);

		this.metrics.set(name, existing);
	}

	getMetrics(): Record<
		string,
		{
			count: number;
			averageTime: number;
			totalTime: number;
			minTime: number;
			maxTime: number;
		}
	> {
		const result: any = {};

		for (const [name, metrics] of this.metrics) {
			result[name] = {
				count: metrics.count,
				averageTime: metrics.totalTime / metrics.count,
				totalTime: metrics.totalTime,
				minTime: metrics.minTime === Infinity ? 0 : metrics.minTime,
				maxTime: metrics.maxTime,
			};
		}

		return result;
	}

	reset(): void {
		this.metrics.clear();
	}

	summary(): string {
		const metrics = this.getMetrics();
		const lines = ["Performance Summary:", ""];

		for (const [name, data] of Object.entries(metrics)) {
			lines.push(
				`${name}:`,
				`  Count: ${data.count}`,
				`  Average: ${data.averageTime.toFixed(2)}ms`,
				`  Total: ${data.totalTime.toFixed(2)}ms`,
				`  Min: ${data.minTime.toFixed(2)}ms`,
				`  Max: ${data.maxTime.toFixed(2)}ms`,
				"",
			);
		}

		return lines.join("\n");
	}
}

/**
 * Global performance monitor instance
 */
export const performanceMonitor = new PerformanceMonitor();

/**
 * Measure execution time decorator
 */
export function measure(name?: string) {
	return <T extends (...args: any[]) => any>(
		target: any,
		propertyKey: string,
		descriptor: TypedPropertyDescriptor<T>,
	) => {
		const originalMethod = descriptor.value!;
		const metricName = name || `${target.constructor.name}.${propertyKey}`;

		descriptor.value = async function (...args: any[]) {
			return performanceMonitor.measure(metricName, () =>
				originalMethod.apply(this, args),
			);
		} as any;

		return descriptor;
	};
}

/**
 * Circuit breaker for fault tolerance
 */
export class CircuitBreaker<T extends (...args: any[]) => any> {
	private failures = 0;
	private lastFailureTime = 0;
	private state: "closed" | "open" | "half-open" = "closed";
	private successCount = 0;

	constructor(
		private fn: T,
		private options: {
			threshold: number;
			resetTimeout: number;
			monitor?: (state: string, error?: Error) => void;
		},
	) {}

	async execute(...args: Parameters<T>): Promise<ReturnType<T>> {
		if (this.state === "open") {
			if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
				this.state = "half-open";
				this.successCount = 0;
			} else {
				throw new Error("Circuit breaker is open");
			}
		}

		try {
			const result = await this.fn(...args);

			if (this.state === "half-open") {
				this.successCount++;
				if (this.successCount >= 3) {
					// Require 3 successes to close
					this.state = "closed";
					this.failures = 0;
				}
			} else {
				this.failures = 0;
			}

			return result;
		} catch (error) {
			this.failures++;
			this.lastFailureTime = Date.now();

			if (this.failures >= this.options.threshold) {
				this.state = "open";
				this.options.monitor?.("open", error as Error);
			}

			throw error;
		}
	}

	getState(): string {
		return this.state;
	}

	reset(): void {
		this.failures = 0;
		this.state = "closed";
		this.successCount = 0;
	}
}
