import { isResourceIdentifier, type TypeIdentifier } from "@root/typeschema/types";

/**
 * Resolve the FHIR resource type literal for a generated resource-profile class
 * from the snapshot base only. Does not inspect filenames, canonical URLs, or
 * class names.
 */
export const resolveProfileResourceType = (base: TypeIdentifier | undefined): string => {
    if (!base) throw new Error("Cannot resolve FHIR resource type: snapshot base is missing");
    if (!base.name.trim()) throw new Error("Cannot resolve FHIR resource type: snapshot base name is empty");
    if (!isResourceIdentifier(base))
        throw new Error(
            `Cannot resolve FHIR resource type: snapshot base '${base.name}' is not a supported FHIR StructureDefinition root`,
        );
    return base.name;
};

/** Always calls `resolveProfileResourceType`. Returns the literal or the thrown reason. */
export const tryResolveProfileResourceType = (
    base: TypeIdentifier | undefined,
): { resourceType: string } | { error: string } => {
    try {
        return { resourceType: resolveProfileResourceType(base) };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
};
