/**
 * TypeSchema Cache System
 *
 * Caching system for TypeSchema documents with both in-memory and persistent file-based storage.
 */

import { existsSync, mkdirSync } from "node:fs";
import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TypeSchemaConfig } from "../config";
import type { TypeSchema, TypeSchemaIdentifier } from "./type-schema.types";

/**
 * Cached schema metadata for persistence
 */
interface CachedSchemaMetadata {
	schema: TypeSchema;
	timestamp: number;
	version: string;
}

/**
 * TypeSchema Cache with optional persistent storage
 */
export class TypeSchemaCache {
	private cache = new Map<string, TypeSchema>();
	private config: TypeSchemaConfig;
	private cacheDir?: string;

	constructor(config?: TypeSchemaConfig) {
		this.config = {
			enablePersistence: true,
			cacheDir: ".typeschema-cache",
			maxAge: 24 * 60 * 60 * 1000, // 24 hours
			validateCached: true,
			...config,
		};

		if (this.config.enablePersistence && this.config.cacheDir) {
			this.cacheDir = this.config.cacheDir;
		}
	}

	/**
	 * Store a schema in the cache
	 */
	async set(schema: TypeSchema): Promise<void> {
		const key = this.generateKey(schema.identifier);
		this.cache.set(key, schema);

		// Persist to disk if enabled
		if (this.config.enablePersistence && this.cacheDir) {
			await this.persistSchema(schema);
		}
	}

	/**
	 * Retrieve a schema by identifier
	 */
	get(identifier: TypeSchemaIdentifier): TypeSchema | null {
		const key = this.generateKey(identifier);
		return this.cache.get(key) || null;
	}

	/**
	 * Retrieve a schema by URL
	 */
	getByUrl(url: string): TypeSchema | null {
		for (const schema of this.cache.values()) {
			if (schema.identifier.url === url) {
				return schema;
			}
		}
		return null;
	}

	/**
	 * Check if a schema exists in cache
	 */
	has(identifier: TypeSchemaIdentifier): boolean {
		const key = this.generateKey(identifier);
		return this.cache.has(key);
	}

	/**
	 * Check if a schema exists by URL
	 */
	hasByUrl(url: string): boolean {
		for (const schema of this.cache.values()) {
			if (schema.identifier.url === url) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Delete a schema from cache
	 */
	delete(identifier: TypeSchemaIdentifier): boolean {
		const key = this.generateKey(identifier);
		return this.cache.delete(key);
	}

	/**
	 * Delete a schema by URL
	 */
	deleteByUrl(url: string): boolean {
		for (const [key, schema] of this.cache.entries()) {
			if (schema.identifier.url === url) {
				return this.cache.delete(key);
			}
		}
		return false;
	}

	/**
	 * Get schemas by package
	 */
	getByPackage(packageName: string): TypeSchema[] {
		const results: TypeSchema[] = [];
		for (const schema of this.cache.values()) {
			if (schema.identifier.package === packageName) {
				results.push(schema);
			}
		}
		return results;
	}

	/**
	 * Get schemas by kind
	 */
	getByKind(kind: string): TypeSchema[] {
		const results: TypeSchema[] = [];
		for (const schema of this.cache.values()) {
			if (schema.identifier.kind === kind) {
				results.push(schema);
			}
		}
		return results;
	}

	/**
	 * Store multiple schemas
	 */
	setMany(schemas: TypeSchema[]): void {
		for (const schema of schemas) {
			this.set(schema);
		}
	}

	/**
	 * Clear all cached schemas
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Generate cache key for identifier
	 */
	private generateKey(identifier: TypeSchemaIdentifier): string {
		return `${identifier.package}:${identifier.version}:${identifier.kind}:${identifier.name}`;
	}

	/**
	 * Initialize cache directory if persistence is enabled
	 */
	async initialize(): Promise<void> {
		if (this.config.enablePersistence && this.cacheDir) {
			// Ensure cache directory exists
			if (!existsSync(this.cacheDir)) {
				mkdirSync(this.cacheDir, { recursive: true });
			}

			// Load all cached schemas from disk
			await this.loadFromDisk();
		}
	}

	/**
	 * Load all cached schemas from disk
	 */
	private async loadFromDisk(): Promise<void> {
		if (!this.cacheDir || !existsSync(this.cacheDir)) {
			return;
		}

		try {
			const files = await readdir(this.cacheDir);
			const schemaFiles = files.filter((f) => f.endsWith(".typeschema.json"));

			for (const file of schemaFiles) {
				const filePath = join(this.cacheDir, file);
				const stats = await stat(filePath);

				// Check if cache is expired
				if (this.config.maxAge) {
					const age = Date.now() - stats.mtimeMs;
					if (age > this.config.maxAge) {
						// Remove expired cache file
						await unlink(filePath);
						continue;
					}
				}

				try {
					const content = await readFile(filePath, "utf-8");
					const metadata: CachedSchemaMetadata = JSON.parse(content);

					// Validate cached schema if configured
					if (this.config.validateCached) {
						// Basic validation - check required fields
						if (!metadata.schema?.identifier) {
							continue;
						}
					}

					// Add to in-memory cache
					const key = this.generateKey(metadata.schema.identifier);
					this.cache.set(key, metadata.schema);
				} catch (error) {
					console.warn(`Failed to load cached schema from ${file}:`, error);
				}
			}
		} catch (error) {
			console.warn("Failed to load cached schemas from disk:", error);
		}
	}

	/**
	 * Persist a schema to disk
	 */
	private async persistSchema(schema: TypeSchema): Promise<void> {
		if (!this.cacheDir) {
			return;
		}

		// Ensure cache directory exists
		if (!existsSync(this.cacheDir)) {
			mkdirSync(this.cacheDir, { recursive: true });
		}

		const metadata: CachedSchemaMetadata = {
			schema,
			timestamp: Date.now(),
			version: schema.identifier.version as string,
		};

		// Generate filename from identifier
		const fileName =
			`${schema.identifier.package}-${schema.identifier.version}-${schema.identifier.kind}-${schema.identifier.name}.typeschema.json`.replace(
				/[^a-zA-Z0-9.-]/g,
				"_",
			);

		const filePath = join(this.cacheDir, fileName);

		try {
			await writeFile(filePath, JSON.stringify(metadata, null, 2), "utf-8");
		} catch (error) {
			console.warn(`Failed to persist schema to ${filePath}:`, error);
		}
	}

	/**
	 * Clear cache directory
	 */
	async clearDisk(): Promise<void> {
		if (!this.cacheDir || !existsSync(this.cacheDir)) {
			return;
		}

		try {
			const files = await readdir(this.cacheDir);
			const schemaFiles = files.filter((f) => f.endsWith(".typeschema.json"));

			for (const file of schemaFiles) {
				await unlink(join(this.cacheDir, file));
			}
		} catch (error) {
			console.warn("Failed to clear cache directory:", error);
		}
	}
}

// Global cache instance
let globalCache: TypeSchemaCache | null = null;

/**
 * Get the global cache instance
 */
export function getGlobalCache(config?: TypeSchemaConfig): TypeSchemaCache {
	if (!globalCache) {
		globalCache = new TypeSchemaCache(config);
	}
	return globalCache;
}

/**
 * Initialize global cache with configuration
 */
export async function initializeGlobalCache(
	config?: TypeSchemaConfig,
): Promise<TypeSchemaCache> {
	globalCache = new TypeSchemaCache(config);
	await globalCache.initialize();
	return globalCache;
}

/**
 * Clear the global cache
 */
export function clearGlobalCache(): void {
	if (globalCache) {
		globalCache.clear();
	}
	globalCache = null;
}

/**
 * Cache a schema using global cache
 */
export function cacheSchema(schema: TypeSchema): void {
	getGlobalCache().set(schema);
}

/**
 * Get cached schema using global cache
 */
export function getCachedSchema(
	identifier: TypeSchemaIdentifier,
): TypeSchema | null {
	return getGlobalCache().get(identifier);
}

/**
 * Check if schema is cached using global cache
 */
export function isCached(identifier: TypeSchemaIdentifier): boolean {
	return getGlobalCache().has(identifier);
}
