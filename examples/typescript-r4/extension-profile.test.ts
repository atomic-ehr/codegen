/**
 * FHIR R4 Extension Profile Tests
 *
 * Tests generated extension profile classes: static factory methods and resource wrapping.
 */

import { expect, test } from "bun:test";
import type { HumanName } from "./fhir-types/hl7-fhir-r4-core/HumanName";
import type { Patient, } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { humanname_own_prefixProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_humanname_own_prefix";
import { patient_birthPlaceProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_patient_birthPlace";
import { patient_birthTimeProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_patient_birthTime";
import { patient_nationalityProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_patient_nationality";

test("Patient with extensions built from profiles", () => {
    const name: HumanName = {
        family: "van Beethoven",
        _family: {
            extension: [humanname_own_prefixProfile.createResource({ valueString: "van" })],
        },
        given: ["Ludwig"],
    };

    const patient: Patient = {
        resourceType: "Patient",
        extension: [patient_birthPlaceProfile.createResource({ valueAddress: { city: "Bonn", country: "DE" } })],
        birthDate: "1770-12-17",
        _birthDate: {
            extension: [patient_birthTimeProfile.createResource({ valueDateTime: "1770-12-17T12:00:00+01:00" })],
        },
        name: [name],
    };

    expect(patient).toMatchSnapshot();
});

test("from() wraps existing resource", () => {
    const ext = patient_birthPlaceProfile.createResource({ valueAddress: { city: "Boston" } });
    const profile = patient_birthPlaceProfile.from(ext);
    expect(profile.toResource()).toBe(ext);
});

test("createResource() sets url and required value (Address)", () => {
    const resource = patient_birthPlaceProfile.createResource({ valueAddress: { city: "Boston", country: "US" } });
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-birthPlace");
    expect(resource.valueAddress).toEqual({ city: "Boston", country: "US" });
});

test("createResource() sets url and required value (string)", () => {
    const resource = humanname_own_prefixProfile.createResource({ valueString: "van" });
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/humanname-own-prefix");
    expect(resource.valueString).toBe("van");
});

test("createResource() sets url and required value (dateTime)", () => {
    const resource = patient_birthTimeProfile.createResource({ valueDateTime: "1990-03-15T08:22:00-05:00" });
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-birthTime");
    expect(resource.valueDateTime).toBe("1990-03-15T08:22:00-05:00");
});

test("createResource() with no required params sets only url", () => {
    const resource = patient_nationalityProfile.createResource();
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-nationality");
});

test("create() returns profile wrapping new resource", () => {
    const profile = patient_birthPlaceProfile.create({ valueAddress: { city: "Vienna" } });
    const resource = profile.toResource();
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-birthPlace");
    expect(resource.valueAddress).toEqual({ city: "Vienna" });
});

test("create() with no required params", () => {
    const profile = patient_nationalityProfile.create();
    expect(profile.toResource().url).toBe("http://hl7.org/fhir/StructureDefinition/patient-nationality");
});
