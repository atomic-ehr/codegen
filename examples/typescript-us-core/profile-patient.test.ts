/**
 * US Core Patient Profile Class API Tests
 *
 * Demonstrates all profile features:
 * - Creation methods: create(), createResource(), from() (validating), apply() (non-validating)
 * - Field accessors with fluent chaining
 * - Complex extension setters (flat input, profile instance, raw Extension)
 * - Simple extension setters (flat input, profile instance, raw Extension)
 * - Extension getters: simplified and raw Extension forms
 * - Validation of required fields
 */

import { describe, expect, test } from "bun:test";
import type { Extension } from "./fhir-types/hl7-fhir-r4-core/Extension";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import {
    USCoreEthnicityExtensionProfile,
    USCoreIndividualSexExtensionProfile,
    USCorePatientProfile,
    USCoreRaceExtensionProfile,
} from "./fhir-types/hl7-fhir-us-core/profiles";
import type { USCoreRaceExtensionProfileFlat } from "./fhir-types/hl7-fhir-us-core/profiles/Extension_USCoreRaceExtension";

describe("demo", () => {
    test("three ways to set an extension: flat input, profile instance, raw Extension", () => {
        const patient: USCorePatientProfile = USCorePatientProfile.create({
            identifier: [{ system: "http://hospital.example.org/mrn", value: "MRN-12345" }],
            name: [{ family: "Garcia", given: ["Maria", "Elena"] }],
        });

        const raceInput: USCoreRaceExtensionProfileFlat = {
            ombCategory: { system: "urn:oid:2.16.840.1.113883.6.238", code: "2106-3", display: "White" },
            text: "White",
        };
        patient.setRace(raceInput);

        const ethnicityProfile: USCoreEthnicityExtensionProfile = USCoreEthnicityExtensionProfile.create({
            ombCategory: { code: "2135-2", display: "Hispanic or Latino" },
            detailed: [{ code: "2148-5", display: "Mexican" }],
            text: "Mexican",
        });
        patient.setEthnicity(ethnicityProfile);

        const sexExtension: Extension = {
            url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex",
            valueCoding: { code: "female", display: "Female" },
        };
        patient.setSex(sexExtension);

        expect(patient.validate().errors).toEqual([]);
        expect(patient.toResource()).toEqual({
            resourceType: "Patient",
            identifier: [{ system: "http://hospital.example.org/mrn", value: "MRN-12345" }],
            name: [{ family: "Garcia", given: ["Maria", "Elena"] }],
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
            extension: [
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
                    extension: [
                        {
                            url: "ombCategory",
                            valueCoding: {
                                system: "urn:oid:2.16.840.1.113883.6.238",
                                code: "2106-3",
                                display: "White",
                            },
                        },
                        { url: "text", valueString: "White" },
                    ],
                },
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
                    extension: [
                        { url: "ombCategory", valueCoding: { code: "2135-2", display: "Hispanic or Latino" } },
                        { url: "detailed", valueCoding: { code: "2148-5", display: "Mexican" } },
                        { url: "text", valueString: "Mexican" },
                    ],
                },
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex",
                    valueCoding: { code: "female", display: "Female" },
                },
            ],
        });
    });

    test("import a profiled resource from an API and access data via typed getters", () => {
        const apiResponse: Patient = {
            resourceType: "Patient",
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
            identifier: [{ system: "http://hospital.example.org/mrn", value: "MRN-99999" }],
            name: [{ family: "Smith", given: ["John"] }],
            extension: [
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
                    extension: [
                        { url: "ombCategory", valueCoding: { code: "2054-5", display: "Black or African American" } },
                        { url: "text", valueString: "Black or African American" },
                    ],
                },
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex",
                    valueCoding: { code: "male" },
                },
            ],
        };

        const patient = USCorePatientProfile.from(apiResponse);

        expect(apiResponse.meta?.profile).toContain("http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient");
        expect(patient.getName()).toEqual([{ family: "Smith", given: ["John"] }]);
        expect(patient.getRace()).toEqual({
            ombCategory: { code: "2054-5", display: "Black or African American" },
            detailed: [],
            text: "Black or African American",
        });
        expect(patient.getSex()).toEqual({ code: "male" });
        expect(patient.getEthnicity()).toBeUndefined();
    });

    test("apply profile to a bare resource and populate it", () => {
        const patient = USCorePatientProfile.apply({ resourceType: "Patient" });

        patient.setIdentifier([{ system: "http://hospital.example.org/mrn", value: "MRN-00001" }]);
        patient.setName([{ family: "Chen", given: ["Wei"] }]);
        patient.setRace({ ombCategory: { code: "2028-9", display: "Asian" }, text: "Chinese" });
        patient.setEthnicity({ text: "Not Hispanic or Latino" });

        expect(patient.validate().errors).toEqual([]);
        expect(patient.toResource()).toEqual({
            resourceType: "Patient",
            identifier: [{ system: "http://hospital.example.org/mrn", value: "MRN-00001" }],
            name: [{ family: "Chen", given: ["Wei"] }],
            meta: { profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"] },
            extension: [
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
                    extension: [
                        { url: "ombCategory", valueCoding: { code: "2028-9", display: "Asian" } },
                        { url: "text", valueString: "Chinese" },
                    ],
                },
                {
                    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity",
                    extension: [{ url: "text", valueString: "Not Hispanic or Latino" }],
                },
            ],
        });
    });
});

describe("US Core Patient profile creation", () => {
    let fromCreate: Patient;
    let fromCreateResource: Patient;
    let fromFrom: Patient;

    test("create() returns a profile wrapping the resource", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ system: "http://hospital.example.org", value: "12345" }],
            name: [{ family: "Smith", given: ["John"] }],
        });
        fromCreate = profile.toResource();

        expect(fromCreate.resourceType).toBe("Patient");
        expect(fromCreate.identifier![0]!.value).toBe("12345");
        expect(fromCreate.name![0]!.family).toBe("Smith");
    });

    test("createResource() returns a plain Patient", () => {
        fromCreateResource = USCorePatientProfile.createResource({
            identifier: [{ system: "http://hospital.example.org", value: "12345" }],
            name: [{ family: "Smith", given: ["John"] }],
        });

        expect(fromCreateResource.resourceType).toBe("Patient");
        expect(fromCreateResource.identifier![0]!.value).toBe("12345");
    });

    test("apply() wraps an existing Patient", () => {
        const patient: Patient = { resourceType: "Patient" };
        const profile = USCorePatientProfile.apply(patient);

        profile
            .setIdentifier([{ system: "http://hospital.example.org", value: "12345" }])
            .setName([{ family: "Smith", given: ["John"] }]);

        fromFrom = profile.toResource();

        expect(fromFrom).toBe(patient); // same reference
        expect(profile.getIdentifier()![0]!.value).toBe("12345");
        expect(profile.getName()![0]!.family).toBe("Smith");
    });

    test("all three methods produce equal resources", () => {
        expect(fromCreate).toEqual(fromCreateResource);
        expect(fromCreate).toEqual(fromFrom);
    });

    test("all three methods set meta.profile", () => {
        const expected = ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"];
        expect(fromCreate.meta?.profile).toEqual(expected);
        expect(fromCreateResource.meta?.profile).toEqual(expected);
        expect(fromFrom.meta?.profile).toEqual(expected);
    });
});

describe("US Core Patient profile field accessors", () => {
    const profile = USCorePatientProfile.create({
        identifier: [{ system: "http://hospital.example.org", value: "12345" }],
        name: [{ family: "Smith", given: ["John"] }],
    });

    test("getIdentifier / setIdentifier", () => {
        expect(profile.getIdentifier()![0]!.value).toBe("12345");
        profile.setIdentifier([{ system: "http://hospital.example.org", value: "67890" }]);
        expect(profile.getIdentifier()![0]!.value).toBe("67890");
    });

    test("getName / setName", () => {
        expect(profile.getName()![0]!.family).toBe("Smith");
        profile.setName([{ family: "Doe", given: ["Jane"] }]);
        expect(profile.getName()![0]!.family).toBe("Doe");
    });

    test("fluent chaining across field accessors", () => {
        const result = profile
            .setIdentifier([{ system: "http://hospital.example.org", value: "AAA" }])
            .setName([{ family: "Lee" }]);

        expect(result).toBe(profile);
        expect(profile.getIdentifier()![0]!.value).toBe("AAA");
        expect(profile.getName()![0]!.family).toBe("Lee");
    });
});

describe("US Core Patient profile extensions", () => {
    test("canonicalUrl is exposed", () => {
        expect(USCorePatientProfile.canonicalUrl).toBe(
            "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
        );
    });

    test("setRace / getRace round-trip with detailed categories", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        profile.setRace({
            ombCategory: { system: "urn:oid:2.16.840.1.113883.6.238", code: "2106-3", display: "White" },
            detailed: [{ code: "2108-9", display: "European" }],
            text: "White European",
        });

        const race = profile.getRace();
        expect(race?.ombCategory?.code).toBe("2106-3");
        expect(race?.text).toBe("White European");
    });

    test("getRace('raw') returns raw Extension", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        profile.setRace({
            ombCategory: { code: "2106-3", display: "White" },
            text: "White",
        });

        const raw = profile.getRace("raw");
        expect(raw).toBeDefined();
        expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-race");
        expect(raw?.extension).toBeArray();
    });

    test("setSex / getSex round-trip", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        profile.setSex({ system: "http://hl7.org/fhir/administrative-gender", code: "male" });

        expect(profile.getSex()?.code).toBe("male");
    });

    test("getSex('raw') returns raw Extension", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        profile.setSex({ system: "http://hl7.org/fhir/administrative-gender", code: "female" });

        const raw = profile.getSex("raw");
        expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex");
        expect(raw?.valueCoding?.code).toBe("female");
    });

    test("extension getters return undefined when not set", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        expect(profile.getRace()).toBeUndefined();
        expect(profile.getEthnicity()).toBeUndefined();
        expect(profile.getSex()).toBeUndefined();
        expect(profile.getTribalAffiliation()).toBeUndefined();
        expect(profile.getInterpreterRequired()).toBeUndefined();

        expect(profile.getRace("raw")).toBeUndefined();
        expect(profile.getEthnicity("raw")).toBeUndefined();
        expect(profile.getSex("raw")).toBeUndefined();
        expect(profile.getTribalAffiliation("raw")).toBeUndefined();
        expect(profile.getInterpreterRequired("raw")).toBeUndefined();
    });

    test("fluent chaining across extensions", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        const result = profile
            .setRace({ text: "White" })
            .setEthnicity({ text: "Not Hispanic or Latino" })
            .setSex({ code: "male" })
            .setTribalAffiliation({ tribalAffiliation: { text: "Navajo" } })
            .setInterpreterRequired({ code: "no" });

        expect(result).toBe(profile);
        expect(profile.getRace()?.text).toBe("White");
        expect(profile.getEthnicity()?.text).toBe("Not Hispanic or Latino");
        expect(profile.getSex()?.code).toBe("male");
        expect(profile.getTribalAffiliation()?.tribalAffiliation?.text).toBe("Navajo");
        expect(profile.getInterpreterRequired()?.code).toBe("no");
    });

    test("extensions are added to the resource", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        profile.setRace({ text: "White" }).setSex({ code: "male" });

        const resource = profile.toResource();
        expect(resource.extension).toBeArray();
        expect(resource.extension!.length).toBe(2);
        expect(resource.extension!.some((e) => e.url?.includes("us-core-race"))).toBe(true);
        expect(resource.extension!.some((e) => e.url?.includes("us-core-individual-sex"))).toBe(true);
    });
});

describe("US Core Patient multi-form extension setters", () => {
    // -- Race: complex extension (representative for ethnicity, tribal) --

    test("setRace accepts extension profile instance", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        const raceProfile = USCoreRaceExtensionProfile.create({ extension: [] });
        raceProfile.setExtensionOmbCategory({ code: "2106-3", display: "White" });
        raceProfile.setExtensionText({ valueString: "White" });

        profile.setRace(raceProfile);

        const raw = profile.getRace("raw");
        expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-race");
        expect(raw?.extension).toBeArray();
    });

    test("setRace accepts raw Extension", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        const rawExtension: Extension = {
            url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",
            extension: [
                { url: "ombCategory", valueCoding: { code: "2106-3", display: "White" } },
                { url: "text", valueString: "White" },
            ],
        };

        profile.setRace(rawExtension);

        const raw = profile.getRace("raw");
        expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-race");
        expect(raw).toBe(rawExtension);
    });

    test("setRace throws on wrong Extension url", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        const wrongExtension: Extension = {
            url: "http://example.com/wrong-url",
            extension: [],
        };

        expect(() => profile.setRace(wrongExtension)).toThrow("Expected extension url");
    });

    // -- Sex: simple extension (representative for interpreterRequired) --

    test("setSex accepts extension profile instance", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        const sexProfile = USCoreIndividualSexExtensionProfile.create({ valueCoding: { code: "male" } });
        profile.setSex(sexProfile);

        const raw = profile.getSex("raw");
        expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex");
        expect(raw?.valueCoding?.code).toBe("male");
    });

    test("setSex accepts raw Extension", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        const rawExtension: Extension = {
            url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex",
            valueCoding: { code: "female" },
        };

        profile.setSex(rawExtension);

        const raw = profile.getSex("raw");
        expect(raw?.url).toBe("http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex");
        expect(raw).toBe(rawExtension);
    });
});

describe("US Core Patient profile mutability", () => {
    test("profile mutates the underlying resource", () => {
        const patient: Patient = { resourceType: "Patient" };
        const profile = USCorePatientProfile.apply(patient);

        profile.setIdentifier([{ value: "123" }]);
        expect(patient.identifier![0]!.value).toBe("123");

        profile.setName([{ family: "Doe" }]);
        expect(patient.name![0]!.family).toBe("Doe");
    });
});

describe("US Core Patient profile validation", () => {
    test("freshly created profile with required fields is valid", () => {
        const profile = USCorePatientProfile.create({
            identifier: [{ value: "1" }],
            name: [{ family: "Test" }],
        });

        expect(profile.validate().errors).toEqual([]);
    });

    test("profile from empty resource reports missing required fields", () => {
        const profile = USCorePatientProfile.apply({ resourceType: "Patient" });

        const { errors } = profile.validate();
        expect(errors).toContain("USCorePatientProfile: required field 'identifier' is missing");
        expect(errors).toContain("USCorePatientProfile: required field 'name' is missing");
    });
});
