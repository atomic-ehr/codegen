/**
 * Defect Assertions
 *
 * Checks that reject a package defect (input the FHIR rules forbid) before it reaches generated
 * code. Each error names the defect and the `canonicalManager.patches` fix for it.
 */

import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import { type Register, resolveFsElementGenealogy } from "@root/typeschema/register";
import { packageMetaToFhir } from "@typeschema/types";
import type { Name, RichFHIRSchema } from "../types";

/** The specialization chain of a reference target, leaf first; empty if it does not resolve
 *  (`buildReferences` reports that). */
const referenceTargetChain = (register: Register, fhirSchema: RichFHIRSchema, ref: string): string[] => {
    const fs = register.resolveFs(fhirSchema.package_meta, register.ensureSpecializationCanonicalUrl(ref as Name));
    if (!fs) return [];
    return register.resolveFsSpecializations(fs.package_meta, fs.url).map((spec) => spec.url);
};

/** A profile may only narrow its base (https://hl7.org/fhir/profiling.html#using): every
 *  reference target a profile lists must lie within a target of the nearest ancestor that
 *  restates the element (a family such as `Resource` admits its descendants, and a profile target
 *  counts as its base resource). */
const assertReferenceTargetsNarrowBase = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
): void => {
    if (!element.refers) return;
    const ancestors = register.resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url).slice(1);
    const base = ancestors.find((fs) => resolveFsElementGenealogy([fs], path)[0]?.refers);
    const baseRefers = base ? resolveFsElementGenealogy([base], path)[0]?.refers : undefined;
    if (!base || !baseRefers) return;
    const allowed = baseRefers.map((ref) => referenceTargetChain(register, fhirSchema, ref)[0]);
    const exceeds = element.refers.some((ref) => {
        const chain = referenceTargetChain(register, fhirSchema, ref);
        return chain.length > 0 && !chain.some((url) => allowed.includes(url));
    });
    if (!exceeds) return;

    const elementId = [
        fhirSchema.type,
        ...path.slice(0, -1),
        element.choiceOf ? `${element.choiceOf}[x]` : path.at(-1),
    ].join(".");
    /** A canonicalManager patch scoped to one package and resource, ready to paste into generate.ts. */
    const fix = (pkg: string, url: string, targets: string[]) =>
        [
            `// add to APIBuilder argument at canonicalManager.patches.fhirResource`,
            `inPackage("${pkg}", [`,
            `    inResource("${url}", [`,
            `        patchElement("${elementId}", (element) => ({`,
            `            ...element,`,
            `            type: element.type?.map((type) => ({`,
            `                ...type,`,
            `                targetProfile: [${targets.map((target) => `"${target}"`).join(", ")}],`,
            `            })),`,
            `        })),`,
            `    ]),`,
            `])`,
        ]
            .map((line) => `  ${line}`)
            .join("\n");
    throw new Error(
        `Profile reference targets exceed its base:

  package:         ${packageMetaToFhir(fhirSchema.package_meta)}
  profile:         ${fhirSchema.url}
  base:            ${base.url}
  element:         ${elementId}
  base targets:    ${baseRefers.join(", ")}
  profile targets: ${element.refers.join(", ")}

A profile may only narrow its base (https://hl7.org/fhir/profiling.html#using), so the package is invalid.

Repair it with a canonicalManager patch (inPackage, inResource, patchElement from @atomic-ehr/fhir-canonical-manager/patch), either way:

1. Narrow the profile to its base's targets:

${fix(fhirSchema.package_meta.name, fhirSchema.url, baseRefers)}

2. Extend the base to the profile's targets:

${fix(base.package_meta.name, base.url, [...new Set([...baseRefers, ...element.refers])])}`,
    );
};

/** Throw on the first defect found in an element. */
export const assertNoElementDefects = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    path: string[],
    element: FHIRSchemaElement,
): void => {
    if (fhirSchema.derivation === "constraint") assertReferenceTargetsNarrowBase(register, fhirSchema, path, element);
};
