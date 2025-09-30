/**
 * Common types used in generated code
 */

/**
 * Result of validation operation
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Base type for FHIR resources
 */
export interface Resource {
    resourceType: string;
    id?: string;
    meta?: Meta;
}

/**
 * FHIR Meta element
 */
export interface Meta {
    versionId?: string;
    lastUpdated?: string;
    source?: string;
    profile?: string[];
    security?: Coding[];
    tag?: Coding[];
}

/**
 * FHIR Coding element
 */
export interface Coding {
    system?: string;
    version?: string;
    code?: string;
    display?: string;
    userSelected?: boolean;
}

/**
 * Generic resource type mapping interface
 * Maps FHIR resource type strings to their corresponding TypeScript interfaces
 */
export interface ResourceTypeMap {
    [resourceType: string]: any;
}

/**
 * Type-safe resource type mapping generator
 * Creates a mapping from resource type strings to interfaces for a given set of resource types
 */
export type CreateResourceTypeMap<T extends readonly string[]> = {
    [K in T[number]]: any;
};
