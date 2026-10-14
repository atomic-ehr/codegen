import { describe, expect, it } from "bun:test";

// Golden snapshot of the two sfm profile modules whose reference targets exceed their base:
// sfm-MedicationDispense adds sfm-MedicationStatement to authorizingPrescription (base R4:
// MedicationRequest), and sfm-MedicationStatement adds itself to basedOn (base R4: CarePlan,
// MedicationRequest, ServiceRequest). Both fields are optional, so the widened targets reach
// only validate()'s validateReference lists — never a type tsc could compare with the base.
// Run `bun run examples/on-the-fly/norge-r4/generate.ts` first (the Makefile target does).

const profilesDir = `${import.meta.dir}/fhir-types/sfm-030322/profiles`;

describe("norge-r4 sfm profiles with widened reference targets", () => {
    it("MedicationDispense.authorizingPrescription", async () => {
        expect(await Bun.file(`${profilesDir}/MedicationDispense_SfmMedicationDispense.ts`).text()).toMatchSnapshot();
    });

    it("MedicationStatement.basedOn", async () => {
        expect(await Bun.file(`${profilesDir}/MedicationStatement_SfmMedicationStatement.ts`).text()).toMatchSnapshot();
    });
});
