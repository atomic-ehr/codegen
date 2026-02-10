import { describe, expect, it } from "bun:test";
import type * as CCDA from "./fhir-types/hl7-cda-us-ccda";
import { MedicationActivityProfile } from "./fhir-types/hl7-cda-us-ccda";
import type * as CDA from "./fhir-types/hl7-cda-uv-core";
import type * as FHIR from "./fhir-types/hl7-fhir-r4-core";
import type { MedicationStatement } from "./fhir-types/hl7-fhir-r4-examples";

function medicationStatementToMedicationActivity(stat: FHIR.MedicationStatement): MedicationActivityProfile {
    const base: CDA.SubstanceAdministration = {
        resourceType: "SubstanceAdministration",
        classCode: "SBADM",
        moodCode: "INT",
        id: [{ root: stat.id }],
        statusCode: {
            code: (
                {
                    active: "active",
                    completed: "completed",
                    "entered-in-error": "suspended",
                    intended: "active",
                    stopped: "aborted",
                    "on-hold": "suspended",
                    "not-taken": "aborted",
                } as Record<string, string>
            )[stat.status],
        },
        consumable: {
            manufacturedMaterial: {
                code: stat.medicationCodeableConcept?.coding?.[0]?.code,
                codeSystem: stat.medicationCodeableConcept?.coding?.[0]?.system,
            } as CDA.CD,
        } as any,
        precondition: [
            {
                resourceType: "Precondition",
                typeCode: "PRCN",
                criterion: {
                    resourceType: "Criterion",
                    nullFlavor: "NI",
                },
            },
        ],
        entryRelationship: [
            {
                resourceType: "EntryRelationship",
                typeCode: "COMP",
                observation: {
                    resourceType: "Observation",
                    classCode: "OBS",
                    moodCode: "EVN",
                    code: {
                        code: "TODO",
                        codeSystem: "TODO",
                    } as CDA.CD,
                },
            },
        ],
    };
    const result: MedicationActivityProfile = new MedicationActivityProfile(base);
    return result;
}

describe("FHIR to CCDA conversion", () => {
    const medicationStatement: FHIR.MedicationStatement = {
        resourceType: "MedicationStatement",
        status: "active",
        subject: { reference: "Patient/patient" },
        medicationCodeableConcept: {
            coding: [
                {
                    system: "http://www.nlm.nih.gov/research/umls/rxnorm",
                    code: "901813",
                    display: "Diphenhydramine Hydrochloride 25 mg",
                },
            ],
        },
    };
    const activity: MedicationActivityProfile = medicationStatementToMedicationActivity(medicationStatement);
    it("should retain SubstanceAdministration constants", () => {
        expect(activity.toResource().resourceType).toBe("SubstanceAdministration");
        expect(activity.toResource().classCode).toBe("SBADM");
        expect(activity.toResource().moodCode).toBe("INT");
        expect((activity.toResource().entryRelationship as any)?.[0].typeCode).toBe("COMP");
        expect((activity.toResource().entryRelationship as any)?.[0].observation.classCode).toBe("OBS");
        expect((activity.toResource().entryRelationship as any)?.[0].observation.moodCode).toBe("EVN");
    });
    it("should map status correctly", () => {
        expect(activity.toResource().statusCode?.code).toBe("active");
        const differentStatus = medicationStatementToMedicationActivity({
            ...medicationStatement,
            status: "entered-in-error",
        });
        expect(differentStatus.toResource().statusCode?.code).toBe("suspended");
    });
    it("should map medication code correctly", () => {
        expect((activity.toResource().consumable as any).manufacturedMaterial.code).toBe(
            medicationStatement.medicationCodeableConcept?.coding?.[0]?.code,
        );
        expect((activity.toResource().consumable as any).manufacturedMaterial.codeSystem).toBe(
            medicationStatement.medicationCodeableConcept?.coding?.[0]?.system,
        );
    });
});
