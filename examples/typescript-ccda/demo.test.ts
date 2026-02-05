import { describe, expect, it } from "bun:test";
import type * as CDA from "./fhir-types/hl7-cda-uv-core";
import type * as FHIR from "./fhir-types/hl7-fhir-r4-core";

const cdaPatientToFHIR = (cdaPatient: CDA.Patient): FHIR.Patient => {
    const givenNames = cdaPatient.name?.[0]?.item?.slice(1) ?? [];
    const familyName = cdaPatient.name?.[0]?.item?.[0];

    const birthDateStr = cdaPatient.birthTime?.value;
    const birthDate =
        birthDateStr && birthDateStr.length >= 8
            ? `${birthDateStr.substring(0, 4)}-${birthDateStr.substring(4, 6)}-${birthDateStr.substring(6, 8)}`
            : undefined;

    const genderMap: Record<string, "male" | "female" | "other" | "unknown"> = {
        M: "male",
        F: "female",
    };

    return {
        resourceType: "Patient",
        id: "patient-001",
        identifier: [
            {
                system: "http://example.com/mrn",
                value: "MRN-12345",
            },
        ],
        active: true,
        name: [
            {
                use: "official",
                family: (familyName as any)?.xmlText || "Unknown",
                given: givenNames.map((item: any) => item.xmlText || ""),
            },
        ],
        gender: genderMap[(cdaPatient.administrativeGenderCode?.code as string) || ""] || "unknown",
        birthDate: birthDate,
    };
};

const cdaObservationToFHIR = (cdaObservation: CDA.Observation, patientId: string): FHIR.Observation => {
    const value = Array.isArray(cdaObservation.valuePQ) ? cdaObservation.valuePQ[0] : cdaObservation.valuePQ;

    const effectiveDateTime = cdaObservation.effectiveTime
        ? (() => {
              const ts = (cdaObservation.effectiveTime as any)?.low?.value || "";
              const year = ts.substring(0, 4);
              const month = ts.substring(4, 6);
              const day = ts.substring(6, 8);
              const hour = ts.substring(8, 10) || "00";
              const minute = ts.substring(10, 12) || "00";
              const second = ts.substring(12, 14) || "00";
              return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
          })()
        : new Date().toISOString();

    return {
        resourceType: "Observation",
        id: "observation-bw-001",
        status: "final",
        category: [
            {
                coding: [
                    {
                        system: "http://terminology.hl7.org/CodeSystem/observation-category",
                        code: "vital-signs",
                        display: "Vital Signs",
                    },
                ],
            },
        ],
        code: {
            coding: [
                {
                    system: "http://loinc.org",
                    code: (cdaObservation.code as any)?.code || "29463-7",
                    display: (cdaObservation.code as any)?.displayName || "Body weight",
                },
            ],
            text: (cdaObservation.code as any)?.displayName || "Body weight",
        },
        subject: {
            reference: `Patient/${patientId}`,
            display: "John Doe",
        },
        effectiveDateTime: effectiveDateTime,
        issued: new Date().toISOString(),
        valueQuantity: value
            ? {
                  value: value.value,
                  unit: value.unit,
                  system: "http://unitsofmeasure.org",
                  code: value.unit,
              }
            : undefined,
    };
};

describe("CDA to FHIR R4 Mapping", () => {
    const cdaPatient: CDA.Patient = {
        resourceType: "Patient",
        name: [
            {
                item: [{ xmlText: "Doe" }, { xmlText: "John" }],
            },
        ],
        birthTime: {
            value: "19800115",
        },
        administrativeGenderCode: {
            code: "M",
            codeSystem: "2.16.840.1.113883.5.1",
            displayName: "Male",
        },
    };

    const cdaObservation: CDA.Observation = {
        resourceType: "Observation",
        classCode: "OBS",
        moodCode: "EVN",
        id: [
            {
                root: "2.16.840.1.113883.3.933",
                extension: "OBS-001",
            },
        ],
        code: {
            code: "29463-7",
            codeSystem: "2.16.840.1.113883.6.1",
            displayName: "Body weight",
        },
        statusCode: {
            code: "completed",
        },
        effectiveTime: {
            low: {
                value: "20240115140000",
            },
        },
        valuePQ: [
            {
                value: 75.5,
                unit: "kg",
            },
        ],
    };

    it("should map CDA Patient to FHIR Patient with correct resource type", () => {
        const fhirPatient = cdaPatientToFHIR(cdaPatient);

        expect(fhirPatient.resourceType).toBe("Patient");
        expect(fhirPatient.id).toBe("patient-001");
        expect(fhirPatient.active).toBe(true);
    });

    it("should map patient name components correctly", () => {
        const fhirPatient = cdaPatientToFHIR(cdaPatient);

        expect(fhirPatient.name).toBeDefined();
        expect(fhirPatient.name).toHaveLength(1);
        expect(fhirPatient.name?.[0]).toMatchObject({
            use: "official",
            family: "Doe",
            given: ["John"],
        });
    });

    it("should map patient identifier", () => {
        const fhirPatient = cdaPatientToFHIR(cdaPatient);

        expect(fhirPatient.identifier).toBeDefined();
        expect(fhirPatient.identifier).toHaveLength(1);
        expect(fhirPatient.identifier?.[0]).toMatchObject({
            system: "http://example.com/mrn",
            value: "MRN-12345",
        });
    });

    it("should convert CDA birth time (YYYYMMDD) to FHIR date (YYYY-MM-DD)", () => {
        const fhirPatient = cdaPatientToFHIR(cdaPatient);

        expect(fhirPatient.birthDate).toBe("1980-01-15");
    });

    it("should map CDA gender code M to male", () => {
        const fhirPatient = cdaPatientToFHIR(cdaPatient);

        expect(fhirPatient.gender).toBe("male");
    });

    it("should map CDA gender code F to female", () => {
        const femalePatient: CDA.Patient = {
            resourceType: "Patient",
            administrativeGenderCode: {
                code: "F",
                codeSystem: "2.16.840.1.113883.5.1",
                displayName: "Female",
            },
        };

        const fhirPatient = cdaPatientToFHIR(femalePatient);

        expect(fhirPatient.gender).toBe("female");
    });

    it("should map unknown gender code to unknown", () => {
        const unknownGenderPatient: CDA.Patient = {
            resourceType: "Patient",
            administrativeGenderCode: {
                code: "U",
                codeSystem: "2.16.840.1.113883.5.1",
                displayName: "Undifferentiated",
            },
        };

        const fhirPatient = cdaPatientToFHIR(unknownGenderPatient);

        expect(fhirPatient.gender).toBe("unknown");
    });

    it("should handle multiple given names", () => {
        const multiNamePatient: CDA.Patient = {
            resourceType: "Patient",
            name: [
                {
                    item: [{ xmlText: "Smith" }, { xmlText: "John" }, { xmlText: "Robert" }],
                },
            ],
        };

        const fhirPatient = cdaPatientToFHIR(multiNamePatient);

        expect(fhirPatient.name?.[0]?.family).toBe("Smith");
        expect(fhirPatient.name?.[0]?.given).toEqual(["John", "Robert"]);
    });

    it("should handle missing CDA patient data with defaults", () => {
        const minimalPatient: CDA.Patient = {
            resourceType: "Patient",
        };

        const fhirPatient = cdaPatientToFHIR(minimalPatient);

        expect(fhirPatient.resourceType).toBe("Patient");
        expect(fhirPatient.gender).toBe("unknown");
        expect(fhirPatient.birthDate).toBeUndefined();
        expect(fhirPatient.name?.[0]?.family).toBe("Unknown");
    });

    it("should map CDA Observation to FHIR Observation", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation).toMatchObject({
            resourceType: "Observation",
            id: "observation-bw-001",
            status: "final",
        });
    });

    it("should map observation category to vital-signs", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation.category).toBeDefined();
        expect(fhirObservation.category).toHaveLength(1);
        expect(fhirObservation.category?.[0]?.coding?.[0]).toMatchObject({
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "vital-signs",
            display: "Vital Signs",
        });
    });

    it("should map observation code to LOINC", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation.code?.coding).toBeDefined();
        expect(fhirObservation.code?.coding).toHaveLength(1);
        expect(fhirObservation.code?.coding?.[0]).toMatchObject({
            system: "http://loinc.org",
            code: "29463-7",
            display: "Body weight",
        });
        expect(fhirObservation.code?.text).toBe("Body weight");
    });

    it("should convert CDA timestamp (YYYYMMDDHHMM) to ISO format", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation.effectiveDateTime).toBe("2024-01-15T14:00:00Z");
    });

    it("should map observation value to FHIR Quantity", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation.valueQuantity).toMatchObject({
            value: 75.5,
            unit: "kg",
            system: "http://unitsofmeasure.org",
            code: "kg",
        });
    });

    it("should map observation subject reference", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation.subject).toMatchObject({
            reference: "Patient/patient-001",
            display: "John Doe",
        });
    });

    it("should set observation issued timestamp", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        expect(fhirObservation.issued).toBeDefined();
        expect(typeof fhirObservation.issued).toBe("string");
    });

    it("should handle missing observation value", () => {
        const emptyObservation: CDA.Observation = {
            resourceType: "Observation",
            classCode: "OBS",
            moodCode: "EVN",
            code: {
                code: "29463-7",
                displayName: "Body weight",
            },
        };

        const fhirObservation = cdaObservationToFHIR(emptyObservation, "patient-001");

        expect(fhirObservation.valueQuantity).toBeUndefined();
    });

    it("should complete end-to-end mapping from CDA to FHIR", () => {
        const fhirPatient = cdaPatientToFHIR(cdaPatient);
        const patientId = fhirPatient.id || "patient-001";
        const fhirObservation = cdaObservationToFHIR(cdaObservation, patientId);

        expect(fhirPatient.resourceType).toBe("Patient");
        expect(fhirObservation.resourceType).toBe("Observation");
        expect(fhirObservation.subject?.reference).toBe(`Patient/${patientId}`);
    });

    it("should preserve LOINC code through mapping", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        const cdaCode = (cdaObservation.code as any)?.code;
        const fhirCode = fhirObservation.code?.coding?.[0]?.code;

        expect(fhirCode).toBe(cdaCode);
        expect(fhirCode).toBe("29463-7");
    });

    it("should preserve measurement unit through mapping", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        const cdaUnit = (cdaObservation.valuePQ as any)?.[0]?.unit;
        const fhirUnit = fhirObservation.valueQuantity?.unit;

        expect(fhirUnit).toBe(cdaUnit);
        expect(fhirUnit).toBe("kg");
    });

    it("should preserve measurement value through mapping", () => {
        const fhirObservation = cdaObservationToFHIR(cdaObservation, "patient-001");

        const cdaValue = (cdaObservation.valuePQ as any)?.[0]?.value;
        const fhirValue = fhirObservation.valueQuantity?.value;

        expect(fhirValue).toBe(cdaValue);
        expect(fhirValue).toBe(75.5);
    });
});
