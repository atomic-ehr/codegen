/**
 * Core Utilities Export
 *
 * High-performance utilities for the API-first codegen architecture
 */

// Export moved utilities from lib
export * from "./code";
export * from "./errors";

// Export file utilities
export * from "./file";
export * from "./lib-naming";
export * from "./lib-utils-naming";
export * from "./logger";
// Export naming utilities
export * from "./naming";
// Performance and caching utilities
export { createLRUCache, type LRUCache } from "./performance";
// Export string utilities
export * from "./string";
// Export template utilities
export * from "./template";

/**
 * Utility collections for common operations
 */
export const Utils = {
	// Naming utilities
	naming: {
		toCamelCase: async (str: string) =>
			(await import("./naming")).toCamelCase(str),
		toPascalCase: async (str: string) =>
			(await import("./naming")).toPascalCase(str),
		toSnakeCase: async (str: string) =>
			(await import("./naming")).toSnakeCase(str),
		toKebabCase: async (str: string) =>
			(await import("./naming")).toKebabCase(str),
	},

	// String utilities
	string: {
		truncate: async (str: string, length: number) =>
			(await import("./string")).truncate(str, length),
		slugify: async (str: string) => (await import("./string")).slugify(str),
		similarity: async (str1: string, str2: string) =>
			(await import("./string")).similarity(str1, str2),
	},

	// File utilities
	file: {
		readText: async (path: string) =>
			(await import("./file")).FileReader.readText(path),
		writeText: async (path: string, content: string) =>
			(await import("./file")).FileWriter.writeText(path, content),
		exists: async (path: string) =>
			(await import("./file")).FileReader.exists(path),
	},

	// Template utilities
	template: {
		render: async (template: string, context: any) =>
			(await import("./template")).render(template, context),
		compile: async (template: string) =>
			(await import("./template")).templateEngine.compile(template),
	},
} as const;

/**
 * Batch processing utilities
 */
export const BatchUtils = {
	/**
	 * Process array in batches to avoid memory issues
	 */
	async processBatch<T, R>(
		items: T[],
		processor: (item: T, index: number) => Promise<R> | R,
		options?: {
			batchSize?: number;
			concurrency?: number;
			onProgress?: (completed: number, total: number) => void;
		},
	): Promise<R[]> {
		const { batchSize = 100, concurrency = 5, onProgress } = options || {};
		const results: R[] = [];

		for (let i = 0; i < items.length; i += batchSize) {
			const batch = items.slice(i, i + batchSize);
			const batchPromises = batch.map((item, index) =>
				processor(item, i + index),
			);

			// Process batch with concurrency limit
			const batchResults = await Promise.all(batchPromises);
			results.push(...batchResults);

			if (onProgress) {
				onProgress(Math.min(i + batchSize, items.length), items.length);
			}
		}

		return results;
	},

	/**
	 * Process items with concurrency control
	 */
	async processWithConcurrency<T, R>(
		items: T[],
		processor: (item: T, index: number) => Promise<R>,
		concurrency = 5,
	): Promise<R[]> {
		const results: R[] = new Array(items.length);
		const executing: Promise<void>[] = [];

		for (let i = 0; i < items.length; i++) {
			const promise = processor(items[i], i).then((result) => {
				results[i] = result;
			});

			executing.push(promise);

			if (executing.length >= concurrency) {
				await Promise.race(executing);
				const settled = executing.filter((p, _index) => {
					// Remove settled promises
					return p.then(
						() => false,
						() => false,
					);
				});
				executing.splice(0, executing.length, ...settled);
			}
		}

		await Promise.all(executing);
		return results;
	},
};

/**
 * Memory management utilities
 */
export const MemoryUtils = {
	/**
	 * Get current memory usage
	 */
	getMemoryUsage(): NodeJS.MemoryUsage {
		return process.memoryUsage();
	},

	/**
	 * Format memory size for display
	 */
	formatMemorySize(bytes: number): string {
		const units = ["B", "KB", "MB", "GB"];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(2)} ${units[unitIndex]}`;
	},

	/**
	 * Monitor memory usage
	 */
	createMemoryMonitor(options?: {
		interval?: number;
		threshold?: number;
		onThreshold?: (usage: NodeJS.MemoryUsage) => void;
	}): () => void {
		const {
			interval = 5000,
			threshold = 500 * 1024 * 1024,
			onThreshold,
		} = options || {};

		const intervalId = setInterval(() => {
			const usage = this.getMemoryUsage();

			if (threshold && usage.heapUsed > threshold && onThreshold) {
				onThreshold(usage);
			}
		}, interval);

		return () => clearInterval(intervalId);
	},
};

/**
 * Timing utilities
 */
export const TimingUtils = {
	/**
	 * Measure execution time
	 */
	async time<T>(label: string, operation: () => Promise<T> | T): Promise<T> {
		const start = process.hrtime.bigint();

		try {
			const result = await operation();
			return result;
		} finally {
			const end = process.hrtime.bigint();
			const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
			console.log(`${label}: ${duration.toFixed(2)}ms`);
		}
	},

	/**
	 * Create a timer
	 */
	createTimer(): {
		start: () => void;
		stop: () => number;
		elapsed: () => number;
	} {
		let startTime: bigint | null = null;
		let endTime: bigint | null = null;

		return {
			start: () => {
				startTime = process.hrtime.bigint();
				endTime = null;
			},

			stop: () => {
				if (startTime === null) {
					throw new Error("Timer not started");
				}
				endTime = process.hrtime.bigint();
				return Number(endTime - startTime) / 1_000_000;
			},

			elapsed: () => {
				if (startTime === null) {
					return 0;
				}
				const currentTime = endTime || process.hrtime.bigint();
				return Number(currentTime - startTime) / 1_000_000;
			},
		};
	},

	/**
	 * Debounce function calls
	 */
	debounce<T extends (...args: any[]) => any>(
		func: T,
		wait: number,
	): (...args: Parameters<T>) => void {
		let timeoutId: NodeJS.Timeout | null = null;

		return (...args: Parameters<T>) => {
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			timeoutId = setTimeout(() => {
				func(...args);
			}, wait);
		};
	},

	/**
	 * Throttle function calls
	 */
	throttle<T extends (...args: any[]) => any>(
		func: T,
		limit: number,
	): (...args: Parameters<T>) => void {
		let inThrottle = false;

		return (...args: Parameters<T>) => {
			if (!inThrottle) {
				func(...args);
				inThrottle = true;
				setTimeout(() => {
					inThrottle = false;
				}, limit);
			}
		};
	},
};

/**
 * Validation utilities
 */
export const ValidationUtils = {
	/**
	 * Check if value is empty
	 */
	isEmpty(value: any): boolean {
		if (value == null) return true;
		if (typeof value === "string") return value.trim().length === 0;
		if (Array.isArray(value)) return value.length === 0;
		if (typeof value === "object") return Object.keys(value).length === 0;
		return false;
	},

	/**
	 * Validate email format
	 */
	isValidEmail(email: string): boolean {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		return emailRegex.test(email);
	},

	/**
	 * Validate URL format
	 */
	isValidUrl(url: string): boolean {
		try {
			new URL(url);
			return true;
		} catch {
			return false;
		}
	},

	/**
	 * Validate semantic version
	 */
	isValidSemver(version: string): boolean {
		const semverRegex =
			/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
		return semverRegex.test(version);
	},

	/**
	 * Validate JSON string
	 */
	isValidJson(str: string): boolean {
		try {
			JSON.parse(str);
			return true;
		} catch {
			return false;
		}
	},
};

/**
 * Array utilities
 */
export const ArrayUtils = {
	/**
	 * Chunk array into smaller arrays
	 */
	chunk<T>(array: T[], size: number): T[][] {
		const chunks: T[][] = [];
		for (let i = 0; i < array.length; i += size) {
			chunks.push(array.slice(i, i + size));
		}
		return chunks;
	},

	/**
	 * Remove duplicates from array
	 */
	unique<T>(array: T[], keyFn?: (item: T) => any): T[] {
		if (!keyFn) {
			return [...new Set(array)];
		}

		const seen = new Set();
		return array.filter((item) => {
			const key = keyFn(item);
			if (seen.has(key)) {
				return false;
			}
			seen.add(key);
			return true;
		});
	},

	/**
	 * Group array by key
	 */
	groupBy<T, K extends string | number | symbol>(
		array: T[],
		keyFn: (item: T) => K,
	): Record<K, T[]> {
		const groups = {} as Record<K, T[]>;

		for (const item of array) {
			const key = keyFn(item);
			if (!groups[key]) {
				groups[key] = [];
			}
			groups[key].push(item);
		}

		return groups;
	},

	/**
	 * Flatten nested arrays
	 */
	flatten<T>(array: (T | T[])[]): T[] {
		const result: T[] = [];

		for (const item of array) {
			if (Array.isArray(item)) {
				result.push(...this.flatten(item));
			} else {
				result.push(item);
			}
		}

		return result;
	},
};

/**
 * Object utilities
 */
export const ObjectUtils = {
	/**
	 * Deep merge objects
	 */
	merge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
		if (!sources.length) return target;

		const source = sources.shift();
		if (!source) return target;

		for (const key in source) {
			const value = source[key];

			if (
				value !== null &&
				typeof value === "object" &&
				!Array.isArray(value)
			) {
				if (!target[key] || typeof target[key] !== "object") {
					target[key] = {} as any;
				}
				this.merge(target[key], value);
			} else {
				target[key] = value as any;
			}
		}

		return this.merge(target, ...sources);
	},

	/**
	 * Deep clone object
	 */
	clone<T>(obj: T): T {
		if (obj === null || typeof obj !== "object") return obj;
		if (obj instanceof Date) return new Date(obj) as any;
		if (Array.isArray(obj)) return obj.map(this.clone) as any;

		const cloned = {} as T;
		for (const key in obj) {
			cloned[key] = this.clone(obj[key]);
		}

		return cloned;
	},

	/**
	 * Pick properties from object
	 */
	pick<T extends Record<string, any>, K extends keyof T>(
		obj: T,
		keys: K[],
	): Pick<T, K> {
		const result = {} as Pick<T, K>;

		for (const key of keys) {
			if (key in obj) {
				result[key] = obj[key];
			}
		}

		return result;
	},

	/**
	 * Omit properties from object
	 */
	omit<T extends Record<string, any>, K extends keyof T>(
		obj: T,
		keys: K[],
	): Omit<T, K> {
		const result = { ...obj } as any;

		for (const key of keys) {
			delete result[key];
		}

		return result;
	},
};
