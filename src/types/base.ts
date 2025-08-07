/**
 * Base FHIR Types
 *
 * Basic type definitions used throughout the FHIR client and search builder.
 */

/**
 * Union type of all FHIR resource types
 */
export type ResourceType =
	| "Patient"
	| "Observation"
	| "Organization"
	| "Practitioner"
	| "Encounter"
	| "Procedure"
	| "Condition"
	| "DiagnosticReport"
	| "MedicationRequest"
	| "Location"
	| "Device"
	| "Specimen";
// More resource types will be generated dynamically

/**
 * Generic FHIR resource base interface
 */
export interface AnyResource {
	resourceType: ResourceType;
	id?: string;
	meta?: {
		versionId?: string;
		lastUpdated?: string;
		source?: string;
		profile?: string[];
		security?: any[];
		tag?: any[];
	};
}

/**
 * FHIR Bundle resource
 */
export interface Bundle<T extends AnyResource = AnyResource> {
	resourceType: "Bundle";
	id?: string;
	meta?: AnyResource["meta"];
	type:
		| "searchset"
		| "collection"
		| "transaction"
		| "batch"
		| "history"
		| "document"
		| "message";
	total?: number;
	entry?: BundleEntry<T>[];
	link?: BundleLink[];
}

/**
 * Bundle entry
 */
export interface BundleEntry<T extends AnyResource = AnyResource> {
	resource?: T;
	fullUrl?: string;
	search?: {
		mode?: "match" | "include";
		score?: number;
	};
	request?: {
		method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
		url: string;
	};
	response?: {
		status: string;
		location?: string;
		etag?: string;
		lastModified?: string;
		outcome?: AnyResource;
	};
}

/**
 * Bundle link
 */
export interface BundleLink {
	relation: "self" | "first" | "previous" | "next" | "last";
	url: string;
}
