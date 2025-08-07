/**
 * FHIR Client Types
 *
 * Type definitions for the FHIR client and responses.
 * Used by the search builder and generated client code.
 */

/**
 * Standard FHIR response wrapper
 */
export interface FHIRResponse<T> {
	data: T;
	status: number;
	statusText: string;
	headers: Record<string, string>;
}

/**
 * FHIR client interface
 */
export interface FHIRClient {
	/**
	 * Base URL of the FHIR server
	 */
	readonly baseUrl: string;

	/**
	 * Make a generic HTTP request to the FHIR server
	 */
	request<T = any>(
		method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
		path: string,
		body?: any,
		options?: {
			params?: Record<string, any>;
			headers?: Record<string, string>;
		},
	): Promise<FHIRResponse<T>>;

	/**
	 * Create a new FHIR resource
	 */
	create<T>(resourceType: string, resource: T): Promise<FHIRResponse<T>>;

	/**
	 * Read a FHIR resource by ID
	 */
	read<T>(resourceType: string, id: string): Promise<FHIRResponse<T>>;

	/**
	 * Update a FHIR resource
	 */
	update<T>(
		resourceType: string,
		id: string,
		resource: T,
	): Promise<FHIRResponse<T>>;

	/**
	 * Delete a FHIR resource
	 */
	delete(resourceType: string, id: string): Promise<FHIRResponse<void>>;

	/**
	 * Search for FHIR resources
	 */
	search<T>(
		resourceType: string,
		params?: Record<string, any>,
	): Promise<FHIRResponse<import("../types").Bundle<T>>>;

	/**
	 * Patch a FHIR resource
	 */
	patch<T>(
		resourceType: string,
		id: string,
		patch: any[],
	): Promise<FHIRResponse<T>>;

	/**
	 * Get server capability statement
	 */
	capabilities(): Promise<FHIRResponse<import("../types").CapabilityStatement>>;

	/**
	 * Batch/transaction operations
	 */
	batch<T>(
		bundle: import("../types").Bundle<any>,
	): Promise<FHIRResponse<import("../types").Bundle<T>>>;
}
