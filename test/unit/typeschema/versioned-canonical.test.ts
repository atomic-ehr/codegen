/**
 * Regression tests for versioned canonical resolution across packages.
 *
 * Root cause: kbv.basis@1.8.0 profiles reference de.basisprofil.r4@1.5.4 profiles
 * using versioned canonical URLs (e.g. |1.5.4 suffix). de.basisprofil.r4@1.5.4 ships
 * an .index.json that contains an ImplementationGuide entry with id=null. The canonical
 * manager's parseIndex rejects the entire .index.json when any entry has a null id,
 * silently leaving de.basisprofil.r4 with 0 indexed resources. This caused "Base resource
 * not found" errors when transforming KBV profiles that inherit from de.basisprofil.r4
 * profiles via versioned canonical references.
 *
 * Fix: registerFromPackageMetas and registerFromManager compute the canonical manager's
 * node_modules path and pass it as nodeModulesPath. mkPackageAwareResolver uses it as a
 * fallback when the canonical manager returns 0 resources for a focused package — scanning
 * the directory directly, which has no id-null restriction.
 *
 * See: codegen-vrq
 */
import { beforeAll, describe, expect, it } from "bun:test";
import type { CanonicalUrl } from "@root/typeschema/types";
import type { Register } from "@typeschema/register";
import { registerFromPackageMetas } from "@typeschema/register";

const kbvPkg = { name: "kbv.basis", version: "1.8.0" };
const basisprofil = { name: "de.basisprofil.r4", version: "1.5.4" };

describe("Versioned canonical resolution (codegen-vrq)", () => {
    let register: Register;

    beforeAll(async () => {
        register = await registerFromPackageMetas([kbvPkg, basisprofil], {});
    });

    describe("resolveFs — cross-package base type lookup", () => {
        it("finds de.basisprofil.r4 profile from kbv.basis context using clean URL", () => {
            const url = "http://fhir.de/StructureDefinition/observation-de-pflegegrad" as CanonicalUrl;
            const resolved = register.resolveFs(kbvPkg, url);
            expect(resolved).toBeDefined();
            expect(resolved?.url).toBe(url);
        });

        it("strips |version suffix before lookup — versioned canonical resolves to the same schema", () => {
            const versioned = "http://fhir.de/StructureDefinition/observation-de-pflegegrad|1.5.4" as CanonicalUrl;
            const clean = "http://fhir.de/StructureDefinition/observation-de-pflegegrad" as CanonicalUrl;

            // ensureSpecializationCanonicalUrl must strip the |version suffix
            const stripped = register.ensureSpecializationCanonicalUrl(versioned);
            expect(stripped).toBe(clean);

            // resolveFs with the stripped URL must find the schema
            const resolved = register.resolveFs(kbvPkg, stripped);
            expect(resolved).toBeDefined();
            expect(resolved?.url).toBe(clean);
        });

        it("resolves all vitalsign profiles that kbv.basis pins to de.basisprofil.r4@1.5.4", () => {
            // These are the profiles that kbv.basis@1.8.0 uses with |1.5.4 suffix in baseDefinition
            const vitalsignUrls: CanonicalUrl[] = [
                "http://fhir.de/StructureDefinition/observation-de-vitalsign-blutdruck",
                "http://fhir.de/StructureDefinition/observation-de-vitalsign-koerpergroesse",
                "http://fhir.de/StructureDefinition/observation-de-vitalsign-koerpergewicht",
                "http://fhir.de/StructureDefinition/observation-de-vitalsign-koerpertemperatur",
            ].map((u) => u as CanonicalUrl);

            for (const url of vitalsignUrls) {
                const resolved = register.resolveFs(kbvPkg, url);
                expect(resolved, `Expected ${url} to resolve`).toBeDefined();
            }
        });
    });

    describe("transformFhirSchema — base type resolution for KBV profiles", () => {
        it("resolves base type for KBV_PR_Base_Observation_Care_Level (versioned pflegegrad reference)", () => {
            // KBV_PR_Base_Observation_Care_Level has baseDefinition pointing to pflegegrad|1.5.4.
            // Before the fix, transformFhirSchema would throw "Base resource not found '...pflegegrad|1.5.4'"
            // because de.basisprofil.r4 had 0 indexed resources in the canonical manager.
            const careLevelUrl = "https://fhir.kbv.de/StructureDefinition/KBV_PR_Base_Observation_Care_Level";
            const careLevel = register.resolveFs(kbvPkg, careLevelUrl as CanonicalUrl);
            expect(careLevel, "KBV_PR_Base_Observation_Care_Level must be resolvable").toBeDefined();

            // The base type of care level is observation-de-pflegegrad|1.5.4.
            // After stripping the version suffix, it must be resolvable.
            expect(careLevel!.base, "care level must have a base definition").toBeDefined();
            const strippedBase = register.ensureSpecializationCanonicalUrl(careLevel!.base!);
            const baseResolved = register.resolveFs(kbvPkg, strippedBase);
            expect(baseResolved, `Base type '${strippedBase}' (from '${careLevel!.base}') must resolve`).toBeDefined();
        });

        it("resolves base type chain for KBV vitalsign profiles with versioned de.basisprofil.r4 references", () => {
            // KBV blood pressure profile: baseDefinition = ...observation-de-vitalsign-blutdruck|1.5.4
            const bpUrl = "https://fhir.kbv.de/StructureDefinition/KBV_PR_Base_Observation_Blood_Pressure";
            const bp = register.resolveFs(kbvPkg, bpUrl as CanonicalUrl);
            expect(bp, "KBV_PR_Base_Observation_Blood_Pressure must be resolvable").toBeDefined();

            const strippedBase = register.ensureSpecializationCanonicalUrl(bp!.base!);
            const baseResolved = register.resolveFs(kbvPkg, strippedBase);
            expect(baseResolved, `Base type '${strippedBase}' must resolve`).toBeDefined();
        });
    });
});
