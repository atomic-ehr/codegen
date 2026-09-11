import type { CanonicalUrl, PackageMeta } from "./types";

/**
 * One canonical deliberately excluded from generation. `package` is a package
 * name or `name#version`; matching a specific version wins over a bare name.
 * Exclusion is a curated decision, never inferred from a failed resolution —
 * typos and missing dependencies must keep erroring.
 *
 * Enforcement deliberately lives in the TypeSchema stage, not in CM's index
 * (via `excludeCanonical`): CM bakes index patches into its cache at scan
 * time, so an updated exclusion would not reach warm caches — and an
 * index-level drop also removes the canonical from *resolution*, breaking
 * anything derived from it. Here the schema stays resolvable; only its
 * emission (and fields typed by it) are skipped, on every run.
 */
export type CanonicalExclusion = {
    package: string;
    url: CanonicalUrl;
    reason: string;
};

/** As the user writes it in configuration: `url` accepts a plain string or an already-typed canonical. */
export type CanonicalExclusionInput = Omit<CanonicalExclusion, "url"> & { url: string | CanonicalUrl };

/** The input layer: user-written strings become the branded domain type here. */
const toExclusion = (input: CanonicalExclusionInput): CanonicalExclusion => ({
    ...input,
    url: input.url as CanonicalUrl,
});

const codeableReferenceInR4 = "Use CodeableReference which is not provided by FHIR R4.";
const availabilityInR4 = "Use Availability which is not provided by FHIR R4.";

/** The shipped exclusions: known generation-breaking canonicals in HL7's own packages. */
export const builtinExclusions: CanonicalExclusion[] = (
    [
        ...(
            [
                ["biologicallyderivedproduct-manipulation", codeableReferenceInR4],
                ["biologicallyderivedproduct-processing", codeableReferenceInR4],
                ["extended-contact-availability", availabilityInR4],
                ["immunization-procedure", codeableReferenceInR4],
                ["specimen-additive", codeableReferenceInR4],
                ["workflow-barrier", codeableReferenceInR4],
                ["workflow-protectiveFactor", codeableReferenceInR4],
                ["workflow-reason", codeableReferenceInR4],
            ] as const
        ).map(([name, reason]) => ({
            package: "hl7.fhir.uv.extensions.r4",
            url: `http://hl7.org/fhir/StructureDefinition/${name}`,
            reason,
        })),
        {
            package: "hl7.fhir.r5.core#5.0.0",
            url: "http://hl7.org/fhir/StructureDefinition/shareablecodesystem",
            reason: "FIXME: CodeSystem.concept.concept defined by ElementReference. FHIR Schema generator output broken value in it, so we just skip it for now.",
        },
        {
            package: "hl7.fhir.r5.core#5.0.0",
            url: "http://hl7.org/fhir/StructureDefinition/publishablecodesystem",
            reason: "Uses R5-only base types not available in R4 generation.",
        },
    ] satisfies CanonicalExclusionInput[]
).map(toExclusion);

/** The exclusions a generation run applies: the shipped set (unless opted out) plus the project's own. */
export const resolveExclusions = (opts: {
    excludedCanonicals?: CanonicalExclusionInput[];
    builtinExclusions?: boolean;
}): CanonicalExclusion[] => [
    ...(opts.builtinExclusions === false ? [] : builtinExclusions),
    ...(opts.excludedCanonicals ?? []).map(toExclusion),
];

/** The exclusion matching `url` under `pkg`, if any (`name#version` beats bare name). */
export const findExclusion = (
    exclusions: CanonicalExclusion[],
    pkg: PackageMeta,
    url: CanonicalUrl,
): CanonicalExclusion | undefined => {
    const pkgId = `${pkg.name}#${pkg.version}`;
    return (
        exclusions.find((e) => e.url === url && e.package === pkgId) ??
        exclusions.find((e) => e.url === url && e.package === pkg.name)
    );
};
