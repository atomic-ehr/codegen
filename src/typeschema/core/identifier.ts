/**
 * Identifier Building Utilities
 *
 * Functions for creating TypeSchema identifiers from FHIRSchema entities
 */

import type {
    BindingIdentifier,
    CanonicalUrl,
    Identifier,
    Name,
    PackageMeta,
    RichFHIRSchema,
    RichValueSet,
    ValueSetIdentifier,
} from "@typeschema/types";
import type { Register } from "../register";

export function dropVersionFromUrl(url: CanonicalUrl): CanonicalUrl {
    const baseUrl = url.split("|")[0];
    return baseUrl ? (baseUrl as CanonicalUrl) : url;
}

function getVersionFromUrl(url: CanonicalUrl): string | undefined {
    const version = url.split("|")[1];
    return version;
}

function determineKind(fhirSchema: RichFHIRSchema): Identifier["kind"] {
    if (fhirSchema.derivation === "constraint") return "profile";
    if (fhirSchema.kind === "primitive-type") return "primitive-type";
    if (fhirSchema.kind === "complex-type") return "complex-type";
    if (fhirSchema.kind === "resource") return "resource";
    if (fhirSchema.kind === "logical") return "logical";
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

const getValueSetName = (url: CanonicalUrl): Name => {
    const urlParts = url.split("/");
    const lastSegment = urlParts[urlParts.length - 1];

    if (lastSegment && lastSegment.length > 0) {
        return lastSegment
            .split(/[-_]/)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join("") as Name;
    }
    return url as string as Name;
};

export function mkValueSetIdentifierByUrl(
    register: Register,
    pkg: PackageMeta,
    fullValueSetUrl: CanonicalUrl,
): ValueSetIdentifier {
    const valueSetUrl = dropVersionFromUrl(fullValueSetUrl);
    const valueSetNameFallback = getValueSetName(valueSetUrl);
    const valuesSetFallback: RichValueSet = {
        resourceType: "ValueSet",
        package_meta: {
            name: "missing_valuesets",
            version: getVersionFromUrl(valueSetUrl) || "0.0.0",
        },
        name: valueSetNameFallback,
        id: fullValueSetUrl,
        url: valueSetUrl,
    };
    const valueSet: RichValueSet = register.resolveVs(pkg, valueSetUrl) || valuesSetFallback;
    // NOTE: ignore valueSet.name due to human name
    const valueSetName: Name =
        valueSet?.id && !/^[a-zA-Z0-9_-]{20,}$/.test(valueSet.id) ? (valueSet.id as Name) : valueSetNameFallback;

    return {
        kind: "value-set",
        package: valueSet.package_meta.name,
        version: valueSet.package_meta.version,
        name: valueSetName,
        url: valueSetUrl,
    };
}

export function mkBindingIdentifier(
    fhirSchema: RichFHIRSchema,
    path: string[],
    bindingName?: string,
): BindingIdentifier {
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
