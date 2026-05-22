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

    it("static files", async () => {
        expect(files["generated/requirements.txt"]).toMatchSnapshot();
    });

    describe("base.py", () => {
        const basePy = files["generated/hl7_fhir_r4_core/base.py"];
        it("generates Coding with Generic[T] parameter", () => {
            expect(basePy).toContain("class Coding(Element, Generic[T]):");
            expect(basePy).toContain("code: T | None");
        });
        it("generates CodeableConcept with Generic[T] parameter", () => {
            expect(basePy).toContain("class CodeableConcept(Element, Generic[T]):");
            expect(basePy).toContain("coding: PyList[Coding[T]] | None");
        });
        it("generates TypeVar import and declaration", () => {
            expect(basePy).toContain("from typing import Any, Generic, List as PyList, Literal");
            expect(basePy).toContain("from typing_extensions import TypeVar");
            expect(basePy).toContain("T = TypeVar('T', bound=str, default=str)");
        });
    });

    describe("bundle.py", () => {
        const bundlePy = files["generated/hl7_fhir_r4_core/bundle.py"];
        it("generates BundleEntryResponse with generic type-family parameter", () => {
            expect(bundlePy).toContain("class BundleEntryResponse(BackboneElement, Generic[T]):");
            expect(bundlePy).toContain("outcome: T | None");
        });
        it("generates BundleEntry with generic type-family parameters", () => {
            expect(bundlePy).toContain("class BundleEntry(BackboneElement, Generic[T1, T2]):");
            expect(bundlePy).toContain("resource: T1 | None");
            expect(bundlePy).toContain("response: BundleEntryResponse[T2] | None");
        });
        it("generates Bundle with inherited generic params from BundleEntry", () => {
            expect(bundlePy).toContain("class Bundle(Resource, Generic[T1, T2]):");
            expect(bundlePy).toContain("entry: PyList[BundleEntry[T1, T2]] | None");
        });
        it("declares resource-constrained TypeVars", () => {
            expect(bundlePy).toContain("T1 = TypeVar('T1', bound=Resource, default=Resource)");
            expect(bundlePy).toContain("T2 = TypeVar('T2', bound=Resource, default=Resource)");
        });
        it("matches snapshot", () => {
            expect(bundlePy).toMatchSnapshot();
        });
    });

    describe("domain_resource.py", () => {
        const domainResourcePy = files["generated/hl7_fhir_r4_core/domain_resource.py"];
        it("generates DomainResource with generic type-family parameter", () => {
            expect(domainResourcePy).toContain("class DomainResource(Resource, Generic[T]):");
            expect(domainResourcePy).toContain("contained: PyList[T] | None");
        });
    });

    describe("patient.py", () => {
        const patientPy = files["generated/hl7_fhir_r4_core/patient.py"];
        it("generates CodeableConcept fields with enum bindings", () => {
            expect(patientPy).toContain(
                'marital_status: CodeableConcept[Literal["A", "D", "I", "L", "M", "P", "S", "T", "U", "W", "UNK"] | str] | None',
            );
        });
        it("matches snapshot", () => {
            expect(patientPy).toMatchSnapshot();
        });
    });
});