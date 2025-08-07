/**
 * FHIR Batch and Transaction Builders
 *
 * Provides type-safe builders for creating FHIR batch and transaction bundles
 * with validation, reference resolution, and comprehensive error handling.
 */

import { FHIRError } from "./error-handling";

/**
 * FHIR Bundle entry interface
 */
export interface BundleEntry<T = any> {
	fullUrl?: string;
	resource?: T;
	request?: {
		method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
		url: string;
		ifNoneMatch?: string;
		ifModifiedSince?: string;
		ifMatch?: string;
		ifNoneExist?: string;
	};
	response?: {
		status: string;
		location?: string;
		etag?: string;
		lastModified?: string;
		outcome?: any;
	};
	search?: {
		mode?: "match" | "include" | "outcome";
		score?: number;
	};
}

/**
 * FHIR Bundle interface
 */
export interface Bundle<T = any> {
	resourceType: "Bundle";
	id?: string;
	meta?: any;
	identifier?: any;
	type:
		| "document"
		| "message"
		| "transaction"
		| "transaction-response"
		| "batch"
		| "batch-response"
		| "history"
		| "searchset"
		| "collection"
		| "subscription-notification";
	timestamp?: string;
	total?: number;
	link?: Array<{
		relation: string;
		url: string;
	}>;
	entry?: BundleEntry<T>[];
	signature?: any;
}

/**
 * Reference validation result
 */
interface ReferenceValidationResult {
	valid: boolean;
	errors: string[];
	unresolvedReferences: string[];
}

/**
 * Base bundle builder with common functionality
 */
export abstract class BaseBundleBuilder<T extends BaseBundleBuilder<T>> {
	protected entries: BundleEntry[] = [];
	protected tempIdCounter = 0;
	protected tempIdMap = new Map<string, string>();

	/**
	 * Generate a temporary UUID for new resources
	 */
	protected generateTempId(): string {
		const tempId = `urn:uuid:temp-${this.tempIdCounter++}`;
		return tempId;
	}

	/**
	 * Add a read request
	 */
	read<_R>(resourceType: string, id: string): T {
		this.entries.push({
			request: {
				method: "GET",
				url: `${resourceType}/${id}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Add a search request
	 */
	search<_R>(resourceType: string, params: Record<string, any>): T {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined && value !== null) {
				if (Array.isArray(value)) {
					value.forEach((v) => query.append(key, String(v)));
				} else {
					query.append(key, String(value));
				}
			}
		}

		this.entries.push({
			request: {
				method: "GET",
				url: `${resourceType}?${query.toString()}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Add a create request
	 */
	create<R>(resource: R & { resourceType: string }): T {
		const tempId = this.generateTempId();

		this.entries.push({
			fullUrl: tempId,
			resource,
			request: {
				method: "POST",
				url: resource.resourceType,
			},
		});

		// Store mapping for reference resolution
		this.tempIdMap.set(tempId, resource.resourceType);

		return this as unknown as T;
	}

	/**
	 * Add a create request with conditional creation
	 */
	createConditional<R>(
		resource: R & { resourceType: string },
		ifNoneExist: string,
	): T {
		const tempId = this.generateTempId();

		this.entries.push({
			fullUrl: tempId,
			resource,
			request: {
				method: "POST",
				url: resource.resourceType,
				ifNoneExist,
			},
		});

		this.tempIdMap.set(tempId, resource.resourceType);
		return this as unknown as T;
	}

	/**
	 * Add an update request
	 */
	update<R>(resource: R & { resourceType: string; id: string }): T {
		this.entries.push({
			resource,
			request: {
				method: "PUT",
				url: `${resource.resourceType}/${resource.id}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Add a conditional update request
	 */
	updateConditional<R>(
		resource: R & { resourceType: string },
		searchParams: Record<string, any>,
	): T {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(searchParams)) {
			if (value !== undefined && value !== null) {
				query.append(key, String(value));
			}
		}

		this.entries.push({
			resource,
			request: {
				method: "PUT",
				url: `${resource.resourceType}?${query.toString()}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Add a patch request
	 */
	patch<_R>(resourceType: string, id: string, patchOperations: any[]): T {
		this.entries.push({
			resource: patchOperations,
			request: {
				method: "PATCH",
				url: `${resourceType}/${id}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Add a delete request
	 */
	delete(resourceType: string, id: string): T {
		this.entries.push({
			request: {
				method: "DELETE",
				url: `${resourceType}/${id}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Add a conditional delete request
	 */
	deleteConditional(
		resourceType: string,
		searchParams: Record<string, any>,
	): T {
		const query = new URLSearchParams();
		for (const [key, value] of Object.entries(searchParams)) {
			if (value !== undefined && value !== null) {
				query.append(key, String(value));
			}
		}

		this.entries.push({
			request: {
				method: "DELETE",
				url: `${resourceType}?${query.toString()}`,
			},
		});
		return this as unknown as T;
	}

	/**
	 * Get the number of entries in the bundle
	 */
	get entryCount(): number {
		return this.entries.length;
	}

	/**
	 * Clear all entries
	 */
	clear(): T {
		this.entries = [];
		this.tempIdCounter = 0;
		this.tempIdMap.clear();
		return this as unknown as T;
	}

	/**
	 * Validate bundle structure
	 */
	protected validate(): void {
		if (this.entries.length === 0) {
			throw new FHIRError("Bundle cannot be empty");
		}

		// Validate each entry
		for (let i = 0; i < this.entries.length; i++) {
			const entry = this.entries[i];
			this.validateEntry(entry, i);
		}
	}

	/**
	 * Validate individual bundle entry
	 */
	protected validateEntry(entry: BundleEntry, index: number): void {
		if (!entry.request) {
			throw new FHIRError(
				`Entry at index ${index} is missing request information`,
			);
		}

		const { method, url } = entry.request;

		if (!method) {
			throw new FHIRError(`Entry at index ${index} is missing HTTP method`);
		}

		if (!url) {
			throw new FHIRError(`Entry at index ${index} is missing request URL`);
		}

		// Validate resource for POST/PUT/PATCH operations
		if (["POST", "PUT", "PATCH"].includes(method) && !entry.resource) {
			throw new FHIRError(
				`Entry at index ${index} with ${method} method is missing resource data`,
			);
		}

		// Validate URL format
		if (!this.isValidUrl(url)) {
			throw new FHIRError(
				`Entry at index ${index} has invalid URL format: ${url}`,
			);
		}
	}

	/**
	 * Check if URL format is valid
	 */
	protected isValidUrl(url: string): boolean {
		// Basic validation for FHIR REST URLs
		const patterns = [
			/^[A-Z][a-zA-Z]+$/, // ResourceType
			/^[A-Z][a-zA-Z]+\/[a-zA-Z0-9\-.]+$/, // ResourceType/id
			/^[A-Z][a-zA-Z]+\?.*$/, // ResourceType?params
			/^[A-Z][a-zA-Z]+\/[a-zA-Z0-9\-.]+\/\$[a-z]+$/, // ResourceType/id/$operation
			/^[A-Z][a-zA-Z]+\/\$[a-z]+$/, // ResourceType/$operation
			/^\$[a-z]+$/, // $operation (system level)
		];

		return patterns.some((pattern) => pattern.test(url));
	}

	/**
	 * Extract and validate references within the bundle
	 */
	protected validateReferences(): ReferenceValidationResult {
		const result: ReferenceValidationResult = {
			valid: true,
			errors: [],
			unresolvedReferences: [],
		};

		// Collect all temporary IDs and resource references
		const availableRefs = new Set<string>();
		const referencesToResolve: Array<{
			ref: string;
			entryIndex: number;
			path: string;
		}> = [];

		// First pass: collect all available references
		for (let i = 0; i < this.entries.length; i++) {
			const entry = this.entries[i];
			if (entry.fullUrl) {
				availableRefs.add(entry.fullUrl);
			}
			if (entry.resource && "id" in entry.resource) {
				const resourceType = (entry.resource as any).resourceType;
				const id = (entry.resource as any).id;
				availableRefs.add(`${resourceType}/${id}`);
			}
		}

		// Second pass: find all references to resolve
		for (let i = 0; i < this.entries.length; i++) {
			const entry = this.entries[i];
			if (entry.resource) {
				const refs = this.extractReferences(entry.resource);
				for (const ref of refs) {
					referencesToResolve.push({
						ref: ref.reference,
						entryIndex: i,
						path: ref.path,
					});
				}
			}
		}

		// Third pass: validate references
		for (const refToResolve of referencesToResolve) {
			if (refToResolve.ref.startsWith("urn:uuid:")) {
				// Temporary reference - must exist in bundle
				if (!availableRefs.has(refToResolve.ref)) {
					result.valid = false;
					result.errors.push(
						`Unresolved temporary reference "${refToResolve.ref}" at entry ${refToResolve.entryIndex}, path: ${refToResolve.path}`,
					);
					result.unresolvedReferences.push(refToResolve.ref);
				}
			}
		}

		return result;
	}

	/**
	 * Extract references from a resource
	 */
	protected extractReferences(
		resource: any,
		path = "",
	): Array<{ reference: string; path: string }> {
		const references: Array<{ reference: string; path: string }> = [];

		if (!resource || typeof resource !== "object") {
			return references;
		}

		for (const [key, value] of Object.entries(resource)) {
			const currentPath = path ? `${path}.${key}` : key;

			if (key === "reference" && typeof value === "string") {
				references.push({ reference: value, path: currentPath });
			} else if (Array.isArray(value)) {
				for (let i = 0; i < value.length; i++) {
					references.push(
						...this.extractReferences(value[i], `${currentPath}[${i}]`),
					);
				}
			} else if (typeof value === "object") {
				references.push(...this.extractReferences(value, currentPath));
			}
		}

		return references;
	}

	/**
	 * Build the base bundle structure
	 */
	protected buildBaseBundle(type: Bundle["type"]): Bundle {
		return {
			resourceType: "Bundle",
			type,
			entry: [...this.entries], // Create a copy
		};
	}
}

/**
 * Batch bundle builder for independent operations
 */
export class BatchBuilder extends BaseBundleBuilder<BatchBuilder> {
	/**
	 * Build and validate the batch bundle
	 */
	build(): Bundle {
		this.validate();
		return this.buildBaseBundle("batch");
	}

	/**
	 * Execute the batch with the provided client
	 */
	async execute(client: any): Promise<Bundle> {
		const bundle = this.build();
		return client.batch(bundle);
	}
}

/**
 * Transaction bundle builder with enhanced validation
 */
export class TransactionBuilder extends BaseBundleBuilder<TransactionBuilder> {
	/**
	 * Build and validate the transaction bundle
	 */
	build(): Bundle {
		this.validate();
		this.validateTransaction();
		return this.buildBaseBundle("transaction");
	}

	/**
	 * Additional validation for transactions
	 */
	protected validateTransaction(): void {
		// Validate references within the transaction
		const refValidation = this.validateReferences();
		if (!refValidation.valid) {
			throw new FHIRError(
				`Transaction validation failed: ${refValidation.errors.join("; ")}`,
				{
					operationOutcome: {
						resourceType: "OperationOutcome",
						issue: refValidation.errors.map((error) => ({
							severity: "error" as const,
							code: "invalid",
							diagnostics: error,
						})),
					},
				},
			);
		}

		// Check for conflicting operations on the same resource
		this.validateNoConflicts();
	}

	/**
	 * Validate that there are no conflicting operations on the same resource
	 */
	protected validateNoConflicts(): void {
		const resourceOperations = new Map<string, string[]>();

		for (let i = 0; i < this.entries.length; i++) {
			const entry = this.entries[i];
			const method = entry.request?.method;
			const url = entry.request?.url;

			if (!method || !url) continue;

			// Extract resource identifier from URL
			const resourceId = this.extractResourceIdentifier(url, entry);
			if (resourceId) {
				if (!resourceOperations.has(resourceId)) {
					resourceOperations.set(resourceId, []);
				}
				resourceOperations.get(resourceId)?.push(`${method}@${i}`);
			}
		}

		// Check for conflicts
		for (const [resourceId, operations] of resourceOperations.entries()) {
			if (operations.length > 1) {
				// Check for conflicting operation types
				const methods = operations.map((op) => op.split("@")[0]);
				const _hasModifyingOps = methods.some((m) =>
					["PUT", "PATCH", "DELETE"].includes(m),
				);
				const hasMultipleModifyingOps =
					methods.filter((m) => ["POST", "PUT", "PATCH", "DELETE"].includes(m))
						.length > 1;

				if (hasMultipleModifyingOps) {
					throw new FHIRError(
						`Conflicting operations detected for resource ${resourceId}: ${operations.join(", ")}`,
					);
				}
			}
		}
	}

	/**
	 * Extract resource identifier from URL and entry
	 */
	protected extractResourceIdentifier(
		url: string,
		entry: BundleEntry,
	): string | null {
		// For conditional operations, use the search parameters as identifier
		if (url.includes("?")) {
			return url;
		}

		// For temporary resources, use the fullUrl
		if (entry.fullUrl?.startsWith("urn:uuid:")) {
			return entry.fullUrl;
		}

		// For regular resource URLs, use the URL itself
		return url;
	}

	/**
	 * Execute the transaction with the provided client
	 */
	async execute(client: any): Promise<Bundle> {
		const bundle = this.build();
		return client.transaction(bundle);
	}

	/**
	 * Execute with rollback support
	 */
	async executeWithRollback(client: any): Promise<Bundle> {
		try {
			return await this.execute(client);
		} catch (error) {
			// Transaction failed - FHIR server should have automatically rolled back
			// Log the failure for debugging
			console.error("Transaction failed and was rolled back:", error);
			throw error;
		}
	}
}

/**
 * Bundle builder factory
 */
export class BundleBuilderFactory {
	/**
	 * Create a new batch builder
	 */
	static createBatch(): BatchBuilder {
		return new BatchBuilder();
	}

	/**
	 * Create a new transaction builder
	 */
	static createTransaction(): TransactionBuilder {
		return new TransactionBuilder();
	}

	/**
	 * Create builder from existing bundle
	 */
	static fromBundle(bundle: Bundle): BatchBuilder | TransactionBuilder {
		const builder =
			bundle.type === "transaction"
				? new TransactionBuilder()
				: new BatchBuilder();

		if (bundle.entry) {
			(builder as any).entries = [...bundle.entry];
		}

		return builder;
	}
}

/**
 * Generate batch and transaction builder code for REST client
 */
export function generateBatchTransactionCode(): string {
	return `
  /**
   * Create a new batch builder
   */
  batch(): BatchBuilder {
    return new BatchBuilder();
  }

  /**
   * Create a new transaction builder
   */
  transaction(): TransactionBuilder {
    return new TransactionBuilder();
  }

  /**
   * Execute a batch bundle
   */
  async executeBatch(bundle: Bundle): Promise<Bundle> {
    return this.request<Bundle>('POST', '', bundle);
  }

  /**
   * Execute a transaction bundle
   */
  async executeTransaction(bundle: Bundle): Promise<Bundle> {
    return this.request<Bundle>('POST', '', bundle);
  }

  /**
   * Execute bundle (auto-detect type)
   */
  async executeBundle(bundle: Bundle): Promise<Bundle> {
    if (bundle.type === 'transaction') {
      return this.executeTransaction(bundle);
    } else if (bundle.type === 'batch') {
      return this.executeBatch(bundle);
    } else {
      throw new FHIRError(\`Unsupported bundle type: \${bundle.type}\`);
    }
  }
  `;
}
