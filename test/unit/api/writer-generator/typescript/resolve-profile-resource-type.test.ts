import { describe, expect, test } from "bun:test";
import { resolveProfileResourceType } from "@root/api/writer-generator/typescript/profile-resource-type";
import type { CanonicalUrl, Name, TypeIdentifier } from "@root/typeschema/types";

const makeIdentifier = (
    kind: TypeIdentifier["kind"],
    name: string,
    url = `http://example.org/StructureDefinition/${name}`,
): TypeIdentifier => ({
    kind,
    package: "test-package",
    version: "1.0.0",
    name: name as Name,
    url: url as CanonicalUrl,
});

describe("resolveProfileResourceType", () => {
    test("resource base returns the resolved type name", () => {
        expect(resolveProfileResourceType(makeIdentifier("resource", "Observation"))).toBe("Observation");
    });

    test("Bundle resource base returns Bundle", () => {
        expect(resolveProfileResourceType(makeIdentifier("resource", "Bundle"))).toBe("Bundle");
    });

    test("throws for an Extension complex-type base", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("complex-type", "Extension"))).toThrow(
            /supported FHIR|not a supported/i,
        );
    });

    test("throws for a datatype complex-type base", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("complex-type", "Address"))).toThrow(
            /supported FHIR|not a supported/i,
        );
    });

    test("uses the resolved base name when a decoy URL would imply a different type", () => {
        const decoy = makeIdentifier("resource", "Observation", "http://hl7.org/fhir/StructureDefinition/Patient");
        expect(resolveProfileResourceType(decoy)).toBe("Observation");
    });

    test("throws when the base is missing", () => {
        expect(() => resolveProfileResourceType(undefined)).toThrow(/supported FHIR|snapshot base|resource type/i);
    });

    test("throws when the base name is empty", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("resource", ""))).toThrow(
            /supported FHIR|snapshot base|resource type/i,
        );
    });

    test("throws for a primitive base", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("primitive-type", "string"))).toThrow(
            /supported FHIR|not a supported/i,
        );
    });

    test("throws for an unsupported logical base", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("logical", "ExampleNotebook"))).toThrow(
            /supported FHIR|not a supported/i,
        );
    });

    test("throws for a profile identifier used as base", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("profile", "USCorePatient"))).toThrow(
            /supported FHIR|not a supported/i,
        );
    });

    test("throws for a nested identifier used as base", () => {
        expect(() => resolveProfileResourceType(makeIdentifier("nested", "Patient.contact"))).toThrow(
            /supported FHIR|not a supported/i,
        );
    });
});
