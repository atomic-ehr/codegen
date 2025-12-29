import { describe, expect, it } from "bun:test";
import assert from "node:assert";
import { registerFromPackageMetas } from "@root/typeschema/register";
import {
    packageTreeShakeReadme,
    rootTreeShakeReadme,
    treeShake,
    treeShakeTypeSchema,
} from "@root/typeschema/tree-shake";
import type { CanonicalUrl, RegularTypeSchema } from "@root/typeschema/types";
import { mkIndex, mkR4Register, r4Manager, r4Package, r5Package, resolveTs } from "@typeschema-test/utils";

describe("treeShake specific TypeSchema", async () => {
    const manager = await registerFromPackageMetas([r4Package, r5Package], {
        fallbackPackageForNameResolution: r4Package,
    });
    const tsIndex = await mkIndex(manager);
    it("tree shake report should be empty without treeshaking", () => {
        expect(tsIndex.treeShakeReport()).toBeUndefined();
    });
    describe("Only Bundle & Operation Outcome without extensions", () => {
        const shaked = treeShake(
            tsIndex,
            {
                "hl7.fhir.r4.core": {
                    "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                    "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
                    "http://hl7.org/fhir/StructureDefinition/DomainResource": {
                        ignoreFields: ["extension", "modifierExtension"],
                    },
                    "http://hl7.org/fhir/StructureDefinition/BackboneElement": {
                        ignoreFields: ["modifierExtension"],
                    },
                    "http://hl7.org/fhir/StructureDefinition/Element": {
                        ignoreFields: ["extension"],
                    },
                },
            },
            r4Manager.resolutionTree(),
        );

        const report = shaked.treeShakeReport();
        assert(report);

        it("check treeshake report", () => {
            expect(report).toBeDefined();
            expect(report.skippedPackages).toMatchObject(["hl7.fhir.r5.core"]);
            expect(report.packages).toMatchSnapshot();
        });
        it("root tree shake readme", () => {
            expect(rootTreeShakeReadme(report)).toMatchSnapshot();
        });
        it("package tree shake readme", () => {
            expect(packageTreeShakeReadme(report, "hl7.fhir.r4.core")).toMatchSnapshot();
        });
        it("check actually generated tree", () => {
            expect(shaked.entityTree()).toMatchSnapshot();
        });
    });
});

describe("treeShake specific TypeSchema", async () => {
    const r4 = await mkR4Register();
    const patientTss = await resolveTs(
        r4,
        r4Package,
        "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl,
    );
    const patientOrigin = patientTss[0] as RegularTypeSchema;
    assert(patientOrigin !== undefined);

    it("Original Patient", () => {
        expect(JSON.stringify(patientOrigin, null, 2)).toMatchSnapshot();
    });

    it("No rule -- no change", () => {
        const patient = treeShakeTypeSchema(patientOrigin, {});
        expect(JSON.stringify(patient, null, 2)).toBe(JSON.stringify(patientOrigin, null, 2));
    });

    it("Select and Ignore fields should be mutually exclusive", () => {
        expect(() => {
            treeShakeTypeSchema(patientOrigin, {
                ignoreFields: ["gender", "link", "active", "address", "birthDate"],
                selectFields: ["name", "telecom", "gender", "birthDate"],
            });
        }).toThrowError("Cannot use both ignoreFields and selectFields in the same rule");
    });

    describe("ignoreFields", async () => {
        it("regular field", () => {
            const patient = treeShakeTypeSchema(patientOrigin, {
                ignoreFields: ["gender"],
            }) as RegularTypeSchema;
            expect(patientOrigin.fields?.gender).toBeDefined();
            expect(patient.fields?.gender).toBeUndefined();
            expect(JSON.stringify(patient, null, 2)).toMatchSnapshot();
        });

        describe("polimorphic field", () => {
            expect(patientOrigin.fields?.multipleBirth).toMatchObject({
                choices: ["multipleBirthBoolean", "multipleBirthInteger"],
            });
            expect(patientOrigin.fields?.multipleBirthBoolean).toMatchObject({
                type: { name: "boolean" },
            });
            expect(patientOrigin.fields?.multipleBirthInteger).toMatchObject({
                type: { name: "integer" },
            });

            it("choice declaration", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    ignoreFields: ["multipleBirth"],
                }) as RegularTypeSchema;
                expect(patient.fields?.multipleBirth).toBeUndefined();
                expect(patient.fields?.multipleBirthBoolean).toBeUndefined();
                expect(patient.fields?.multipleBirthInteger).toBeUndefined();
            });

            it("choice instance", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    ignoreFields: ["multipleBirthInteger"],
                }) as RegularTypeSchema;
                expect(patient.fields?.multipleBirth).toMatchObject({
                    choices: ["multipleBirthBoolean"],
                });
                expect(patient.fields?.multipleBirthBoolean).toMatchObject({
                    type: { name: "boolean" },
                });
                expect(patient.fields?.multipleBirthInteger).toBeUndefined();
            });
            it("all choice instance", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    ignoreFields: ["multipleBirthBoolean", "multipleBirthInteger"],
                }) as RegularTypeSchema;
                expect(patient.fields?.multipleBirth).toBeUndefined();
                expect(patient.fields?.multipleBirthBoolean).toBeUndefined();
                expect(patient.fields?.multipleBirthInteger).toBeUndefined();
            });
        });

        describe("edge cases", () => {
            it("non-existent field", () => {
                expect(() => {
                    treeShakeTypeSchema(patientOrigin, {
                        ignoreFields: ["nonExistentField"],
                    });
                }).toThrowError("Field nonExistentField not found");
            });

            it("empty ignoreFields array", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    ignoreFields: [],
                }) as RegularTypeSchema;
                expect(JSON.stringify(patient, null, 2)).toBe(JSON.stringify(patientOrigin, null, 2));
            });
        });
    });

    describe("selectFields", async () => {
        it("regular field", () => {
            const patient = treeShakeTypeSchema(patientOrigin, {
                selectFields: ["gender"],
            }) as RegularTypeSchema;
            expect(patient.fields?.gender).toBeDefined();
            expect(patient.fields?.name).toBeUndefined();
            expect(patient.fields?.birthDate).toBeUndefined();
            expect(patient.fields?.address).toBeUndefined();
            expect(JSON.stringify(patient, null, 2)).toMatchSnapshot();
        });

        it("multiple regular fields", () => {
            const patient = treeShakeTypeSchema(patientOrigin, {
                selectFields: ["gender", "birthDate", "active"],
            }) as RegularTypeSchema;
            expect(patient.fields?.gender).toBeDefined();
            expect(patient.fields?.birthDate).toBeDefined();
            expect(patient.fields?.active).toBeDefined();
            expect(patient.fields?.name).toBeUndefined();
            expect(patient.fields?.address).toBeUndefined();
            expect(patient.fields?.telecom).toBeUndefined();
            expect(JSON.stringify(patient, null, 2)).toMatchSnapshot();
        });

        describe("polymorphic field", () => {
            expect(patientOrigin.fields?.multipleBirth).toMatchObject({
                choices: ["multipleBirthBoolean", "multipleBirthInteger"],
            });
            expect(patientOrigin.fields?.multipleBirthBoolean).toMatchObject({
                type: { name: "boolean" },
            });
            expect(patientOrigin.fields?.multipleBirthInteger).toMatchObject({
                type: { name: "integer" },
            });

            it("choice declaration - get all polimorphic fields", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    selectFields: ["multipleBirth"],
                }) as RegularTypeSchema;

                expect(patient.fields?.multipleBirth).toMatchObject({
                    choices: ["multipleBirthBoolean", "multipleBirthInteger"],
                });
                expect(patient.fields?.multipleBirthBoolean).toMatchObject({
                    type: { name: "boolean" },
                });
                expect(patient.fields?.multipleBirthInteger).toMatchObject({
                    type: { name: "integer" },
                });
                expect(patient.fields?.gender).toBeUndefined();
                expect(patient.fields?.name).toBeUndefined();
            });

            it("choice instance", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    selectFields: ["multipleBirthBoolean"],
                }) as RegularTypeSchema;

                expect(patient.fields?.multipleBirth).toMatchObject({
                    choices: ["multipleBirthBoolean"],
                });
                expect(patient.fields?.multipleBirthBoolean).toMatchObject({
                    type: { name: "boolean" },
                });
                expect(patient.fields?.multipleBirthInteger).toBeUndefined();
                expect(patient.fields?.gender).toBeUndefined();
                expect(patient.fields?.name).toBeUndefined();
            });

            it("choice declaration & instance", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    selectFields: ["multipleBirth", "multipleBirthBoolean"],
                }) as RegularTypeSchema;

                expect(patient.fields?.multipleBirth).toMatchObject({
                    choices: ["multipleBirthBoolean"],
                });
                expect(patient.fields?.multipleBirthBoolean).toMatchObject({
                    type: { name: "boolean" },
                });
                expect(patient.fields?.multipleBirthInteger).toBeUndefined();
                expect(patient.fields?.gender).toBeUndefined();
                expect(patient.fields?.name).toBeUndefined();
            });
        });

        describe("edge cases", () => {
            it("empty selectFields array", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    selectFields: [],
                }) as RegularTypeSchema;

                expect(patient.fields).toEqual({});
            });

            it("non-existent field", () => {
                expect(() => {
                    treeShakeTypeSchema(patientOrigin, {
                        selectFields: ["nonExistentField"],
                    });
                }).toThrowError("Field nonExistentField not found");
            });
        });
    });
});
