/**
 * FHIR Client Caching Support
 *
 * Implements comprehensive caching with TTL, invalidation strategies,
 * cache policies, and performance optimization for FHIR operations.
 */

import { FHIRError } from "./error-handling";

/**
 * Cache entry interface
 */
export interface CacheEntry<T = any> {
	/** Cached data */
	data: T;
	/** Cache creation timestamp */
	timestamp: number;
	/** Time-to-live in milliseconds */
	ttl: number;
	/** ETag for conditional requests */
	etag?: string;
	/** Last-Modified header */
	lastModified?: string;
	/** Access count for LRU */
	accessCount: number;
	/** Last access timestamp */
	lastAccess: number;
	/** Cache tags for invalidation */
	tags: Set<string>;
	/** Resource type */
	resourceType?: string;
	/** Resource ID */
	resourceId?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
	hits: number;
	misses: number;
	sets: number;
	evictions: number;
	size: number;
	hitRate: number;
	totalRequests: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
	/** Default TTL in milliseconds */
	defaultTTL: number;
	/** Maximum cache size */
	maxSize?: number;
	/** Cache eviction strategy */
	evictionStrategy?: "lru" | "lfu" | "ttl" | "fifo";
	/** Whether to use conditional requests */
	useConditionalRequests?: boolean;
	/** Custom cache key generator */
	keyGenerator?: (method: string, url: string, body?: any) => string;
	/** TTL per resource type */
	resourceTTLs?: Record<string, number>;
	/** Whether to cache errors */
	cacheErrors?: boolean;
	/** Error cache TTL */
	errorTTL?: number;
	/** Whether to enable cache statistics */
	enableStats?: boolean;
}

/**
 * Cache invalidation strategy
 */
export interface CacheInvalidationStrategy {
	/** Strategy name */
	name: string;
	/** Check if entry should be invalidated */
	shouldInvalidate(
		entry: CacheEntry,
		context: {
			method: string;
			url: string;
			resourceType?: string;
			resourceId?: string;
			data?: any;
		},
	): boolean;
}

/**
 * FHIR-aware cache implementation
 */
export class FHIRCache {
	private cache = new Map<string, CacheEntry>();
	private stats: CacheStats = {
		hits: 0,
		misses: 0,
		sets: 0,
		evictions: 0,
		size: 0,
		hitRate: 0,
		totalRequests: 0,
	};
	private invalidationStrategies: CacheInvalidationStrategy[] = [];

	constructor(private config: CacheConfig) {
		// Add default invalidation strategies
		this.addInvalidationStrategy(new ResourceMutationInvalidationStrategy());
		this.addInvalidationStrategy(new TagBasedInvalidationStrategy());
	}

	/**
	 * Get cached entry
	 */
	get<T = any>(key: string): T | null {
		this.updateStats("request");

		const entry = this.cache.get(key);

		if (!entry) {
			this.updateStats("miss");
			return null;
		}

		// Check if entry is expired
		if (this.isExpired(entry)) {
			this.cache.delete(key);
			this.updateStats("miss");
			return null;
		}

		// Update access info for LRU
		entry.accessCount++;
		entry.lastAccess = Date.now();

		this.updateStats("hit");
		return entry.data as T;
	}

	/**
	 * Set cache entry
	 */
	set<T = any>(
		key: string,
		data: T,
		options: {
			ttl?: number;
			etag?: string;
			lastModified?: string;
			tags?: string[];
			resourceType?: string;
			resourceId?: string;
		} = {},
	): void {
		// Determine TTL
		const ttl =
			options.ttl ||
			(options.resourceType
				? this.config.resourceTTLs?.[options.resourceType]
				: undefined) ||
			this.config.defaultTTL;

		const entry: CacheEntry<T> = {
			data,
			timestamp: Date.now(),
			ttl,
			etag: options.etag,
			lastModified: options.lastModified,
			accessCount: 1,
			lastAccess: Date.now(),
			tags: new Set(options.tags || []),
			resourceType: options.resourceType,
			resourceId: options.resourceId,
		};

		// Add default tags
		if (options.resourceType) {
			entry.tags.add(`resource:${options.resourceType}`);
		}
		if (options.resourceId && options.resourceType) {
			entry.tags.add(`resource:${options.resourceType}:${options.resourceId}`);
		}

		// Check cache size and evict if necessary
		if (this.config.maxSize && this.cache.size >= this.config.maxSize) {
			this.evictEntries(1);
		}

		this.cache.set(key, entry);
		this.updateStats("set");
	}

	/**
	 * Check if cache has key
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);
		return entry !== undefined && !this.isExpired(entry);
	}

	/**
	 * Delete cache entry
	 */
	delete(key: string): boolean {
		return this.cache.delete(key);
	}

	/**
	 * Clear entire cache
	 */
	clear(): void {
		this.cache.clear();
		this.resetStats();
	}

	/**
	 * Invalidate entries by tag
	 */
	invalidateByTag(tag: string): number {
		let invalidated = 0;

		for (const [key, entry] of this.cache.entries()) {
			if (entry.tags.has(tag)) {
				this.cache.delete(key);
				invalidated++;
			}
		}

		this.updateStats("eviction", invalidated);
		return invalidated;
	}

	/**
	 * Invalidate entries by resource type
	 */
	invalidateByResourceType(resourceType: string): number {
		return this.invalidateByTag(`resource:${resourceType}`);
	}

	/**
	 * Invalidate specific resource
	 */
	invalidateResource(resourceType: string, resourceId: string): number {
		return this.invalidateByTag(`resource:${resourceType}:${resourceId}`);
	}

	/**
	 * Invalidate based on mutation
	 */
	invalidateByMutation(method: string, url: string, data?: any): number {
		const context = {
			method,
			url,
			resourceType: this.extractResourceType(url),
			resourceId: this.extractResourceId(url),
			data,
		};

		let invalidated = 0;
		const toDelete: string[] = [];

		for (const [key, entry] of this.cache.entries()) {
			for (const strategy of this.invalidationStrategies) {
				if (strategy.shouldInvalidate(entry, context)) {
					toDelete.push(key);
					invalidated++;
					break;
				}
			}
		}

		for (const key of toDelete) {
			this.cache.delete(key);
		}

		this.updateStats("eviction", invalidated);
		return invalidated;
	}

	/**
	 * Get cache statistics
	 */
	getStats(): CacheStats {
		return { ...this.stats, size: this.cache.size };
	}

	/**
	 * Reset cache statistics
	 */
	resetStats(): void {
		this.stats = {
			hits: 0,
			misses: 0,
			sets: 0,
			evictions: 0,
			size: this.cache.size,
			hitRate: 0,
			totalRequests: 0,
		};
	}

	/**
	 * Add invalidation strategy
	 */
	addInvalidationStrategy(strategy: CacheInvalidationStrategy): void {
		this.invalidationStrategies.push(strategy);
	}

	/**
	 * Remove invalidation strategy
	 */
	removeInvalidationStrategy(name: string): void {
		this.invalidationStrategies = this.invalidationStrategies.filter(
			(s) => s.name !== name,
		);
	}

	/**
	 * Cleanup expired entries
	 */
	cleanup(): number {
		let cleaned = 0;
		const now = Date.now();

		for (const [key, entry] of this.cache.entries()) {
			if (now - entry.timestamp > entry.ttl) {
				this.cache.delete(key);
				cleaned++;
			}
		}

		this.updateStats("eviction", cleaned);
		return cleaned;
	}

	/**
	 * Get cache entries sorted by access pattern
	 */
	private getSortedEntries(): Array<[string, CacheEntry]> {
		const entries = Array.from(this.cache.entries());

		switch (this.config.evictionStrategy) {
			case "lru":
				return entries.sort((a, b) => a[1].lastAccess - b[1].lastAccess);
			case "lfu":
				return entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
			case "ttl":
				return entries.sort(
					(a, b) => a[1].timestamp + a[1].ttl - (b[1].timestamp + b[1].ttl),
				);
			default:
				return entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
		}
	}

	/**
	 * Evict entries from cache
	 */
	private evictEntries(count: number): void {
		const sortedEntries = this.getSortedEntries();

		for (let i = 0; i < Math.min(count, sortedEntries.length); i++) {
			const [key] = sortedEntries[i];
			this.cache.delete(key);
		}

		this.updateStats("eviction", count);
	}

	/**
	 * Check if cache entry is expired
	 */
	private isExpired(entry: CacheEntry): boolean {
		return Date.now() - entry.timestamp > entry.ttl;
	}

	/**
	 * Update cache statistics
	 */
	private updateStats(
		type: "hit" | "miss" | "set" | "eviction" | "request",
		count = 1,
	): void {
		if (!this.config.enableStats) return;

		switch (type) {
			case "hit":
				this.stats.hits += count;
				break;
			case "miss":
				this.stats.misses += count;
				break;
			case "set":
				this.stats.sets += count;
				break;
			case "eviction":
				this.stats.evictions += count;
				break;
			case "request":
				this.stats.totalRequests += count;
				break;
		}

		this.stats.size = this.cache.size;
		this.stats.hitRate =
			this.stats.totalRequests > 0
				? this.stats.hits / this.stats.totalRequests
				: 0;
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
		const match = url.match(/^[A-Z][a-zA-Z]+\/([a-zA-Z0-9\-.]+)/);
		return match?.[1];
	}
}

/**
 * Resource mutation invalidation strategy
 */
export class ResourceMutationInvalidationStrategy
	implements CacheInvalidationStrategy
{
	name = "resource-mutation";

	shouldInvalidate(
		entry: CacheEntry,
		context: {
			method: string;
			url: string;
			resourceType?: string;
			resourceId?: string;
		},
	): boolean {
		// Skip GET requests
		if (context.method === "GET") {
			return false;
		}

		// Invalidate if affecting the same resource type
		if (context.resourceType && entry.resourceType === context.resourceType) {
			// For specific resource operations, only invalidate related entries
			if (context.resourceId && entry.resourceId) {
				return entry.resourceId === context.resourceId;
			}
			// For type-level operations, invalidate all resources of that type
			return true;
		}

		return false;
	}
}

/**
 * Tag-based invalidation strategy
 */
export class TagBasedInvalidationStrategy implements CacheInvalidationStrategy {
	name = "tag-based";

	shouldInvalidate(
		entry: CacheEntry,
		context: {
			method: string;
			resourceType?: string;
			resourceId?: string;
		},
	): boolean {
		if (!context.resourceType) return false;

		// Check if entry has relevant tags
		const resourceTag = `resource:${context.resourceType}`;
		const specificTag = context.resourceId
			? `resource:${context.resourceType}:${context.resourceId}`
			: null;

		return (
			entry.tags.has(resourceTag) ||
			(specificTag && entry.tags.has(specificTag))
		);
	}
}

/**
 * Cache-aware HTTP client wrapper
 */
export class CachedHTTPClient {
	private cache: FHIRCache;

	constructor(
		private httpClient: (
			method: string,
			url: string,
			data?: any,
			headers?: Record<string, string>,
		) => Promise<any>,
		config: CacheConfig,
	) {
		this.cache = new FHIRCache(config);
	}

	/**
	 * Make cached HTTP request
	 */
	async request<T = any>(
		method: string,
		url: string,
		data?: any,
		headers: Record<string, string> = {},
	): Promise<T> {
		const cacheKey = this.generateCacheKey(method, url, data);

		// Only cache GET requests by default
		if (method.toUpperCase() === "GET") {
			const cached = this.cache.get<T>(cacheKey);
			if (cached !== null) {
				return cached;
			}
		}
		// Make the actual request
		const response = await this.httpClient(method, url, data, headers);

		// Cache successful GET responses
		if (method.toUpperCase() === "GET" && response) {
			const resourceType = this.extractResourceType(url);
			const resourceId = this.extractResourceId(url);

			this.cache.set(cacheKey, response, {
				resourceType,
				resourceId,
				etag: response.headers?.etag,
				lastModified: response.headers?.["last-modified"],
			});
		}

		// Invalidate cache for mutations
		if (["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())) {
			this.cache.invalidateByMutation(method, url, data);
		}

		return response;
	}

	/**
	 * Get cache instance
	 */
	getCache(): FHIRCache {
		return this.cache;
	}

	/**
	 * Generate cache key
	 */
	private generateCacheKey(method: string, url: string, data?: any): string {
		if (this.cache.config.keyGenerator) {
			return this.cache.config.keyGenerator(method, url, data);
		}

		const baseKey = `${method.toUpperCase()}:${url}`;

		if (data && method.toUpperCase() === "GET") {
			const params = new URLSearchParams(data).toString();
			return params ? `${baseKey}?${params}` : baseKey;
		}

		return baseKey;
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
		const match = url.match(/^[A-Z][a-zA-Z]+\/([a-zA-Z0-9\-.]+)/);
		return match?.[1];
	}
}

/**
 * Cache manager for multiple cache instances
 */
export class CacheManager {
	private caches = new Map<string, FHIRCache>();

	/**
	 * Create or get cache instance
	 */
	getCache(name: string, config?: CacheConfig): FHIRCache {
		if (!this.caches.has(name)) {
			if (!config) {
				throw new FHIRError(`Cache '${name}' not found and no config provided`);
			}
			this.caches.set(name, new FHIRCache(config));
		}

		return this.caches.get(name)!;
	}

	/**
	 * Remove cache instance
	 */
	removeCache(name: string): boolean {
		const cache = this.caches.get(name);
		if (cache) {
			cache.clear();
			return this.caches.delete(name);
		}
		return false;
	}

	/**
	 * Clear all caches
	 */
	clearAll(): void {
		for (const cache of this.caches.values()) {
			cache.clear();
		}
	}

	/**
	 * Get aggregate statistics
	 */
	getAggregateStats(): CacheStats {
		const aggregate: CacheStats = {
			hits: 0,
			misses: 0,
			sets: 0,
			evictions: 0,
			size: 0,
			hitRate: 0,
			totalRequests: 0,
		};

		for (const cache of this.caches.values()) {
			const stats = cache.getStats();
			aggregate.hits += stats.hits;
			aggregate.misses += stats.misses;
			aggregate.sets += stats.sets;
			aggregate.evictions += stats.evictions;
			aggregate.size += stats.size;
			aggregate.totalRequests += stats.totalRequests;
		}

		aggregate.hitRate =
			aggregate.totalRequests > 0
				? aggregate.hits / aggregate.totalRequests
				: 0;

		return aggregate;
	}

	/**
	 * Cleanup all caches
	 */
	cleanupAll(): number {
		let totalCleaned = 0;
		for (const cache of this.caches.values()) {
			totalCleaned += cache.cleanup();
		}
		return totalCleaned;
	}
}

/**
 * Generate caching support code for REST client
 */
export function generateCachingCode(): string {
	return `
  private cache?: FHIRCache;
  private cacheManager = new CacheManager();

  /**
   * Enable caching with configuration
   */
  enableCache(config: CacheConfig): void {
    this.cache = new FHIRCache(config);
    
    // Wrap the request method with caching
    const originalRequest = this.request.bind(this);
    this.request = async <T = any>(method: string, url: string, data?: any, headers?: Record<string, string>): Promise<T> => {
      const cacheKey = this.generateCacheKey(method, url, data);
      
      // Try to get from cache for GET requests
      if (method.toUpperCase() === 'GET' && this.cache) {
        const cached = this.cache.get<T>(cacheKey);
        if (cached !== null) {
          return cached;
        }
      }

      // Make the request
      const response = await originalRequest<T>(method, url, data, headers);

      // Cache successful GET responses
      if (method.toUpperCase() === 'GET' && this.cache && response) {
        const resourceType = this.extractResourceType(url);
        const resourceId = this.extractResourceId(url);
        
        this.cache.set(cacheKey, response, {
          resourceType,
          resourceId
        });
      }

      // Invalidate cache for mutations
      if (this.cache && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) {
        this.cache.invalidateByMutation(method, url, data);
      }

      return response;
    };
  }

  /**
   * Disable caching
   */
  disableCache(): void {
    if (this.cache) {
      this.cache.clear();
      this.cache = undefined;
    }
  }

  /**
   * Get cache instance
   */
  getCache(): FHIRCache | undefined {
    return this.cache;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): CacheStats | null {
    return this.cache?.getStats() ?? null;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Invalidate cache by resource type
   */
  invalidateCacheByResourceType(resourceType: string): number {
    return this.cache?.invalidateByResourceType(resourceType) ?? 0;
  }

  /**
   * Invalidate specific resource
   */
  invalidateCacheForResource(resourceType: string, resourceId: string): number {
    return this.cache?.invalidateResource(resourceType, resourceId) ?? 0;
  }

  /**
   * Cleanup expired cache entries
   */
  cleanupCache(): number {
    return this.cache?.cleanup() ?? 0;
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(method: string, url: string, data?: any): string {
    const baseKey = \`\${method.toUpperCase()}:\${url}\`;
    
    if (data && method.toUpperCase() === 'GET') {
      const params = new URLSearchParams(data).toString();
      return params ? \`\${baseKey}?\${params}\` : baseKey;
    }
    
    return baseKey;
  }
  `;
}
