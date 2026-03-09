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
    expect(Object.keys(result.filesGenerated).length).toEqual(153);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/hl7_fhir_r4_core/patient.py"]).toMatchSnapshot();
    });
    it("static files", async () => {
        expect(result.filesGenerated["generated/requirements.txt"]).toMatchSnapshot();
    });
    it("generates Coding with Generic[T] parameter", async () => {
        const basePy = result.filesGenerated["generated/hl7_fhir_r4_core/base.py"];
        expect(basePy).toContain("class Coding(Element, Generic[T]):");
        expect(basePy).toContain("code: T | None");
    });
    it("generates CodeableConcept with Generic[T] parameter", async () => {
        const basePy = result.filesGenerated["generated/hl7_fhir_r4_core/base.py"];
        expect(basePy).toContain("class CodeableConcept(Element, Generic[T]):");
        expect(basePy).toContain("coding: PyList[Coding[T]] | None");
    });
    it("generates CodeableConcept fields with enum bindings", async () => {
        const patientPy = result.filesGenerated["generated/hl7_fhir_r4_core/patient.py"];
        expect(patientPy).toContain(
            'marital_status: CodeableConcept[Literal["A", "D", "I", "L", "M", "P", "S", "T", "U", "W", "UNK"] | str] | None',
        );
    });
    it("generates base.py with TypeVar import and declaration", async () => {
        const basePy = result.filesGenerated["generated/hl7_fhir_r4_core/base.py"];
        expect(basePy).toContain("from typing import Generic, List as PyList, Literal");
        expect(basePy).toContain("from typing_extensions import TypeVar");
        expect(basePy).toContain("T = TypeVar('T', bound=str, default=str)");
    });
});
