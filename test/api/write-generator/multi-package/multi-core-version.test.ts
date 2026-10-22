import { describe, expect, it } from "bun:test";
import { ensureDependency, inPackage } from "@atomic-ehr/fhir-canonical-manager/patch";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const PATIENT = "http://hl7.org/fhir/StructureDefinition/Patient";

const RELEASES = [
    { key: "hl7.fhir.r4.core#4.0.1", name: "hl7.fhir.r4.core", version: "4.0.1", dir: "hl7-fhir-r4-core" },
    { key: "hl7.fhir.r5.core#5.0.0", name: "hl7.fhir.r5.core", version: "5.0.0", dir: "hl7-fhir-r5-core" },
    {
        key: "hl7.fhir.r6.core#6.0.0-ballot2",
        name: "hl7.fhir.r6.core",
        version: "6.0.0-ballot2",
        dir: "hl7-fhir-r6-core",
    },
] as const;

const mkBuilder = () =>
    new APIBuilder({
        logger: mkSilentLogger(),
        canonicalManager: {
            patches: {
                packageJson: [
                    inPackage("hl7.fhir.r5.core", [ensureDependency({ "hl7.terminology": "6.0.2" })]),
                    inPackage("hl7.fhir.r6.core", [ensureDependency({ "hl7.terminology": "6.0.2" })]),
                ],
            },
        },
    })
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .fromPackage("hl7.fhir.r5.core", "5.0.0")
        .fromPackage("hl7.fhir.r6.core", "6.0.0-ballot2")
        .fromPackage("hl7.terminology", "6.0.2");

describe("Multiple core releases in one build", async () => {
    const result = await mkBuilder()
        .typeSchema({ treeShake: Object.fromEntries(RELEASES.map((r) => [r.key, { [PATIENT]: {} }])) })
        .typescript({ inMemoryOnly: true, generateProfile: false })
        .generate();

    const patientOf = (dir: string) => result.filesGenerated.typescript?.[`generated/types/${dir}/Patient.ts`];
    const maritalStatusCodes = (dir: string) => {
        const line = (patientOf(dir) ?? "").split("\n").find((l) => l.includes("maritalStatus"));
        return [...(line ?? "").matchAll(/"([A-Z]+)"/g)].map((m) => m[1]);
    };

    it("should succeed", () => {
        expect(result.success).toBeTrue();
    });

    for (const { dir, version } of RELEASES) {
        it(`should emit a Patient module for ${version}`, () => {
            expect(patientOf(dir)).toBeDefined();
        });
    }

    it("should root each shake in the release its key names", () => {
        expect(patientOf("hl7-fhir-r5-core")).toContain("PatientContact");
        expect(patientOf("hl7-fhir-r6-core")).toContain("role");
        expect(patientOf("hl7-fhir-r4-core")).not.toContain("role?:");
    });

    it("should give R4 its own bundled terminology", () => {
        expect(maritalStatusCodes("hl7-fhir-r4-core")).toContain("P");
        expect(maritalStatusCodes("hl7-fhir-r4-core")).not.toContain("C");
    });

    for (const dir of ["hl7-fhir-r5-core", "hl7-fhir-r6-core"]) {
        it(`should resolve ${dir} terminology from hl7.terminology`, () => {
            expect(maritalStatusCodes(dir)).toContain("C");
        });
    }

    it("should reject a root that does not resolve in the named package", async () => {
        const unknown = mkBuilder()
            .typeSchema({ treeShake: { "hl7.fhir.r4.core#9.9.9": { [PATIENT]: {} } } })
            .typescript({ inMemoryOnly: true })
            .throwException()
            .generate();
        expect(unknown).rejects.toThrow(/does not resolve in package/);
    });
});
