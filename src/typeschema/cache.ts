/**
 * TypeSchema Cache System
 *
 * High-performance caching system for TypeSchema documents to optimize
 * repeated parsing, validation, and transformation operations.
 */

import type {
	AnyTypeSchema,
	CacheEntry,
	CacheOptions,
	TypeSchemaIdentifier,
} from "./types";

/**
 * LRU Cache implementation for TypeSchema documents
 */
class LRUCache<K, V> {
	private cache = new Map<K, V>();
	private maxSize: number;

	constructor(maxSize: number) {
		this.maxSize = maxSize;
	}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			// Move to end (most recently used)
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}

	set(key: K, value: V): void {
		// Remove if already exists
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Remove least recently used (first entry)
			const firstKey = this.cache.keys().next().value;
			this.cache.delete(firstKey);
		}

		this.cache.set(key, value);
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	delete(key: K): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}

	size(): number {
		return this.cache.size;
	}

	keys(): IterableIterator<K> {
		return this.cache.keys();
	}
}

/**
 * TypeSchema Cache class
 *
 * Provides high-performance caching for TypeSchema documents with TTL support,
 * LRU eviction, and efficient lookup by various criteria.
 */
export class TypeSchemaCache {
	private cache: LRUCache<string, CacheEntry>;
	private urlIndex = new Map<string, string>(); // url -> key
	private packageIndex = new Map<string, Set<string>>(); // package -> keys
	private kindIndex = new Map<string, Set<string>>(); // kind -> keys
	private options: Required<CacheOptions>;

	constructor(options: CacheOptions = {}) {
		this.options = {
			enabled: true,
			maxSize: 1000,
			ttl: 30 * 60 * 1000, // 30 minutes
			...options,
		};

		this.cache = new LRUCache(this.options.maxSize);
	}

	/**
	 * Store a schema in the cache
	 */
	set(schema: AnyTypeSchema): void {
		if (!this.options.enabled) return;

		const key = this.generateKey(schema.identifier);
		const entry: CacheEntry = {
			schema,
			timestamp: Date.now(),
			key,
		};

		this.cache.set(key, entry);
		this.updateIndexes(key, schema.identifier);
	}

	/**
	 * Retrieve a schema by identifier
	 */
	get(identifier: TypeSchemaIdentifier): AnyTypeSchema | null {
		if (!this.options.enabled) return null;

		const key = this.generateKey(identifier);
		const entry = this.cache.get(key);

		if (!entry) return null;

		// Check TTL
		if (this.isExpired(entry)) {
			this.delete(identifier);
			return null;
		}

		return entry.schema;
	}

	/**
	 * Retrieve a schema by URL
	 */
	getByUrl(url: string): AnyTypeSchema | null {
		if (!this.options.enabled) return null;

		const key = this.urlIndex.get(url);
		if (!key) return null;

		const entry = this.cache.get(key);
		if (!entry) {
			// Clean up stale index
			this.urlIndex.delete(url);
			return null;
		}

		// Check TTL
		if (this.isExpired(entry)) {
			this.deleteByKey(key);
			return null;
		}

		return entry.schema;
	}

	/**
	 * Check if a schema exists in cache
	 */
	has(identifier: TypeSchemaIdentifier): boolean {
		if (!this.options.enabled) return false;

		const key = this.generateKey(identifier);
		const entry = this.cache.get(key);

		if (!entry) return false;

		if (this.isExpired(entry)) {
			this.deleteByKey(key);
			return false;
		}

		return true;
	}

	/**
	 * Check if a schema exists by URL
	 */
	hasByUrl(url: string): boolean {
		if (!this.options.enabled) return false;

		const key = this.urlIndex.get(url);
		if (!key) return false;

		const entry = this.cache.get(key);
		if (!entry) {
			this.urlIndex.delete(url);
			return false;
		}

		if (this.isExpired(entry)) {
			this.deleteByKey(key);
			return false;
		}

		return true;
	}

	/**
	 * Delete a schema from cache
	 */
	delete(identifier: TypeSchemaIdentifier): boolean {
		if (!this.options.enabled) return false;

		const key = this.generateKey(identifier);
		return this.deleteByKey(key);
	}

	/**
	 * Delete a schema by URL
	 */
	deleteByUrl(url: string): boolean {
		if (!this.options.enabled) return false;

		const key = this.urlIndex.get(url);
		if (!key) return false;

		return this.deleteByKey(key);
	}

	/**
	 * Get all schemas for a package
	 */
	getByPackage(packageName: string): AnyTypeSchema[] {
		if (!this.options.enabled) return [];

		const keys = this.packageIndex.get(packageName);
		if (!keys) return [];

		const schemas: AnyTypeSchema[] = [];
		const expiredKeys: string[] = [];

		for (const key of keys) {
			const entry = this.cache.get(key);
			if (!entry) {
				expiredKeys.push(key);
				continue;
			}

			if (this.isExpired(entry)) {
				expiredKeys.push(key);
				continue;
			}

			schemas.push(entry.schema);
		}

		// Clean up expired keys
		for (const key of expiredKeys) {
			keys.delete(key);
		}

		return schemas;
	}

	/**
	 * Get all schemas of a specific kind
	 */
	getByKind(kind: TypeSchemaIdentifier["kind"]): AnyTypeSchema[] {
		if (!this.options.enabled) return [];

		const keys = this.kindIndex.get(kind);
		if (!keys) return [];

		const schemas: AnyTypeSchema[] = [];
		const expiredKeys: string[] = [];

		for (const key of keys) {
			const entry = this.cache.get(key);
			if (!entry) {
				expiredKeys.push(key);
				continue;
			}

			if (this.isExpired(entry)) {
				expiredKeys.push(key);
				continue;
			}

			schemas.push(entry.schema);
		}

		// Clean up expired keys
		for (const key of expiredKeys) {
			keys.delete(key);
		}

		return schemas;
	}

	/**
	 * Store multiple schemas at once
	 */
	setMany(schemas: AnyTypeSchema[]): void {
		if (!this.options.enabled) return;

		for (const schema of schemas) {
			this.set(schema);
		}
	}

	/**
	 * Clear all cached schemas
	 */
	clear(): void {
		this.cache.clear();
		this.urlIndex.clear();
		this.packageIndex.clear();
		this.kindIndex.clear();
	}

	/**
	 * Clear expired entries
	 */
	clearExpired(): number {
		if (!this.options.enabled) return 0;

		let removedCount = 0;
		const expiredKeys: string[] = [];

		for (const key of this.cache.keys()) {
			const entry = this.cache.get(key);
			if (entry && this.isExpired(entry)) {
				expiredKeys.push(key);
			}
		}

		for (const key of expiredKeys) {
			this.deleteByKey(key);
			removedCount++;
		}

		return removedCount;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		size: number;
		maxSize: number;
		hitRatio: number;
		expiredCount: number;
	} {
		const expiredCount = this.countExpiredEntries();

		return {
			size: this.cache.size(),
			maxSize: this.options.maxSize,
			hitRatio: 0, // Would need to track hits/misses
			expiredCount,
		};
	}

	/**
	 * Update cache options
	 */
	setOptions(options: Partial<CacheOptions>): void {
		this.options = { ...this.options, ...options };

		// Resize cache if needed
		if (options.maxSize && options.maxSize !== this.cache.size()) {
			const newCache = new LRUCache<string, CacheEntry>(options.maxSize);

			// Copy existing entries (up to new limit)
			let count = 0;
			for (const key of this.cache.keys()) {
				if (count >= options.maxSize) break;
				const entry = this.cache.get(key);
				if (entry) {
					newCache.set(key, entry);
					count++;
				}
			}

			this.cache = newCache;
		}
	}

	/**
	 * Get current cache options
	 */
	getOptions(): Required<CacheOptions> {
		return { ...this.options };
	}

	/**
	 * Generate cache key from identifier
	 */
	private generateKey(identifier: TypeSchemaIdentifier): string {
		return `${identifier.package}:${identifier.version}:${identifier.kind}:${identifier.name}`;
	}

	/**
	 * Check if entry is expired
	 */
	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > this.options.ttl;
	}

	/**
	 * Delete by internal key
	 */
	private deleteByKey(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) return false;

		const deleted = this.cache.delete(key);
		if (deleted) {
			this.removeFromIndexes(key, entry.schema.identifier);
		}

		return deleted;
	}

	/**
	 * Update indexes when adding entry
	 */
	private updateIndexes(key: string, identifier: TypeSchemaIdentifier): void {
		// Update URL index
		this.urlIndex.set(identifier.url, key);

		// Update package index
		let packageKeys = this.packageIndex.get(identifier.package);
		if (!packageKeys) {
			packageKeys = new Set();
			this.packageIndex.set(identifier.package, packageKeys);
		}
		packageKeys.add(key);

		// Update kind index
		let kindKeys = this.kindIndex.get(identifier.kind);
		if (!kindKeys) {
			kindKeys = new Set();
			this.kindIndex.set(identifier.kind, kindKeys);
		}
		kindKeys.add(key);
	}

	/**
	 * Remove from indexes when deleting entry
	 */
	private removeFromIndexes(
		key: string,
		identifier: TypeSchemaIdentifier,
	): void {
		// Remove from URL index
		this.urlIndex.delete(identifier.url);

		// Remove from package index
		const packageKeys = this.packageIndex.get(identifier.package);
		if (packageKeys) {
			packageKeys.delete(key);
			if (packageKeys.size === 0) {
				this.packageIndex.delete(identifier.package);
			}
		}

		// Remove from kind index
		const kindKeys = this.kindIndex.get(identifier.kind);
		if (kindKeys) {
			kindKeys.delete(key);
			if (kindKeys.size === 0) {
				this.kindIndex.delete(identifier.kind);
			}
		}
	}

	/**
	 * Count expired entries without removing them
	 */
	private countExpiredEntries(): number {
		let count = 0;
		// Convert keys to array to avoid iterator modification during iteration
		const keys = Array.from(this.cache.keys());
		for (const key of keys) {
			const entry = this.cache.get(key);
			if (entry && this.isExpired(entry)) {
				count++;
			}
		}
		return count;
	}
}

// Global cache instance
let globalCache: TypeSchemaCache | null = null;

/**
 * Get the global TypeSchema cache instance
 */
export function getGlobalCache(): TypeSchemaCache {
	if (!globalCache) {
		globalCache = new TypeSchemaCache();
	}
	return globalCache;
}

/**
 * Initialize global cache with options
 */
export function initializeGlobalCache(options: CacheOptions): TypeSchemaCache {
	globalCache = new TypeSchemaCache(options);
	return globalCache;
}

/**
 * Clear global cache
 */
export function clearGlobalCache(): void {
	if (globalCache) {
		globalCache.clear();
	}
}

/**
 * Convenience function to cache a schema using global cache
 */
export function cacheSchema(schema: AnyTypeSchema): void {
	const cache = getGlobalCache();
	cache.set(schema);
}

/**
 * Convenience function to retrieve a cached schema using global cache
 */
export function getCachedSchema(
	identifier: TypeSchemaIdentifier,
): AnyTypeSchema | null {
	const cache = getGlobalCache();
	return cache.get(identifier);
}

/**
 * Convenience function to check if schema is cached using global cache
 */
export function isCached(identifier: TypeSchemaIdentifier): boolean {
	const cache = getGlobalCache();
	return cache.has(identifier);
}
