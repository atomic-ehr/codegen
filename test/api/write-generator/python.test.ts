import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, r4Manager } from "@typeschema-test/utils";

describe("Python Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager, logger: mkErrorLogger() })
        .python({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    const files = result.filesGenerated.python!;
    expect(Object.keys(files).length).toEqual(153);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(files["generated/hl7_fhir_r4_core/patient.py"]).toMatchSnapshot();
    });
    it("static files", async () => {
        expect(files["generated/requirements.txt"]).toMatchSnapshot();
    });
    it("generates Coding with Generic[T] parameter", async () => {
        const basePy = files["generated/hl7_fhir_r4_core/base.py"];
        expect(basePy).toContain("class Coding(Element, Generic[T]):");
        expect(basePy).toContain("code: T | None");
    });
    it("generates CodeableConcept with Generic[T] parameter", async () => {
        const basePy = files["generated/hl7_fhir_r4_core/base.py"];
        expect(basePy).toContain("class CodeableConcept(Element, Generic[T]):");
        expect(basePy).toContain("coding: PyList[Coding[T]] | None");
    });
    it("generates CodeableConcept fields with enum bindings", async () => {
        const patientPy = files["generated/hl7_fhir_r4_core/patient.py"];
        expect(patientPy).toContain(
            'marital_status: CodeableConcept[Literal["A", "D", "I", "L", "M", "P", "S", "T", "U", "W", "UNK"] | str] | None',
        );
    });
    it("generates base.py with TypeVar import and declaration", async () => {
        const basePy = files["generated/hl7_fhir_r4_core/base.py"];
        expect(basePy).toContain("from typing import Any, Generic, List as PyList, Literal");
        expect(basePy).toContain("from typing_extensions import TypeVar");
        expect(basePy).toContain("T = TypeVar('T', bound=str, default=str)");
    });
    it("generates BundleEntryResponse with generic type-family parameter", async () => {
        const bundlePy = files["generated/hl7_fhir_r4_core/bundle.py"];
        expect(bundlePy).toContain("class BundleEntryResponse(BackboneElement, Generic[T]):");
        expect(bundlePy).toContain("outcome: T | None");
    });
    it("generates BundleEntry with generic type-family parameters", async () => {
        const bundlePy = files["generated/hl7_fhir_r4_core/bundle.py"];
        expect(bundlePy).toContain("class BundleEntry(BackboneElement, Generic[T1, T2]):");
        expect(bundlePy).toContain("resource: T1 | None");
        expect(bundlePy).toContain("response: BundleEntryResponse[T2] | None");
        expect(bundlePy).toMatchSnapshot();
    });
    it("generates Bundle with inherited generic params from BundleEntry", async () => {
        const bundlePy = files["generated/hl7_fhir_r4_core/bundle.py"];
        expect(bundlePy).toContain("class Bundle(Resource, Generic[T1, T2]):");
        expect(bundlePy).toContain("entry: PyList[BundleEntry[T1, T2]] | None");
        expect(bundlePy).toMatchSnapshot();
    });
    it("generates DomainResource with generic type-family parameter", async () => {
        const domainResourcePy = files["generated/hl7_fhir_r4_core/domain_resource.py"];
        expect(domainResourcePy).toContain("class DomainResource(Resource, Generic[T]):");
        expect(domainResourcePy).toContain("contained: PyList[T] | None");
    });
    it("declares resource-constrained TypeVars in bundle.py", async () => {
        const bundlePy = files["generated/hl7_fhir_r4_core/bundle.py"];
        expect(bundlePy).toContain("T1 = TypeVar('T1', bound=Resource, default=Resource)");
        expect(bundlePy).toContain("T2 = TypeVar('T2', bound=Resource, default=Resource)");
    });
});

describe("Python R4 Example (with generateProfile)", async () => {
    const logger = mkErrorLogger();
    const result = await new APIBuilder({ register: r4Manager, logger })
        .python({
            inMemoryOnly: true,
            generateProfile: true,
        })
        .generate();
    const files = result.filesGenerated.python!;

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("generates bodyweight profile with validate()", () => {
        expect(
            files["generated/hl7_fhir_r4_core/profiles/observation_observation_bodyweight.py"],
        ).toMatchSnapshot();
    });

    it("generates bp profile with validate()", () => {
        expect(
            files["generated/hl7_fhir_r4_core/profiles/observation_observation_bp.py"],
        ).toMatchSnapshot();
    });
});

describe("Python US Core Example", async () => {
    const logger = mkErrorLogger();
    const result = await new APIBuilder({ logger })
        .fromPackage("hl7.fhir.us.core", "8.0.1")
        .typeSchema({
            treeShake: {
                "hl7.fhir.us.core": {
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-tribal-affiliation": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-interpreter-needed": {},
                },
            },
        })
        .python({
            inMemoryOnly: true,
            generateProfile: true,
        })
        .generate();
    const files = result.filesGenerated.python!;

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("generates US Core Patient profile", () => {
        expect(
            files["generated/hl7_fhir_us_core/profiles/patient_uscore_patient_profile.py"],
        ).toMatchSnapshot();
    });

    it("generates US Core Blood Pressure profile", () => {
        expect(
            files["generated/hl7_fhir_us_core/profiles/observation_uscore_blood_pressure_profile.py"],
        ).toMatchSnapshot();
    });

    it("generates US Core Body Weight profile", () => {
        const key = "generated/hl7_fhir_us_core/profiles/observation_uscore_body_weight_profile.py";
        expect(files[key]).toMatchSnapshot();
    });

    it("generates US Core Race extension profile", () => {
        const key = "generated/hl7_fhir_us_core/profiles/extension_uscore_race_extension.py";
        expect(files[key]).toMatchSnapshot();
    });

    it("generates US Core profiles index", () => {
        expect(files["generated/hl7_fhir_us_core/profiles/__init__.py"]).toMatchSnapshot();
    });
});
