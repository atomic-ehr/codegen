/**
 * FHIR Conditional Request Support
 *
 * Implements conditional FHIR operations including create-if-not-exists,
 * update-if-exists, delete-if-exists, and other conditional operations
 * with comprehensive validation and error handling.
 */

import type { Bundle } from "./batch";
import { FHIRError } from "./error-handling";

/**
 * Conditional operation types
 */
export type ConditionalOperation =
	| "create-if-not-exists"
	| "update-if-exists"
	| "update-if-matches"
	| "delete-if-exists"
	| "delete-if-matches"
	| "patch-if-exists"
	| "patch-if-matches";

/**
 * Conditional request options
 */
export interface ConditionalRequestOptions {
	/** Search parameters for the condition */
	searchParams?: Record<string, any>;
	/** ETag for version-based conditions */
	etag?: string;
	/** Last-Modified date for time-based conditions */
	lastModified?: Date;
	/** Custom if-none-exist header value */
	ifNoneExist?: string;
	/** Custom if-match header value */
	ifMatch?: string;
	/** Custom if-none-match header value */
	ifNoneMatch?: string;
	/** Custom if-modified-since header value */
	ifModifiedSince?: string;
	/** Custom if-unmodified-since header value */
	ifUnmodifiedSince?: string;
	/** Return preference (minimal, representation, OperationOutcome) */
	prefer?: "minimal" | "representation" | "OperationOutcome";
}

/**
 * Conditional request result
 */
export interface ConditionalRequestResult<T = any> {
	/** The resource if returned */
	resource?: T;
	/** Whether the operation was performed */
	performed: boolean;
	/** HTTP status code */
	status: number;
	/** Location header if resource was created */
	location?: string;
	/** ETag if provided */
	etag?: string;
	/** Last-Modified if provided */
	lastModified?: Date;
	/** Operation outcome if provided */
	operationOutcome?: any;
}

/**
 * Conditional operations handler
 */
export class ConditionalOperations {
	constructor(private client: any) {}

	/**
	 * Create a resource only if it doesn't already exist
	 * Uses If-None-Exist header or conditional creation
	 */
	async createIfNotExists<T extends { resourceType: string }>(
		resource: T,
		options: ConditionalRequestOptions = {},
	): Promise<ConditionalRequestResult<T>> {
		// First approach: Use If-None-Exist header if search params provided
		if (options.searchParams || options.ifNoneExist) {
			const ifNoneExist =
				options.ifNoneExist ||
				this.buildSearchString(options.searchParams || {});

			try {
				const result = await this.client.request<T>(
					"POST",
					resource.resourceType,
					resource,
					{
						"If-None-Exist": ifNoneExist,
						Prefer: options.prefer ? `return=${options.prefer}` : undefined,
					},
				);

				return {
					resource: result.data,
					performed: result.status === 201,
					status: result.status,
					location: result.headers["location"],
					etag: result.headers["etag"],
					lastModified: result.headers["last-modified"]
						? new Date(result.headers["last-modified"])
						: undefined,
				};
			} catch (error) {
				// Handle precondition failed (resource already exists)
				if (error instanceof FHIRError && error.status === 412) {
					// Search for the existing resource
					const existing = await this.searchForExisting<T>(
						resource.resourceType,
						options.searchParams || {},
					);

					return {
						resource: existing,
						performed: false,
						status: 412,
					};
				}
				throw error;
			}
		}

		// Second approach: Search first, then create if not found
		try {
			const existing = await this.searchForExisting<T>(
				resource.resourceType,
				options.searchParams || {},
			);

			if (existing) {
				return {
					resource: existing,
					performed: false,
					status: 200,
				};
			}

			// Resource doesn't exist, create it
			const result = await this.client.create<T>(
				resource.resourceType,
				resource,
			);
			return {
				resource: result.data,
				performed: true,
				status: result.status,
				location: result.headers["location"],
				etag: result.headers["etag"],
				lastModified: result.headers["last-modified"]
					? new Date(result.headers["last-modified"])
					: undefined,
			};
		} catch (error) {
			throw new FHIRError(
				`Failed to create resource conditionally: ${error.message}`,
				{ cause: error },
			);
		}
	}

	/**
	 * Update a resource conditionally based on search parameters
	 */
	async updateConditional<T extends { resourceType: string }>(
		resource: T,
		options: ConditionalRequestOptions,
	): Promise<ConditionalRequestResult<T>> {
		if (!options.searchParams && !options.ifNoneExist) {
			throw new FHIRError(
				"Conditional update requires search parameters or if-none-exist condition",
			);
		}

		const searchString =
			options.ifNoneExist || this.buildSearchString(options.searchParams || {});

		try {
			const result = await this.client.request<T>(
				"PUT",
				`${resource.resourceType}?${searchString}`,
				resource,
				{
					"If-Match": options.ifMatch,
					"If-None-Match": options.ifNoneMatch,
					"If-Modified-Since": options.ifModifiedSince,
					"If-Unmodified-Since": options.ifUnmodifiedSince,
					Prefer: options.prefer ? `return=${options.prefer}` : undefined,
				},
			);

			return {
				resource: result.data,
				performed: true,
				status: result.status,
				location: result.headers["location"],
				etag: result.headers["etag"],
				lastModified: result.headers["last-modified"]
					? new Date(result.headers["last-modified"])
					: undefined,
			};
		} catch (error) {
			if (error instanceof FHIRError && error.status === 412) {
				return {
					performed: false,
					status: 412,
					operationOutcome: error.operationOutcome,
				};
			}
			throw error;
		}
	}

	/**
	 * Update a resource only if it exists and matches conditions
	 */
	async updateIfExists<T extends { resourceType: string; id: string }>(
		resource: T,
		options: ConditionalRequestOptions = {},
	): Promise<ConditionalRequestResult<T>> {
		try {
			// Check if resource exists first
			const existing = await this.client.read<T>(
				resource.resourceType,
				resource.id,
			);

			const headers: Record<string, string> = {};

			// Add conditional headers
			if (options.etag) {
				headers["If-Match"] = options.etag;
			} else if (existing.headers?.etag) {
				headers["If-Match"] = existing.headers.etag;
			}

			if (options.lastModified) {
				headers["If-Unmodified-Since"] = options.lastModified.toUTCString();
			}

			if (options.prefer) {
				headers["Prefer"] = `return=${options.prefer}`;
			}

			const result = await this.client.request<T>(
				"PUT",
				`${resource.resourceType}/${resource.id}`,
				resource,
				headers,
			);

			return {
				resource: result.data,
				performed: true,
				status: result.status,
				etag: result.headers["etag"],
				lastModified: result.headers["last-modified"]
					? new Date(result.headers["last-modified"])
					: undefined,
			};
		} catch (error) {
			if (error instanceof FHIRError) {
				if (error.status === 404) {
					return {
						performed: false,
						status: 404,
					};
				}
				if (error.status === 412) {
					return {
						performed: false,
						status: 412,
						operationOutcome: error.operationOutcome,
					};
				}
			}
			throw error;
		}
	}

	/**
	 * Delete resources conditionally based on search parameters
	 */
	async deleteConditional(
		resourceType: string,
		options: ConditionalRequestOptions,
	): Promise<ConditionalRequestResult> {
		if (!options.searchParams && !options.ifNoneExist) {
			throw new FHIRError("Conditional delete requires search parameters");
		}

		const searchString = this.buildSearchString(options.searchParams || {});

		try {
			const result = await this.client.request(
				"DELETE",
				`${resourceType}?${searchString}`,
				undefined,
				{
					Prefer: options.prefer ? `return=${options.prefer}` : undefined,
				},
			);

			return {
				performed: true,
				status: result.status,
				operationOutcome:
					result.data?.resourceType === "OperationOutcome"
						? result.data
						: undefined,
			};
		} catch (error) {
			if (error instanceof FHIRError && error.status === 404) {
				return {
					performed: false,
					status: 404,
				};
			}
			throw error;
		}
	}

	/**
	 * Delete a resource only if it exists and matches conditions
	 */
	async deleteIfExists(
		resourceType: string,
		id: string,
		options: ConditionalRequestOptions = {},
	): Promise<ConditionalRequestResult> {
		try {
			// Check if resource exists first
			const existing = await this.client.read(resourceType, id);

			const headers: Record<string, string> = {};

			// Add conditional headers
			if (options.etag) {
				headers["If-Match"] = options.etag;
			} else if (existing.headers?.etag) {
				headers["If-Match"] = existing.headers.etag;
			}

			if (options.lastModified) {
				headers["If-Unmodified-Since"] = options.lastModified.toUTCString();
			}

			if (options.prefer) {
				headers["Prefer"] = `return=${options.prefer}`;
			}

			const result = await this.client.request(
				"DELETE",
				`${resourceType}/${id}`,
				undefined,
				headers,
			);

			return {
				performed: true,
				status: result.status,
				operationOutcome:
					result.data?.resourceType === "OperationOutcome"
						? result.data
						: undefined,
			};
		} catch (error) {
			if (error instanceof FHIRError) {
				if (error.status === 404) {
					return {
						performed: false,
						status: 404,
					};
				}
				if (error.status === 412) {
					return {
						performed: false,
						status: 412,
						operationOutcome: error.operationOutcome,
					};
				}
			}
			throw error;
		}
	}

	/**
	 * Patch a resource conditionally
	 */
	async patchConditional(
		resourceType: string,
		patchOperations: any[],
		options: ConditionalRequestOptions,
	): Promise<ConditionalRequestResult> {
		if (!options.searchParams && !options.ifNoneExist) {
			throw new FHIRError("Conditional patch requires search parameters");
		}

		const searchString = this.buildSearchString(options.searchParams || {});

		try {
			const result = await this.client.request(
				"PATCH",
				`${resourceType}?${searchString}`,
				patchOperations,
				{
					"Content-Type": "application/json-patch+json",
					"If-Match": options.ifMatch,
					"If-None-Match": options.ifNoneMatch,
					"If-Modified-Since": options.ifModifiedSince,
					"If-Unmodified-Since": options.ifUnmodifiedSince,
					Prefer: options.prefer ? `return=${options.prefer}` : undefined,
				},
			);

			return {
				resource: result.data,
				performed: true,
				status: result.status,
				etag: result.headers["etag"],
				lastModified: result.headers["last-modified"]
					? new Date(result.headers["last-modified"])
					: undefined,
			};
		} catch (error) {
			if (error instanceof FHIRError && error.status === 412) {
				return {
					performed: false,
					status: 412,
					operationOutcome: error.operationOutcome,
				};
			}
			throw error;
		}
	}

	/**
	 * Upsert operation (create or update)
	 */
	async upsert<T extends { resourceType: string }>(
		resource: T,
		searchParams: Record<string, any>,
		options: ConditionalRequestOptions = {},
	): Promise<ConditionalRequestResult<T>> {
		// First try to find existing resource
		const existing = await this.searchForExisting<T>(
			resource.resourceType,
			searchParams,
		);

		if (existing) {
			// Update existing resource
			const resourceWithId = { ...resource, id: existing.id } as T & {
				id: string;
			};
			return this.updateIfExists(resourceWithId, options);
		} else {
			// Create new resource
			return this.createIfNotExists(resource, {
				...options,
				searchParams,
			});
		}
	}

	/**
	 * Search for existing resource based on parameters
	 */
	private async searchForExisting<T>(
		resourceType: string,
		searchParams: Record<string, any>,
	): Promise<T | null> {
		try {
			const result = await this.client.search<T>(resourceType, {
				...searchParams,
				_count: 1, // Only need to know if at least one exists
			});

			const bundle = result.data as Bundle<T>;
			if (bundle.entry && bundle.entry.length > 0 && bundle.entry[0].resource) {
				return bundle.entry[0].resource;
			}

			return null;
		} catch (error) {
			// If search fails, assume resource doesn't exist
			return null;
		}
	}

	/**
	 * Build search parameter string
	 */
	private buildSearchString(params: Record<string, any>): string {
		const searchParams = new URLSearchParams();

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				if (Array.isArray(value)) {
					value.forEach((v) => searchParams.append(key, String(v)));
				} else {
					searchParams.append(key, String(value));
				}
			}
		}

		return searchParams.toString();
	}
}

/**
 * Conditional operations builder for fluent API
 */
export class ConditionalOperationsBuilder<T extends { resourceType: string }> {
	private searchParams: Record<string, any> = {};
	private headers: Record<string, string> = {};
	private options: ConditionalRequestOptions = {};

	constructor(
		private conditionalOps: ConditionalOperations,
		private resource?: T,
		private resourceType?: string,
		private resourceId?: string,
	) {}

	/**
	 * Add search parameter condition
	 */
	where(param: string, value: any): this {
		this.searchParams[param] = value;
		return this;
	}

	/**
	 * Add multiple search parameters
	 */
	whereAll(params: Record<string, any>): this {
		Object.assign(this.searchParams, params);
		return this;
	}

	/**
	 * Add ETag condition
	 */
	ifMatches(etag: string): this {
		this.options.etag = etag;
		return this;
	}

	/**
	 * Add last-modified condition
	 */
	ifUnmodifiedSince(date: Date): this {
		this.options.lastModified = date;
		return this;
	}

	/**
	 * Set return preference
	 */
	prefer(preference: "minimal" | "representation" | "OperationOutcome"): this {
		this.options.prefer = preference;
		return this;
	}

	/**
	 * Execute create-if-not-exists
	 */
	async createIfNotExists(): Promise<ConditionalRequestResult<T>> {
		if (!this.resource) {
			throw new FHIRError("Resource is required for create operation");
		}

		return this.conditionalOps.createIfNotExists(this.resource, {
			...this.options,
			searchParams: this.searchParams,
		});
	}

	/**
	 * Execute update-conditional
	 */
	async updateConditional(): Promise<ConditionalRequestResult<T>> {
		if (!this.resource) {
			throw new FHIRError("Resource is required for update operation");
		}

		return this.conditionalOps.updateConditional(this.resource, {
			...this.options,
			searchParams: this.searchParams,
		});
	}

	/**
	 * Execute delete-conditional
	 */
	async deleteConditional(): Promise<ConditionalRequestResult> {
		if (!this.resourceType) {
			throw new FHIRError("Resource type is required for delete operation");
		}

		return this.conditionalOps.deleteConditional(this.resourceType, {
			...this.options,
			searchParams: this.searchParams,
		});
	}

	/**
	 * Execute upsert
	 */
	async upsert(): Promise<ConditionalRequestResult<T>> {
		if (!this.resource) {
			throw new FHIRError("Resource is required for upsert operation");
		}

		return this.conditionalOps.upsert(
			this.resource,
			this.searchParams,
			this.options,
		);
	}
}

/**
 * Generate conditional operations code for REST client
 */
export function generateConditionalOperationsCode(): string {
	return `
  /**
   * Create conditional operations instance
   */
  get conditional(): ConditionalOperations {
    return new ConditionalOperations(this);
  }

  /**
   * Start building a conditional operation for a resource
   */
  conditionalFor<T extends { resourceType: string }>(resource: T): ConditionalOperationsBuilder<T> {
    return new ConditionalOperationsBuilder(this.conditional, resource);
  }

  /**
   * Start building a conditional operation for a resource type
   */
  conditionalForType(resourceType: string): ConditionalOperationsBuilder<any> {
    return new ConditionalOperationsBuilder(this.conditional, undefined, resourceType);
  }

  /**
   * Quick create-if-not-exists method
   */
  async createIfNotExists<T extends { resourceType: string }>(
    resource: T,
    searchParams: Record<string, any>
  ): Promise<ConditionalRequestResult<T>> {
    return this.conditional.createIfNotExists(resource, { searchParams });
  }

  /**
   * Quick upsert method
   */
  async upsert<T extends { resourceType: string }>(
    resource: T,
    searchParams: Record<string, any>
  ): Promise<ConditionalRequestResult<T>> {
    return this.conditional.upsert(resource, searchParams);
  }
  `;
}
