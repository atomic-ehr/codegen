import { describe, expect, it } from "bun:test";
import type { ProfileTypeSchema, RegularField } from "@typeschema/types";
import { mkErrorLogger, mkR4Register, registerFs, registerFsAndMkTs } from "@typeschema-test/utils";

describe("reference target resolution", async () => {
    const r4 = await mkR4Register();
    const logger = mkErrorLogger();

    registerFs(r4, {
        url: "http://example.org/StructureDefinition/TestPatient",
        name: "TestPatient",
        base: "http://hl7.org/fhir/StructureDefinition/Patient",
        derivation: "constraint",
        kind: "resource",
    });

    it("profile-only targetProfile yields both the base resource and the profile", async () => {
        // Base Observation.subject references Patient (among others); the profile
        // restates it with ONLY a Patient profile as target.
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/TestObservation",
                    name: "TestObservation",
                    base: "http://hl7.org/fhir/StructureDefinition/Observation",
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        subject: {
                            type: "Reference",
                            refers: ["http://example.org/StructureDefinition/TestPatient"],
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const subject = ts.fields?.subject as RegularField;
        expect(subject.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient"]);
        expect(subject.reference?.resource[0]?.kind).toBe("resource");
        // Populated during index construction, which needs the whole corpus.
        expect(subject.reference?.effectiveResource).toBeUndefined();
        expect(subject.reference?.profiles?.map((ref): string => ref.name)).toEqual(["TestPatient"]);
        expect(subject.reference?.profiles?.[0]?.kind).toBe("profile");
    });

    it("profile alongside its base resource dedupes the resource list", async () => {
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/TestCondition",
                    name: "TestCondition",
                    base: "http://hl7.org/fhir/StructureDefinition/Condition",
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        subject: {
                            type: "Reference",
                            refers: [
                                "http://hl7.org/fhir/StructureDefinition/Group",
                                "http://hl7.org/fhir/StructureDefinition/Patient",
                                "http://example.org/StructureDefinition/TestPatient",
                            ],
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const subject = ts.fields?.subject as RegularField;
        expect(subject.reference?.resource.map((ref): string => ref.name)).toEqual(["Group", "Patient"]);
        expect(subject.reference?.profiles?.map((ref): string => ref.name)).toEqual(["TestPatient"]);
    });

    it("plain resource targets carry no profiles", async () => {
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/TestEncounter",
                    name: "TestEncounter",
                    base: "http://hl7.org/fhir/StructureDefinition/Encounter",
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        subject: {
                            type: "Reference",
                            refers: ["http://hl7.org/fhir/StructureDefinition/Patient"],
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const subject = ts.fields?.subject as RegularField;
        expect(subject.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient"]);
        expect(subject.reference?.profiles).toBeUndefined();
    });

    it("a versioned canonical names the same target as the bare resource name", async () => {
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/TestCarePlan",
                    name: "TestCarePlan",
                    base: "http://hl7.org/fhir/StructureDefinition/CarePlan",
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        subject: {
                            type: "Reference",
                            refers: [
                                "http://hl7.org/fhir/StructureDefinition/Patient|4.0.1",
                                "Patient",
                                "http://example.org/StructureDefinition/TestPatient",
                            ],
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const subject = ts.fields?.subject as RegularField;
        expect(subject.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient"]);
        expect(subject.reference?.profiles?.map((ref): string => ref.name)).toEqual(["TestPatient"]);
    });
});
