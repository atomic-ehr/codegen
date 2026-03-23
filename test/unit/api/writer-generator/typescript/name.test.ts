import { describe, expect, test } from "bun:test";
import { tsResourceName } from "@root/api/writer-generator/typescript/name";
import type { CanonicalUrl, Name, TypeIdentifier } from "@root/typeschema/types";

const makeIdentifier = (props: {
    kind: TypeIdentifier["kind"];
    name: string;
    url?: string;
    package?: string;
    version?: string;
}): TypeIdentifier => {
    return {
        kind: props.kind,
        package: props.package ?? "test-package",
        version: props.version ?? "1.0.0",
        name: props.name as Name,
        url: (props.url ?? props.name) as CanonicalUrl,
    };
};

describe("tsResourceName", () => {
    test("returns normalized name for simple resource identifier", () => {
        const id = makeIdentifier({ kind: "resource", name: "Patient" });
        expect(tsResourceName(id)).toBe("Patient");
    });

    test("returns normalized name for simple complex-type identifier", () => {
        const id = makeIdentifier({ kind: "complex-type", name: "HumanName" });
        expect(tsResourceName(id)).toBe("HumanName");
    });

    test("extracts name from URL when name is a full URL (CDA types)", () => {
        const id = makeIdentifier({
            kind: "complex-type",
            package: "hl7.cda.uv.core",
            version: "2.0.2-sd",
            name: "http://hl7.org/cda/stds/core/StructureDefinition/InfrastructureRoot",
            url: "http://hl7.org/cda/stds/core/StructureDefinition/InfrastructureRoot",
        });
        expect(tsResourceName(id)).toBe("InfrastructureRoot");
    });

    test("extracts name from URL for resource identifier with URL name", () => {
        const id = makeIdentifier({
            kind: "resource",
            name: "http://hl7.org/cda/stds/core/StructureDefinition/ClinicalDocument",
            url: "http://hl7.org/cda/stds/core/StructureDefinition/ClinicalDocument",
        });
        expect(tsResourceName(id)).toBe("ClinicalDocument");
    });

    test("normalizes special characters in name", () => {
        const id = makeIdentifier({ kind: "resource", name: "Some-Type.Name" });
        expect(tsResourceName(id)).toBe("Some_Type_Name");
    });

    test("handles nested identifier with fragment", () => {
        const id = makeIdentifier({
            kind: "nested",
            name: "Patient",
            url: "http://hl7.org/fhir/StructureDefinition/Patient#Patient.contact",
        });
        expect(tsResourceName(id)).toBe("PatientPatientContact");
    });

    test("handles nested identifier without fragment", () => {
        const id = makeIdentifier({
            kind: "nested",
            name: "Patient",
            url: "http://hl7.org/fhir/StructureDefinition/Patient",
        });
        expect(tsResourceName(id)).toBe("Patient");
    });

    test("handles primitive-type identifier", () => {
        const id = makeIdentifier({ kind: "primitive-type", name: "string" });
        expect(tsResourceName(id)).toBe("string");
    });

    test("escapes TypeScript keywords", () => {
        const id = makeIdentifier({ kind: "resource", name: "class" });
        expect(tsResourceName(id)).toBe("class_");
    });
});
