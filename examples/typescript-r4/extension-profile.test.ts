/**
 * FHIR R4 Extension Profile Tests
 *
 * Tests generated extension profile classes: static factory methods and resource wrapping.
 */

import { expect, test } from "bun:test";
import type { HumanName } from "./fhir-types/hl7-fhir-r4-core/HumanName";
import type { Patient } from "./fhir-types/hl7-fhir-r4-core/Patient";
import { birthPlaceProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_birthPlace";
import { birthTimeProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_birthTime";
import { nationalityProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_nationality";
import { own_prefixProfile } from "./fhir-types/hl7-fhir-r4-core/profiles/Extension_own_prefix";

test("Patient with extensions built from profiles", () => {
    const name: HumanName = {
        family: "van Beethoven",
        _family: {
            extension: [own_prefixProfile.createResource({ valueString: "van" })],
        },
        given: ["Ludwig"],
    };

    const patient: Patient = {
        resourceType: "Patient",
        extension: [birthPlaceProfile.createResource({ valueAddress: { city: "Bonn", country: "DE" } })],
        birthDate: "1770-12-17",
        _birthDate: {
            extension: [birthTimeProfile.createResource({ valueDateTime: "1770-12-17T12:00:00+01:00" })],
        },
        name: [name],
    };

    expect(patient).toMatchSnapshot();
});

test("from() wraps existing resource", () => {
    const ext = birthPlaceProfile.createResource({ valueAddress: { city: "Boston" } });
    const profile = birthPlaceProfile.from(ext);
    expect(profile.toResource()).toBe(ext);
});

test("createResource() sets url and required value (Address)", () => {
    const resource = birthPlaceProfile.createResource({ valueAddress: { city: "Boston", country: "US" } });
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-birthPlace");
    expect(resource.valueAddress).toEqual({ city: "Boston", country: "US" });
});

test("createResource() sets url and required value (string)", () => {
    const resource = own_prefixProfile.createResource({ valueString: "van" });
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/humanname-own-prefix");
    expect(resource.valueString).toBe("van");
});

test("createResource() sets url and required value (dateTime)", () => {
    const resource = birthTimeProfile.createResource({ valueDateTime: "1990-03-15T08:22:00-05:00" });
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-birthTime");
    expect(resource.valueDateTime).toBe("1990-03-15T08:22:00-05:00");
});

test("createResource() with no required params sets only url", () => {
    const resource = nationalityProfile.createResource();
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-nationality");
});

test("create() returns profile wrapping new resource", () => {
    const profile = birthPlaceProfile.create({ valueAddress: { city: "Vienna" } });
    const resource = profile.toResource();
    expect(resource.url).toBe("http://hl7.org/fhir/StructureDefinition/patient-birthPlace");
    expect(resource.valueAddress).toEqual({ city: "Vienna" });
});

test("create() with no required params", () => {
    const profile = nationalityProfile.create();
    expect(profile.toResource().url).toBe("http://hl7.org/fhir/StructureDefinition/patient-nationality");
});
