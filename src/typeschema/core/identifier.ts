/**
 * Identifier Building Utilities
 * 
 * Functions for creating TypeSchema identifiers from FHIRSchema entities
 */

import type { FHIRSchema } from '@atomic-ehr/fhirschema';
import { TypeSchemaIdentifier, PackageInfo } from '../types';

/**
 * Drop version suffix from canonical URL (e.g., "http://example.com|1.0.0" -> "http://example.com")
 */
export function dropVersionFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  return url.split('|')[0];
}

/**
 * Determine the kind of schema based on FHIRSchema properties
 */
function determineKind(fhirSchema: FHIRSchema): TypeSchemaIdentifier['kind'] {
  // Check for constraint/profile
  if (fhirSchema.derivation === 'constraint') {
    return 'constraint';
  }
  
  // Use explicit kind if available
  if (fhirSchema.kind) {
    switch (fhirSchema.kind) {
      case 'primitive-type':
        return 'primitive-type';
      case 'complex-type':
        return 'complex-type';
      case 'resource':
        return 'resource';
    }
  }
  
  // Default to resource
  return 'resource';
}

/**
 * Build identifier for primitive-type, complex-type, resource, or constraint
 */
export function buildSchemaIdentifier(
  fhirSchema: FHIRSchema,
  packageInfo?: PackageInfo
): TypeSchemaIdentifier {
  const kind = determineKind(fhirSchema);
  
  return {
    kind,
    package: packageInfo?.name || fhirSchema.package_name || 'undefined',
    version: packageInfo?.version || fhirSchema.package_version || 'undefined',
    name: fhirSchema.name,
    url: fhirSchema.url
  };
}

/**
 * Build nested type identifier for BackboneElements
 */
export function buildNestedIdentifier(
  fhirSchema: FHIRSchema,
  path: string[],
  packageInfo?: PackageInfo
): TypeSchemaIdentifier {
  const nestedName = path.join('.');
  
  return {
    kind: 'nested',
    package: packageInfo?.name || fhirSchema.package_name || 'undefined',
    version: packageInfo?.version || fhirSchema.package_version || 'undefined',
    name: nestedName,
    url: `${fhirSchema.url}#${nestedName}`
  };
}

/**
 * Build value set identifier
 */
export function buildValueSetIdentifier(
  valueSetUrl: string,
  valueSet?: any,
  packageInfo?: PackageInfo
): TypeSchemaIdentifier {
  const cleanUrl = dropVersionFromUrl(valueSetUrl) || valueSetUrl;
  
  return {
    kind: 'value-set',
    package: packageInfo?.name || valueSet?.package_name || 'undefined',
    version: packageInfo?.version || valueSet?.package_version || 'undefined',
    name: valueSet?.id || cleanUrl.split('/').pop() || 'unknown',
    url: cleanUrl
  };
}

/**
 * Build binding identifier for an element with value set binding
 */
export function buildBindingIdentifier(
  fhirSchema: FHIRSchema,
  path: string[],
  bindingName?: string,
  packageInfo?: PackageInfo
): TypeSchemaIdentifier {
  const pathStr = path.join('.');
  const name = bindingName || `${fhirSchema.name}.${pathStr}_binding`;
  
  return {
    kind: 'binding',
    package: packageInfo?.name || fhirSchema.package_name || 'undefined',
    version: packageInfo?.version || fhirSchema.package_version || 'undefined',
    name,
    url: bindingName 
      ? `urn:fhir:binding:${name}`
      : `${fhirSchema.url}#${pathStr}_binding`
  };
}