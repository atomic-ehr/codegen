/**
 * The shipped input fixes, expressed as CanonicalManager patches: known
 * generation-breaking StructureDefinitions in HL7's own packages are dropped
 * from the package index by `excludeCanonical` (they disappear from output
 * *and* resolution). Applied by every CanonicalManager the builder constructs,
 * before any user patches; `builtinPatches: false` on the builder opts out.
 *
 * Index patches are applied at scan time and cached — after changing this
 * list, drop the CanonicalManager cache for it to take effect.
 */

import type { Patches } from "@atomic-ehr/fhir-canonical-manager";
import { excludeCanonical } from "@atomic-ehr/fhir-canonical-manager/patch";

const codeableReferenceInR4 = "Use CodeableReference which is not provided by FHIR R4.";
const availabilityInR4 = "Use Availability which is not provided by FHIR R4.";

const R4_EXTENSIONS = [
    ["biologicallyderivedproduct-manipulation", codeableReferenceInR4],
    ["biologicallyderivedproduct-processing", codeableReferenceInR4],
    ["extended-contact-availability", availabilityInR4],
    ["immunization-procedure", codeableReferenceInR4],
    ["specimen-additive", codeableReferenceInR4],
    ["workflow-barrier", codeableReferenceInR4],
    ["workflow-protectiveFactor", codeableReferenceInR4],
    ["workflow-reason", codeableReferenceInR4],
] as const;

export const builtinPatches: Partial<Patches> = {
    indexEntry: [
        ...R4_EXTENSIONS.map(([name, reason]) =>
            excludeCanonical({
                package: "hl7.fhir.uv.extensions.r4",
                url: `http://hl7.org/fhir/StructureDefinition/${name}`,
                reason,
            }),
        ),
        excludeCanonical({
            package: { name: "hl7.fhir.r5.core", version: "5.0.0" },
            url: "http://hl7.org/fhir/StructureDefinition/shareablecodesystem",
            reason: "FIXME: CodeSystem.concept.concept defined by ElementReference. FHIR Schema generator output broken value in it, so we just skip it for now.",
        }),
        excludeCanonical({
            package: { name: "hl7.fhir.r5.core", version: "5.0.0" },
            url: "http://hl7.org/fhir/StructureDefinition/publishablecodesystem",
            reason: "Uses R5-only base types not available in R4 generation.",
        }),
    ],
};
