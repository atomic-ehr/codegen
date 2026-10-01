import { describe, expect, it } from "bun:test";
import type { CodegenLogManager } from "@root/utils/log";
import type { ChoiceFieldInstance, ProfileTypeSchema, RegularField } from "@typeschema/types";
import { mkErrorLogger, mkR4Register, registerFs, registerFsAndMkTs, resolveTs } from "@typeschema-test/utils";

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

const taggedWarnings = (logger: CodegenLogManager, tag: string): string[] => [
    ...new Set(
        logger
            .buffer()
            .filter((e) => e.tag === tag)
            .map((e) => e.message),
    ),
];

const fhir = (name: string) => `http://hl7.org/fhir/StructureDefinition/${name}`;

describe("reference targets wider than the base", async () => {
    const r4 = await mkR4Register();

    registerFs(r4, {
        url: "http://example.org/StructureDefinition/TargetPatient",
        name: "TargetPatient",
        base: fhir("Patient"),
        derivation: "constraint",
        kind: "resource",
    });
    registerFs(r4, {
        url: "http://example.org/StructureDefinition/TargetPerson",
        name: "TargetPerson",
        base: fhir("Person"),
        derivation: "constraint",
        kind: "resource",
    });
    const widenedRelatedPerson = registerFs(r4, {
        url: "http://example.org/StructureDefinition/WidenedRelatedPerson",
        name: "WidenedRelatedPerson",
        base: fhir("RelatedPerson"),
        derivation: "constraint",
        kind: "resource",
        elements: { patient: { type: "Reference", refers: [fhir("Patient"), fhir("Person")] } },
    });

    it("keeps a widened top-level target", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await resolveTs(r4, widenedRelatedPerson.package_meta, widenedRelatedPerson.url, logger)
        )[0] as ProfileTypeSchema;

        const patient = ts.fields?.patient as RegularField;
        expect(patient.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient", "Person"]);
        expect(patient.reference?.profiles).toBeUndefined();
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });

    it("keeps a narrowing of a family base", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/NarrowedProvenance",
                    name: "NarrowedProvenance",
                    base: fhir("Provenance"),
                    derivation: "constraint",
                    kind: "resource",
                    elements: { target: { type: "Reference", refers: [fhir("Device"), fhir("Patient")] } },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const target = ts.fields?.target as RegularField;
        expect(target.reference?.resource.map((ref): string => ref.name)).toEqual(["Device", "Patient"]);
        expect(target.reference?.profiles).toBeUndefined();
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });

    it("keeps targets restated on an unconstrained base", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/PatientReferenceExtension",
                    name: "PatientReferenceExtension",
                    base: fhir("Extension"),
                    derivation: "constraint",
                    kind: "complex-type",
                    elements: {
                        valueReference: { type: "Reference", choiceOf: "value", refers: [fhir("Patient")] },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const valueReference = ts.fields?.valueReference as ChoiceFieldInstance;
        expect(valueReference.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient"]);
        expect(valueReference.reference?.profiles).toBeUndefined();
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });

    it("keeps a widened choice variant", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/WidenedMedicationRequest",
                    name: "WidenedMedicationRequest",
                    base: fhir("MedicationRequest"),
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        reportedReference: {
                            type: "Reference",
                            choiceOf: "reported",
                            refers: [fhir("Device"), fhir("Patient"), fhir("Practitioner")],
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const reportedReference = ts.fields?.reportedReference as ChoiceFieldInstance;
        expect(reportedReference.reference?.resource.map((ref): string => ref.name)).toEqual([
            "Device",
            "Patient",
            "Practitioner",
        ]);
        expect(reportedReference.reference?.profiles).toBeUndefined();
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });

    it("keeps a widened nested element", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/WidenedEncounter",
                    name: "WidenedEncounter",
                    base: fhir("Encounter"),
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        participant: {
                            elements: {
                                individual: {
                                    type: "Reference",
                                    refers: [fhir("Patient"), fhir("Practitioner")],
                                },
                            },
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const participant = ts.nested?.find((nested) => nested.identifier.name === "participant");
        const individual = participant?.fields?.individual as RegularField;
        expect(individual.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient", "Practitioner"]);
        expect(individual.reference?.profiles).toBeUndefined();
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });

    it("keeps a grandchild target disjoint from the base", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/PersonOnlyRelatedPerson",
                    name: "PersonOnlyRelatedPerson",
                    base: widenedRelatedPerson.url,
                    derivation: "constraint",
                    kind: "resource",
                    elements: { patient: { type: "Reference", refers: [fhir("Person")] } },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const patient = ts.fields?.patient as RegularField;
        expect(patient.reference?.resource.map((ref): string => ref.name)).toEqual(["Person"]);
        expect(patient.reference?.profiles).toBeUndefined();
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });

    it("keeps profile targets of resources outside the base", async () => {
        const logger = mkErrorLogger();
        const ts = (
            await registerFsAndMkTs(
                r4,
                {
                    url: "http://example.org/StructureDefinition/ProfiledRelatedPerson",
                    name: "ProfiledRelatedPerson",
                    base: fhir("RelatedPerson"),
                    derivation: "constraint",
                    kind: "resource",
                    elements: {
                        patient: {
                            type: "Reference",
                            refers: [
                                fhir("Patient"),
                                "http://example.org/StructureDefinition/TargetPatient",
                                "http://example.org/StructureDefinition/TargetPerson",
                            ],
                        },
                    },
                },
                logger,
            )
        )[0] as ProfileTypeSchema;

        const patient = ts.fields?.patient as RegularField;
        expect(patient.reference?.resource.map((ref): string => ref.name)).toEqual(["Patient", "Person"]);
        expect(patient.reference?.profiles?.map((ref): string => ref.name)).toEqual(["TargetPatient", "TargetPerson"]);
        expect(taggedWarnings(logger, "#nonMonotonicReference")).toEqual([]);
    });
});
