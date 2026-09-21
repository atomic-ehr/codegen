import { describe, expect, it } from "bun:test";
import {
    ExtendedContactAvailabilityProfile,
    WorkflowReasonProfile,
} from "./fhir-types/hl7-fhir-uv-extensions-r4/profiles";

// The R4 variants of these eight extensions carried R5-only datatypes
// (CodeableReference, Availability) up to hl7.fhir.uv.extensions.r4 5.2.0 and could not be
// generated against R4 at all — the shipped input fixes exclude those lines from the index.
// generate.ts redirects every declaration in this closure to 5.3.0, where HL7 re-expressed
// them with R4 building blocks, so all eight generate here.
const REDIRECTED_EXTENSIONS = [
    "Extension_BDPManipulation",
    "Extension_BDPProcessing",
    "Extension_ExtendedContactAvailability",
    "Extension_ImmProcedure",
    "Extension_ProtectiveFactor",
    "Extension_SpecimenAdditive",
    "Extension_WorkflowBarrier",
    "Extension_WorkflowReason",
] as const;

const moduleSource = (name: string): Promise<string> =>
    Bun.file(`${import.meta.dir}/fhir-types/hl7-fhir-uv-extensions-r4/profiles/${name}.ts`).text();

describe("demo: a CodeableReference extension as R4 concept/reference slices", () => {
    it("builds a valid workflow-reason extension", () => {
        // 5.3.0 replaces the R5 CodeableReference value with a required `_datatype` marker plus
        // `concept` (CodeableConcept) and `reference` (Reference) sub-extensions.
        const reason = WorkflowReasonProfile.create({ extension: [] })
            .setDatatype("CodeableReference")
            .setExtensionConcept({
                coding: [{ system: "http://snomed.info/sct", code: "183460006", display: "Caesarean section" }],
                text: "Planned caesarean section",
            });

        expect(reason.validate().errors).toEqual([]);
        expect(reason.getDatatype()).toBe("CodeableReference");
        // The flat getter unwraps the slice's valueCodeableConcept back to a CodeableConcept.
        expect(reason.getExtensionConcept()?.text).toBe("Planned caesarean section");
        expect(reason.toResource()).toMatchSnapshot();
    });

    it("carries a reference instead, on the same extension", () => {
        const reason = WorkflowReasonProfile.create({ extension: [] })
            .setDatatype("CodeableReference")
            .setExtensionReference({ reference: "Condition/preeclampsia", display: "Pre-eclampsia" });

        expect(reason.validate().errors).toEqual([]);
        expect(reason.getExtensionReference()?.reference).toBe("Condition/preeclampsia");
        expect(reason.toResource()).toMatchSnapshot();
    });
});

describe("demo: an Availability extension as nested availableTime slices", () => {
    it("builds a valid extended-contact-availability extension", () => {
        // 5.3.0 replaces the R5 Availability value with nested availableTime/notAvailableTime
        // sub-extensions, each holding the days and times as their own extensions.
        const availability = ExtendedContactAvailabilityProfile.create({ extension: [] })
            .setDatatype("Availability")
            .setExtensionAvailableTime([
                {
                    extension: [
                        { url: "daysOfWeek", valueCode: "mon" },
                        { url: "daysOfWeek", valueCode: "wed" },
                        { url: "availableStartTime", valueTime: "09:00:00" },
                        { url: "availableEndTime", valueTime: "17:00:00" },
                    ],
                },
            ])
            .setExtensionNotAvailableTime([
                {
                    extension: [
                        { url: "description", valueString: "Public holidays" },
                        { url: "during", valuePeriod: { start: "2026-12-24", end: "2026-12-26" } },
                    ],
                },
            ]);

        expect(availability.validate().errors).toEqual([]);
        expect(availability.getDatatype()).toBe("Availability");
        expect(availability.getExtensionAvailableTime()).toHaveLength(1);
        expect(availability.toResource()).toMatchSnapshot();
    });
});

describe("generated modules", () => {
    it("emits all eight redirected extensions from 5.3.0", async () => {
        for (const name of REDIRECTED_EXTENSIONS) {
            const source = await moduleSource(name);
            expect(source).toContain("(pkg: hl7.fhir.uv.extensions.r4#5.3.0)");
        }
    });

    it("builds them from R4 types only", async () => {
        // The 5.2.0 shapes pulled Availability/CodeableReference out of hl7.fhir.r5.core, which
        // is in this closure — an R5 import here means the redirect stopped working.
        for (const name of REDIRECTED_EXTENSIONS) {
            const source = await moduleSource(name);
            expect(source).not.toContain("hl7-fhir-r5-core");
        }
    });

    it("pins the emitted workflow-reason module", async () => {
        expect(await moduleSource("Extension_WorkflowReason")).toMatchSnapshot();
    });

    it("pins the emitted extended-contact-availability module", async () => {
        expect(await moduleSource("Extension_ExtendedContactAvailability")).toMatchSnapshot();
    });
});

describe("known defect: the flat create path writes the wrong _datatype url", () => {
    it("writes the slice name where the profile fixes the canonical", () => {
        // In the SD, `Extension.extension:_datatype.url` is fixed to the full canonical (unlike
        // the `concept`/`reference` slices, whose urls are fixed to the short slice name), but
        // `createResource`'s flat branch uses the slice name for every sub-extension — so
        // `getDatatype()`, which looks the marker up by canonical, cannot find what it wrote.
        // FIXME: emit the slice's fixed url; this test then flips to the canonical.
        const flat = WorkflowReasonProfile.create({ datatype: "CodeableReference" });

        expect(flat.toResource().extension?.[0]?.url).toBe("_datatype");
        expect(flat.getDatatype()).toBeUndefined();
    });
});
