/**
 * FHIR Pagination Helpers
 *
 * Provides comprehensive pagination support with async iterators, result processors,
 * and utilities for handling large datasets in FHIR search operations.
 */

import type { Bundle, BundleEntry } from "./batch";
import { FHIRError } from "./error-handling";

/**
 * Pagination configuration
 */
export interface PaginationConfig {
	/** Maximum number of pages to fetch (prevents infinite loops) */
	maxPages?: number;
	/** Maximum total resources to fetch across all pages */
	maxResources?: number;
	/** Page size (resources per page) */
	pageSize?: number;
	/** Timeout for each page request (ms) */
	pageTimeout?: number;
	/** Delay between page requests (ms) */
	pageDelay?: number;
	/** Whether to include total count in first request */
	includeTotalCount?: boolean;
}

/**
 * Bundle link for pagination
 */
export interface BundleLink {
	relation: "self" | "first" | "prev" | "next" | "last";
	url: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
	currentPage: number;
	totalPages?: number;
	totalResources?: number;
	resourcesPerPage?: number;
	hasNextPage: boolean;
	hasPrevPage: boolean;
	nextPageUrl?: string;
	prevPageUrl?: string;
	selfUrl?: string;
	firstPageUrl?: string;
	lastPageUrl?: string;
}

/**
 * Paginated search results with async iteration support
 */
export class PaginatedResults<T = any> implements AsyncIterable<T> {
	private currentBundle: Bundle<T>;
	private client: any;
	private config: PaginationConfig;
	private fetchedPages = 0;
	private fetchedResources = 0;
	private _totalCount?: number;

	constructor(
		client: any,
		initialBundle: Bundle<T>,
		config: PaginationConfig = {},
	) {
		this.client = client;
		this.currentBundle = initialBundle;
		this.config = {
			maxPages: 100,
			maxResources: 10000,
			pageTimeout: 30000,
			pageDelay: 0,
			includeTotalCount: true,
			...config,
		};

		// Extract total count if available
		this._totalCount = initialBundle.total;
	}

	/**
	 * Async iterator implementation
	 */
	async *[Symbol.asyncIterator](): AsyncIterator<T> {
		let currentBundle = this.currentBundle;
		this.fetchedPages = 1;

		while (currentBundle) {
			// Yield all resources in current bundle
			if (currentBundle.entry) {
				for (const entry of currentBundle.entry) {
					if (entry.resource && this.shouldYieldResource(entry)) {
						this.fetchedResources++;

						// Check resource limit
						if (
							this.config.maxResources &&
							this.fetchedResources > this.config.maxResources
						) {
							return;
						}

						yield entry.resource as T;
					}
				}
			}

			// Get next page
			const nextPageUrl = this.getNextPageUrl(currentBundle);

			if (!nextPageUrl) {
				break; // No more pages
			}

			// Check page limits
			if (this.config.maxPages && this.fetchedPages >= this.config.maxPages) {
				break;
			}

			// Add delay if configured
			if (this.config.pageDelay && this.config.pageDelay > 0) {
				await this.sleep(this.config.pageDelay);
			}

			try {
				// Fetch next page
				currentBundle = await this.fetchPage(nextPageUrl);
				this.fetchedPages++;
			} catch (error) {
				throw new FHIRError(
					`Failed to fetch page ${this.fetchedPages + 1}: ${error.message}`,
					{
						cause: error,
						retryable: true,
					},
				);
			}
		}
	}

	/**
	 * Check if a resource should be yielded (for filtering)
	 */
	protected shouldYieldResource(entry: BundleEntry<T>): boolean {
		// Only yield actual resources, not included resources or operation outcomes
		return entry.search?.mode === "match" || entry.search?.mode === undefined;
	}

	/**
	 * Get all resources as an array (loads all pages)
	 */
	async all(): Promise<T[]> {
		const results: T[] = [];
		for await (const resource of this) {
			results.push(resource);
		}
		return results;
	}

	/**
	 * Take only the first N resources
	 */
	async take(n: number): Promise<T[]> {
		const results: T[] = [];
		let count = 0;

		for await (const resource of this) {
			results.push(resource);
			count++;
			if (count >= n) break;
		}

		return results;
	}

	/**
	 * Skip the first N resources and return the rest
	 */
	async skip(n: number): Promise<T[]> {
		const results: T[] = [];
		let count = 0;

		for await (const resource of this) {
			if (count >= n) {
				results.push(resource);
			}
			count++;
		}

		return results;
	}

	/**
	 * Take N resources after skipping M resources
	 */
	async slice(skip: number, take: number): Promise<T[]> {
		const results: T[] = [];
		let count = 0;
		let taken = 0;

		for await (const resource of this) {
			if (count >= skip && taken < take) {
				results.push(resource);
				taken++;
			}
			count++;
			if (taken >= take) break;
		}

		return results;
	}

	/**
	 * Apply a filter function to the results
	 */
	async filter(
		predicate: (resource: T, index: number) => boolean,
	): Promise<T[]> {
		const results: T[] = [];
		let index = 0;

		for await (const resource of this) {
			if (predicate(resource, index)) {
				results.push(resource);
			}
			index++;
		}

		return results;
	}

	/**
	 * Apply a transform function to each resource
	 */
	async map<U>(transform: (resource: T, index: number) => U): Promise<U[]> {
		const results: U[] = [];
		let index = 0;

		for await (const resource of this) {
			results.push(transform(resource, index));
			index++;
		}

		return results;
	}

	/**
	 * Find the first resource matching a predicate
	 */
	async find(
		predicate: (resource: T, index: number) => boolean,
	): Promise<T | undefined> {
		let index = 0;

		for await (const resource of this) {
			if (predicate(resource, index)) {
				return resource;
			}
			index++;
		}

		return undefined;
	}

	/**
	 * Check if any resource matches a predicate
	 */
	async some(
		predicate: (resource: T, index: number) => boolean,
	): Promise<boolean> {
		let index = 0;

		for await (const resource of this) {
			if (predicate(resource, index)) {
				return true;
			}
			index++;
		}

		return false;
	}

	/**
	 * Check if all resources match a predicate
	 */
	async every(
		predicate: (resource: T, index: number) => boolean,
	): Promise<boolean> {
		let index = 0;

		for await (const resource of this) {
			if (!predicate(resource, index)) {
				return false;
			}
			index++;
		}

		return true;
	}

	/**
	 * Reduce resources to a single value
	 */
	async reduce<U>(
		reducer: (accumulator: U, resource: T, index: number) => U,
		initialValue: U,
	): Promise<U> {
		let accumulator = initialValue;
		let index = 0;

		for await (const resource of this) {
			accumulator = reducer(accumulator, resource, index);
			index++;
		}

		return accumulator;
	}

	/**
	 * Count total resources (may load all pages)
	 */
	async count(): Promise<number> {
		if (this._totalCount !== undefined) {
			return this._totalCount;
		}

		let count = 0;
		for await (const _ of this) {
			count++;
		}
		return count;
	}

	/**
	 * Get current pagination metadata
	 */
	getPaginationMeta(): PaginationMeta {
		const links = this.currentBundle.link || [];
		const linksMap = new Map(links.map((link) => [link.relation, link.url]));

		return {
			currentPage: this.fetchedPages,
			totalResources: this._totalCount,
			hasNextPage: linksMap.has("next"),
			hasPrevPage: linksMap.has("prev"),
			nextPageUrl: linksMap.get("next"),
			prevPageUrl: linksMap.get("prev"),
			selfUrl: linksMap.get("self"),
			firstPageUrl: linksMap.get("first"),
			lastPageUrl: linksMap.get("last"),
			resourcesPerPage: this.currentBundle.entry?.length,
		};
	}

	/**
	 * Get resources from current page only
	 */
	getCurrentPageResources(): T[] {
		if (!this.currentBundle.entry) {
			return [];
		}

		return this.currentBundle.entry
			.filter((entry) => this.shouldYieldResource(entry))
			.map((entry) => entry.resource as T);
	}

	/**
	 * Check if there are more pages available
	 */
	hasNextPage(): boolean {
		return this.getNextPageUrl(this.currentBundle) !== null;
	}

	/**
	 * Load the next page manually
	 */
	async loadNextPage(): Promise<boolean> {
		const nextPageUrl = this.getNextPageUrl(this.currentBundle);

		if (!nextPageUrl) {
			return false;
		}

		try {
			this.currentBundle = await this.fetchPage(nextPageUrl);
			this.fetchedPages++;
			return true;
		} catch (error) {
			throw new FHIRError(`Failed to load next page: ${error.message}`, {
				cause: error,
				retryable: true,
			});
		}
	}

	/**
	 * Get next page URL from bundle links
	 */
	private getNextPageUrl(bundle: Bundle<T>): string | null {
		const nextLink = bundle.link?.find((link) => link.relation === "next");
		return nextLink?.url || null;
	}

	/**
	 * Fetch a page from URL
	 */
	private async fetchPage(url: string): Promise<Bundle<T>> {
		// Create AbortController for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(
			() => controller.abort(),
			this.config.pageTimeout,
		);

		try {
			const result = await this.client.requestUrl(url, {
				signal: controller.signal,
			});
			clearTimeout(timeoutId);
			return result;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === "AbortError") {
				throw new FHIRError(
					`Page request timed out after ${this.config.pageTimeout}ms`,
				);
			}
			throw error;
		}
	}

	/**
	 * Sleep for specified milliseconds
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Convert to async generator for more advanced use cases
	 */
	async *asAsyncGenerator(): AsyncGenerator<T, void, unknown> {
		for await (const resource of this) {
			yield resource;
		}
	}

	/**
	 * Collect results into pages for batch processing
	 */
	async *pages(): AsyncGenerator<T[], void, unknown> {
		let currentBundle = this.currentBundle;
		let pageNumber = 0;

		while (currentBundle) {
			const resources =
				currentBundle.entry
					?.filter((entry) => this.shouldYieldResource(entry))
					?.map((entry) => entry.resource as T) || [];

			if (resources.length > 0) {
				yield resources;
			}

			pageNumber++;

			// Check limits
			if (this.config.maxPages && pageNumber >= this.config.maxPages) {
				break;
			}

			// Get next page
			const nextPageUrl = this.getNextPageUrl(currentBundle);
			if (!nextPageUrl) {
				break;
			}

			// Add delay if configured
			if (this.config.pageDelay && this.config.pageDelay > 0) {
				await this.sleep(this.config.pageDelay);
			}

			currentBundle = await this.fetchPage(nextPageUrl);
		}
	}
}

/**
 * Pagination helper utilities
 */
export class PaginationUtils {
	/**
	 * Extract page size from search parameters
	 */
	static getPageSize(params: Record<string, any>): number | undefined {
		const count = params._count || params.count;
		return count ? parseInt(count.toString(), 10) : undefined;
	}

	/**
	 * Extract offset from search parameters
	 */
	static getOffset(params: Record<string, any>): number | undefined {
		const offset = params._offset || params.offset;
		return offset ? parseInt(offset.toString(), 10) : undefined;
	}

	/**
	 * Build pagination parameters for FHIR search
	 */
	static buildPaginationParams(options: {
		pageSize?: number;
		offset?: number;
		includeTotalCount?: boolean;
	}): Record<string, any> {
		const params: Record<string, any> = {};

		if (options.pageSize) {
			params._count = options.pageSize;
		}

		if (options.offset) {
			params._offset = options.offset;
		}

		if (options.includeTotalCount) {
			params._total = "accurate";
		}

		return params;
	}

	/**
	 * Parse pagination info from bundle
	 */
	static parsePaginationInfo(bundle: Bundle): PaginationMeta {
		const links = bundle.link || [];
		const linksMap = new Map(links.map((link) => [link.relation, link.url]));

		// Extract page info from self link if available
		let currentPage = 1;
		const selfUrl = linksMap.get("self");
		if (selfUrl) {
			const url = new URL(selfUrl);
			const offset = url.searchParams.get("_offset");
			const count = url.searchParams.get("_count");
			if (offset && count) {
				currentPage =
					Math.floor(parseInt(offset, 10) / parseInt(count, 10)) + 1;
			}
		}

		return {
			currentPage,
			totalResources: bundle.total,
			hasNextPage: linksMap.has("next"),
			hasPrevPage: linksMap.has("prev"),
			nextPageUrl: linksMap.get("next"),
			prevPageUrl: linksMap.get("prev"),
			selfUrl: linksMap.get("self"),
			firstPageUrl: linksMap.get("first"),
			lastPageUrl: linksMap.get("last"),
			resourcesPerPage: bundle.entry?.length,
		};
	}
}

/**
 * Generate pagination support code for REST client
 */
export function generatePaginationCode(): string {
	return `
  /**
   * Perform a paginated search
   */
  async searchPaginated<T>(
    resourceType: string,
    params?: Record<string, any>,
    config?: PaginationConfig
  ): Promise<PaginatedResults<T>> {
    // Add pagination parameters
    const searchParams = {
      ...params,
      ...PaginationUtils.buildPaginationParams({
        pageSize: config?.pageSize,
        includeTotalCount: config?.includeTotalCount
      })
    };

    const initialBundle = await this.search<T>(resourceType, searchParams);
    return new PaginatedResults<T>(this, initialBundle.data, config);
  }

  /**
   * Request a URL directly (for pagination)
   */
  async requestUrl<T = any>(url: string, options?: RequestInit): Promise<T> {
    // Handle full URLs vs relative URLs
    const requestUrl = url.startsWith('http') ? url : \`\${this.baseUrl}/\${url}\`;
    
    const config: RequestInit = {
      method: 'GET',
      headers: this.headers,
      ...options
    };

    const response = await fetch(requestUrl, config);
    
    if (!response.ok) {
      throw await FHIRErrorFactory.fromResponse(response, requestUrl);
    }

    return response.json();
  }
  `;
}
