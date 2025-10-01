/**
 * Identifier Building Utilities
 *
 * Functions for creating TypeSchema identifiers from FHIRSchema entities
 */

import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type {
    BindingIdentifier,
    CanonicalUrl,
    Identifier,
    Name,
    NestedIdentifier,
    PackageMeta,
    RichFHIRSchema,
    TypeSchemaForValueSet,
} from "@typeschema/types";

export function dropVersionFromUrl(url: CanonicalUrl | undefined): CanonicalUrl | undefined {
    if (!url) return undefined;
    return url.split("|")[0] as CanonicalUrl;
}

function determineKind(fhirSchema: RichFHIRSchema): Identifier["kind"] {
    if (fhirSchema.derivation === "constraint") return "profile";
    if (fhirSchema.kind === "primitive-type") return "primitive-type";
    if (fhirSchema.kind === "complex-type") return "complex-type";
    if (fhirSchema.kind === "resource") return "resource";
    return "resource";
}

export function mkIdentifier(fhirSchema: RichFHIRSchema): Identifier {
    return {
        kind: determineKind(fhirSchema),
        package: fhirSchema.package_meta.name,
        version: fhirSchema.package_meta.version,
        name: fhirSchema.name,
        url: fhirSchema.url,
    };
}

export function mkNestedIdentifier(fhirSchema: RichFHIRSchema, path: string[]): NestedIdentifier {
    const nestedName = path.join(".");
    return {
        kind: "nested",
        package: fhirSchema.package_meta.name,
        version: fhirSchema.package_meta.version,
        name: nestedName as Name,
        url: `${fhirSchema.url}#${nestedName}` as CanonicalUrl,
    };
}

export function mkValueSetIdentifier(
    valueSetUrl: CanonicalUrl,
    valueSet: any,
    packageInfo?: PackageMeta,
): TypeSchemaForValueSet["identifier"] {
    const cleanUrl = dropVersionFromUrl(valueSetUrl) || valueSetUrl;

    // Generate a meaningful name from the URL instead of using potentially hash-like IDs
    let name = "unknown";

    // First try to get the last segment of the URL path
    const urlParts = cleanUrl.split("/");
    const lastSegment = urlParts[urlParts.length - 1];

    if (lastSegment && lastSegment.length > 0) {
        // Convert kebab-case or snake_case to PascalCase for better readability
        name = lastSegment
            .split(/[-_]/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join("");
    }

    // Only fall back to valueSet.id if we couldn't extract a meaningful name from URL
    // and the ID doesn't look like a hash (no long alphanumeric strings)
    if (name === "unknown" && valueSet?.id && !/^[a-zA-Z0-9_-]{20,}$/.test(valueSet.id)) {
        name = valueSet.id;
    }

    return {
        kind: "value-set",
        package: packageInfo?.name || valueSet?.package_name || "undefined",
        version: packageInfo?.version || valueSet?.package_version || "undefined",
        name: name as Name,
        url: cleanUrl as CanonicalUrl,
    };
}

export function mkBindingIdentifier(
    fhirSchema: FHIRSchema,
    path: string[],
    bindingName?: string,
    _packageInfo?: PackageMeta,
): BindingIdentifier {
    const pathStr = path.join(".");
    const [name, url] = bindingName
        ? [bindingName, `urn:fhir:binding:${bindingName}`]
        : [`${fhirSchema.name}.${pathStr}_binding`, `${fhirSchema.url}#${pathStr}_binding`];
    return {
        kind: "binding",
        package: fhirSchema.package_meta.name,
        version: fhirSchema.package_meta.version,
        name: name as Name,
        url: url as CanonicalUrl,
    };
}
