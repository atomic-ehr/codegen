/**
 * FHIR Search Builder
 *
 * Implements a fluent, type-safe search parameter builder for FHIR resources.
 * Supports chaining, modifiers, and full autocomplete.
 */

import type { AnyResource, Bundle } from "../types/base";
import type { FHIRClient, FHIRResponse } from "./client-types";

// Import generated types - these will be available at runtime
import type {
	ChainableParams,
	ChainTargetResource,
	ResourceMap,
	ResourceType,
	SearchParamsMap,
} from "./search-types";

/**
 * Main FHIR search builder class
 */
export class FHIRSearchBuilder<T extends keyof ResourceMap>
	implements PromiseLike<FHIRResponse<Bundle<ResourceMap[T]>>>
{
	private params: Record<string, any> = {};
	private resourceType: T;
	private client: FHIRClient;

	constructor(client: FHIRClient, resourceType: T) {
		this.client = client;
		this.resourceType = resourceType;
	}

	/**
	 * Add a search parameter with type safety
	 */
	where<K extends keyof SearchParamsMap[T]>(
		param: K,
		value: SearchParamsMap[T][K],
	): FHIRSearchBuilder<T> {
		const newBuilder = new FHIRSearchBuilder(this.client, this.resourceType);
		newBuilder.params = { ...this.params, [param as string]: value };
		return newBuilder;
	}

	/**
	 * Start a chained search on a reference parameter
	 * Uses template literal types for compile-time chain validation
	 */
	chain<
		ChainParam extends ChainableParams[T],
		ChainResource extends ChainTargetResource<T, ChainParam>,
	>(chainParam: ChainParam): ChainedSearchBuilder<T, ChainResource> {
		return new ChainedSearchBuilder(
			this.client,
			this.resourceType,
			chainParam as string,
		);
	}

	/**
	 * Set the number of resources to return
	 */
	count(n: number): FHIRSearchBuilder<T> {
		return this.where("_count" as any, n);
	}

	/**
	 * Set pagination offset
	 */
	offset(n: number): FHIRSearchBuilder<T> {
		return this.where("_offset" as any, n);
	}

	/**
	 * Sort results by a parameter
	 */
	sort(
		param: keyof SearchParamsMap[T],
		direction: "asc" | "desc" = "asc",
	): FHIRSearchBuilder<T> {
		const sortValue =
			direction === "desc" ? `-${String(param)}` : String(param);
		return this.where("_sort" as any, sortValue);
	}

	/**
	 * Include related resources
	 */
	include(include: string): FHIRSearchBuilder<T> {
		const currentIncludes = this.params._include || [];
		const newIncludes = Array.isArray(currentIncludes)
			? [...currentIncludes, include]
			: [currentIncludes, include];
		return this.where("_include" as any, newIncludes);
	}

	/**
	 * Reverse include related resources
	 */
	revInclude(revInclude: string): FHIRSearchBuilder<T> {
		const currentRevIncludes = this.params._revinclude || [];
		const newRevIncludes = Array.isArray(currentRevIncludes)
			? [...currentRevIncludes, revInclude]
			: [currentRevIncludes, revInclude];
		return this.where("_revinclude" as any, newRevIncludes);
	}

	/**
	 * Execute the search and return results
	 */
	async execute(): Promise<FHIRResponse<Bundle<ResourceMap[T]>>> {
		return this.client.search(this.resourceType as string, this.params);
	}

	/**
	 * Support for await syntax
	 */
	then<TResult1 = FHIRResponse<Bundle<ResourceMap[T]>>, TResult2 = never>(
		onfulfilled?:
			| ((
					value: FHIRResponse<Bundle<ResourceMap[T]>>,
			  ) => TResult1 | PromiseLike<TResult1>)
			| null
			| undefined,
		onrejected?:
			| ((reason: any) => TResult2 | PromiseLike<TResult2>)
			| null
			| undefined,
	): PromiseLike<TResult1 | TResult2> {
		return this.execute().then(onfulfilled, onrejected);
	}

	/**
	 * Internal method to set parameters (for chaining)
	 */
	withParams(params: Record<string, any>): FHIRSearchBuilder<T> {
		const newBuilder = new FHIRSearchBuilder(this.client, this.resourceType);
		newBuilder.params = params;
		return newBuilder;
	}
}

/**
 * Chained search builder for reference parameters
 */
export class ChainedSearchBuilder<
	T extends keyof ResourceMap,
	ChainResource extends keyof ResourceMap,
> extends FHIRSearchBuilder<T> {
	private chainParam: string;

	constructor(client: FHIRClient, resourceType: T, chainParam: string) {
		super(client, resourceType);
		this.chainParam = chainParam;
	}

	/**
	 * Search on the chained resource parameters
	 */
	where<K extends keyof SearchParamsMap[ChainResource]>(
		param: K,
		value: SearchParamsMap[ChainResource][K],
	): ChainedSearchBuilder<T, ChainResource> {
		const chainedParam = `${this.chainParam}.${String(param)}`;
		const newBuilder = new ChainedSearchBuilder(
			this.client,
			this.resourceType as T,
			this.chainParam,
		);
		newBuilder.params = { ...this.params, [chainedParam]: value };
		return newBuilder as ChainedSearchBuilder<T, ChainResource>;
	}
}

/**
 * Operation builder for FHIR operations
 */
export class OperationBuilder<T extends keyof ResourceMap> {
	private client: FHIRClient;
	private resourceType: T;
	private id?: string;

	constructor(client: FHIRClient, resourceType: T, id?: string) {
		this.client = client;
		this.resourceType = resourceType;
		this.id = id;
	}

	/**
	 * Execute a FHIR operation
	 */
	async operation<Op extends string>(
		operation: Op,
		params?: Record<string, any>,
		body?: any,
	): Promise<FHIRResponse<any>> {
		const path = this.id
			? `${String(this.resourceType)}/${this.id}/${operation}`
			: `${String(this.resourceType)}/${operation}`;

		return this.client.request("POST", path, body, { params });
	}

	/**
	 * Patient $everything operation (example of typed operation)
	 */
	async $everything(params?: {
		start?: string;
		end?: string;
		_count?: number;
		_since?: string;
	}): Promise<FHIRResponse<Bundle<AnyResource>>> {
		if (this.resourceType !== "Patient") {
			throw new Error(
				"$everything operation is only available for Patient resources",
			);
		}
		return this.operation("$everything", params);
	}

	/**
	 * Validate operation
	 */
	async $validate(
		resource?: ResourceMap[T],
		params?: { profile?: string },
	): Promise<FHIRResponse<import("../types").OperationOutcome>> {
		return this.operation("$validate", params, resource);
	}
}

/**
 * Client types for search builder integration
 */
export interface FHIRClientSearchMethods {
	/**
	 * Start a type-safe search builder
	 */
	search<T extends keyof ResourceMap>(resourceType: T): FHIRSearchBuilder<T>;

	/**
	 * Start an operation builder
	 */
	operation<T extends keyof ResourceMap>(
		resourceType: T,
		id?: string,
	): OperationBuilder<T>;

	/**
	 * Legacy search method for backward compatibility
	 */
	searchLegacy<T extends AnyResource>(
		resourceType: string,
		params?: Record<string, string | number | boolean>,
	): Promise<FHIRResponse<Bundle<T>>>;
}
