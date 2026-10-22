import { describe, expect, test } from "bun:test";
import type { Dosage as DosageR4 } from "./fhir-types/hl7-fhir-r4-core/Dosage";
import type { Patient as PatientR4 } from "./fhir-types/hl7-fhir-r4-core/Patient";
import type { SampledData as SampledDataR4 } from "./fhir-types/hl7-fhir-r4-core/SampledData";
import type { Dosage as DosageR5 } from "./fhir-types/hl7-fhir-r5-core/Dosage";
import type { Patient as PatientR5 } from "./fhir-types/hl7-fhir-r5-core/Patient";
import type { SampledData as SampledDataR5 } from "./fhir-types/hl7-fhir-r5-core/SampledData";
import type { PatientContact as PatientContactR6, Patient as PatientR6 } from "./fhir-types/hl7-fhir-r6-core/Patient";

// R4 and R5 datatypes are wire-identical here, but not assignable: `Extension` inlines every
// `value[x]`, so the two R5 datatype breaks asserted below reach every type through it.
const carry = <T>(value: unknown): T => value as T;

// R4 → R5: structurally unchanged, so a field-for-field carry.
const patientR4ToR5 = (src: PatientR4): PatientR5 => ({
    ...carry<PatientR5>(src),
    resourceType: "Patient",
});

// R5 → R6: contact.relationship is superseded by contact.role.
const patientR5ToR6 = (src: PatientR5): PatientR6 => ({
    ...src,
    contact: src.contact?.map(({ relationship, ...rest }): PatientContactR6 => ({ ...rest, role: relationship })),
});

describe("demo: migrating a Patient across FHIR releases", () => {
    const r4: PatientR4 = {
        resourceType: "Patient",
        id: "pt-1",
        active: true,
        name: [{ family: "Chalmers", given: ["Peter"] }],
        gender: "male",
        birthDate: "1974-12-25",
        maritalStatus: { coding: [{ system: "http://terminology.hl7.org/CodeSystem/v3-MaritalStatus", code: "M" }] },
        communication: [{ language: { coding: [{ system: "urn:ietf:bcp:47", code: "en-GB" }] }, preferred: true }],
        contact: [
            {
                relationship: [{ coding: [{ system: "http://terminology.hl7.org/CodeSystem/v2-0131", code: "N" }] }],
                name: { family: "du Marché", given: ["Bénédicte"] },
            },
        ],
    };

    test("R4 → R5 carries the resource over unchanged", () => {
        const r5 = patientR4ToR5(r4);

        expect(r5.communication?.[0]?.language.coding?.[0]?.code).toBe("en-GB");
        expect(r5).toMatchSnapshot();
    });

    test("R5 → R6 moves contact.relationship to contact.role", () => {
        const r6 = patientR5ToR6(patientR4ToR5(r4));

        expect(r6.contact?.[0]?.relationship).toBeUndefined();
        expect(r6.contact?.[0]?.role?.[0]?.coding?.[0]?.code).toBe("N");
        expect(r6).toMatchSnapshot();
    });
});

describe("generated types across releases", () => {
    test("R4 Patient is not assignable to R5 Patient", () => {
        // @ts-expect-error R4 and R5 datatypes are distinct types, see `carry` above.
        const r5: PatientR5 = {} as PatientR4;
        expect(r5).toBeDefined();
    });

    // Pinned separately, so removing one break cannot prop up the assertion above.
    test("both R4 → R5 datatype breaks are still present", () => {
        // @ts-expect-error R5 widened Dosage.maxDosePerPeriod from 0..1 to 0..* (Ratio → Ratio[]).
        const dosage: DosageR5 = {} as DosageR4;
        // @ts-expect-error R5 replaced SampledData.period with interval + a required intervalUnit.
        const sampled: SampledDataR5 = {} as SampledDataR4;
        expect([dosage, sampled]).toBeDefined();
    });

    // R5 added "C" (common law); R4's bundled copy of the CodeSystem does not have it.
    test("each release keeps its own terminology", async () => {
        const maritalStatusOf = async (pkgDir: string) => {
            const src = await Bun.file(`${import.meta.dir}/fhir-types/${pkgDir}/Patient.ts`).text();
            const line = src.split("\n").find((l) => l.includes("maritalStatus"));
            return [...(line ?? "").matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
        };

        expect(await maritalStatusOf("hl7-fhir-r4-core")).toContain("P");
        expect(await maritalStatusOf("hl7-fhir-r4-core")).not.toContain("C");
        expect(await maritalStatusOf("hl7-fhir-r5-core")).toContain("C");
        expect(await maritalStatusOf("hl7-fhir-r6-core")).toContain("C");
    });

    test("R5 Patient is assignable to R6 Patient except for the renamed contact field", () => {
        const r6: PatientR6 = { resourceType: "Patient", ...({} as Omit<PatientR5, "resourceType" | "contact">) };
        expect(r6.resourceType).toBe("Patient");
    });
});
