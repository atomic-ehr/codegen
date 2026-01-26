import type { CanonicalUrl, PackageMeta } from "./types";

const codeableReferenceInR4 = "Use CodeableReference which is not provided by FHIR R4.";
const availabilityInR4 = "Use Availability which is not provided by FHIR R4.";

export const skipList: Record<string, Record<CanonicalUrl, string>> = {
    "hl7.fhir.uv.extensions.r4": {
        "http://hl7.org/fhir/StructureDefinition/extended-contact-availability": availabilityInR4,
        "http://hl7.org/fhir/StructureDefinition/immunization-procedure": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/specimen-additive": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/workflow-barrier": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/workflow-protectiveFactor": codeableReferenceInR4,
        "http://hl7.org/fhir/StructureDefinition/workflow-reason": codeableReferenceInR4,
    } as Record<CanonicalUrl, string>,
    "hl7.fhir.r5.core#5.0.0": {
        "http://hl7.org/fhir/StructureDefinition/shareablecodesystem":
            "FIXME: CodeSystem.concept.concept defined by ElementReference. FHIR Schema generator output broken value in it, so we just skip it for now.",
        "http://hl7.org/fhir/StructureDefinition/publishablecodesystem":
            "Uses R5-only base types not available in R4 generation.",
    } as Record<CanonicalUrl, string>,
};

export interface SkipCheckResult {
    shouldSkip: boolean;
    reason?: string;
}

export function shouldSkipCanonical(packageMeta: PackageMeta, canonicalUrl: CanonicalUrl): SkipCheckResult {
    const pkgId = `${packageMeta.name}#${packageMeta.version}`;

    const reasonByPkgId = skipList[pkgId]?.[canonicalUrl];
    if (reasonByPkgId) {
        return { shouldSkip: true, reason: reasonByPkgId };
    }

    const reasonByName = skipList[packageMeta.name]?.[canonicalUrl];
    if (reasonByName) {
        return { shouldSkip: true, reason: reasonByName };
    }

    return { shouldSkip: false };
}
