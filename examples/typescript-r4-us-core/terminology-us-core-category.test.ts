import { describe, expect, it } from "bun:test";
import { isCodeSystem } from "./fhir-types/hl7-fhir-r4-core/CodeSystem";
import {
    type USCoreCategoryCode,
    USCoreCategoryCodeSystem,
    USCoreCategoryCodeSystemMeta,
} from "./fhir-types/hl7-fhir-us-core/terminology";
import { conceptCodes, conceptDisplays } from "./fhir-types/terminology-types";

// The terminology surface embeds each complete CodeSystem as a real FHIR
// resource (typed against the generated CodeSystem, adjusted), with package
// provenance in a sibling const and runtime helpers deriving the simplified
// views. UI options, wire validation, generic FHIR tooling and audit policy
// all work from the same regenerated artifact.

describe("demo: US Core screening category picker", () => {
    it("derives UI options from the concept tree", () => {
        const displays = conceptDisplays(USCoreCategoryCodeSystem);
        const options = conceptCodes(USCoreCategoryCodeSystem).map((code) => ({
            code,
            label: displays[code] ?? code,
        }));

        expect(options).toContainEqual({ code: "sdoh", label: "SDOH" });
        expect(options).toContainEqual({ code: "functional-status", label: "Functional Status" });
    });

    it("validates codes arriving from the wire at runtime", () => {
        const codes: readonly string[] = conceptCodes(USCoreCategoryCodeSystem);
        const isUSCoreCategory = (value: string): value is USCoreCategoryCode => codes.includes(value);

        expect(isUSCoreCategory("sdoh")).toBeTrue();
        expect(isUSCoreCategory("sdohh")).toBeFalse();
    });

    it("is a real FHIR resource: guard, serialization, upload-ready", () => {
        // The emitted value IS a CodeSystem — generic FHIR tooling applies,
        // and it can be PUT to a terminology server to make the deployed
        // server agree with the SDK it serves.
        expect(isCodeSystem(USCoreCategoryCodeSystem)).toBeTrue();

        const wire = JSON.parse(JSON.stringify(USCoreCategoryCodeSystem));
        expect(wire.url).toBe("http://hl7.org/fhir/us/core/CodeSystem/us-core-category");
        expect(wire.status).toBe("active");
        expect(wire.concept.length).toBe(7);
        // Generator provenance lives beside the resource, never inside it:
        expect("packageId" in wire).toBeFalse();
    });

    it("keeps provenance beside the resource for a display-trust policy", () => {
        // Org policy, not generator policy: embedded displays count as
        // authoritative only when the package attestation is trusted.
        const trustedForDisplay = new Set<string>(["registry-integrity"]);

        expect(trustedForDisplay.has(USCoreCategoryCodeSystemMeta.verification)).toBeTrue();
        expect(USCoreCategoryCodeSystemMeta.packageId).toBe("hl7.fhir.us.core");
        expect(USCoreCategoryCodeSystem.content).toBe("complete");
    });
});
