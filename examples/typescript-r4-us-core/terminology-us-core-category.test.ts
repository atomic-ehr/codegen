import { describe, expect, it } from "bun:test";
import { type USCoreCategoryCode, USCoreCategoryCodeSystem } from "./fhir-types/hl7-fhir-us-core/terminology";

// The terminology surface complements the compile-time code unions with
// runtime data: one generated `as const` object carries the code list, the
// display map, and the package provenance. UI options, display lookup and
// wire validation all derive from that single artifact — no hand-copied code
// lists that silently drift from the package on upgrade.

describe("demo: US Core screening category picker", () => {
    it("derives UI options from the generated code list", () => {
        // The union type alone can't do this — types are erased at runtime.
        const options = USCoreCategoryCodeSystem.codes.map((code) => ({
            code,
            label: USCoreCategoryCodeSystem.displays[code],
        }));

        expect(options.length).toBe(USCoreCategoryCodeSystem.codes.length);
        expect(options).toContainEqual({ code: "sdoh", label: "SDOH" });
        expect(options).toContainEqual({ code: "functional-status", label: "Functional Status" });
    });

    it("validates codes arriving from the wire at runtime", () => {
        const isUSCoreCategory = (value: string): value is USCoreCategoryCode =>
            (USCoreCategoryCodeSystem.codes as readonly string[]).includes(value);

        expect(isUSCoreCategory("sdoh")).toBeTrue();
        expect(isUSCoreCategory("sdohh")).toBeFalse();

        // The guard narrows to the generated union, so the display map is
        // indexable without a cast:
        const incoming = "disability-status";
        if (isUSCoreCategory(incoming)) {
            expect(USCoreCategoryCodeSystem.displays[incoming]).toBe("Disability Status");
        }
    });

    it("carries provenance for a display-trust policy", () => {
        // Org policy, not generator policy: embedded displays count as
        // authoritative only when the package attestation is trusted;
        // otherwise a client would fall back to a terminology server.
        const trustedForDisplay = new Set<string>(["registry-integrity"]);

        expect(trustedForDisplay.has(USCoreCategoryCodeSystem.verification)).toBeTrue();
        expect(USCoreCategoryCodeSystem.packageId).toBe("hl7.fhir.us.core");
        expect(USCoreCategoryCodeSystem.contentMode).toBe("complete");
    });
});
