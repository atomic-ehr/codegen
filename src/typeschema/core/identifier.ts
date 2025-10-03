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
    RichFHIRSchema,
    ValueSetTypeSchema,
} from "@typeschema/types";
import type { Register } from "../register";

export function dropVersionFromUrl(url: CanonicalUrl): CanonicalUrl {
    const baseUrl = url.split("|")[0];
    return baseUrl ? (baseUrl as CanonicalUrl) : url;
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

export function mkValueSetIdentifier(register: Register, valueSetUrl: CanonicalUrl): ValueSetTypeSchema["identifier"] {
    valueSetUrl = dropVersionFromUrl(valueSetUrl);
    const valueSet = register.resolveVs(valueSetUrl);
    // Generate a meaningful name from the URL instead of using potentially hash-like IDs
    let name = "unknown";

    // First try to get the last segment of the URL path
    const urlParts = valueSetUrl.split("/");
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
        package: valueSet?.package_meta.name,
        version: valueSet?.package_meta.version,
        name: name as Name,
        url: valueSetUrl as CanonicalUrl,
    };
}

export function mkBindingIdentifier(fhirSchema: FHIRSchema, path: string[], bindingName?: string): BindingIdentifier {
    const pathStr = path.join(".");
    // NOTE: if SD specify `bindingName`, the definition should be shared between all
    // packages. So we put it in the dedicated shared package.
    // TODO: provide setting for `shared` package name.
    const [pkg, name, url] = bindingName
        ? [{ name: "shared", version: "1.0.0" }, bindingName, `urn:fhir:binding:${bindingName}`]
        : [fhirSchema.package_meta, `${fhirSchema.name}.${pathStr}_binding`, `${fhirSchema.url}#${pathStr}_binding`];
    return {
        kind: "binding",
        package: pkg.name,
        version: pkg.version,
        name: name as Name,
        url: url as CanonicalUrl,
    };
}
