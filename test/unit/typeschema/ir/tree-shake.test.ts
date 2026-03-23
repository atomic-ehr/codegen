import { describe, expect, it } from "bun:test";
import assert from "node:assert";
import {
    packageTreeShakeReadme,
    rootTreeShakeReadme,
    treeShake,
    treeShakeTypeSchema,
} from "@root/typeschema/ir/tree-shake";
import { registerFromPackageMetas } from "@root/typeschema/register";
import type {
    CanonicalUrl,
    Name,
    ProfileIdentifier,
    ProfileTypeSchema,
    SpecializationTypeSchema,
    TypeIdentifier,
} from "@root/typeschema/types";
import { mkIndex, mkR4Register, mkTestLogger, r4Package, r5Package, resolveTs } from "@typeschema-test/utils";

describe("treeShake specific TypeSchema", async () => {
    const manager = await registerFromPackageMetas([r4Package, r5Package], {});
    const tsIndex = await mkIndex(manager);
    it("tree shake report should be empty without treeshaking", () => {
        expect(tsIndex.irReport()).toEqual({});
    });
    describe("Only Bundle & Operation Outcome without extensions", () => {
        const shaked = treeShake(tsIndex, {
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
        });

        const report = shaked.irReport();

        it("check treeshake report", () => {
            expect(report).toBeDefined();
            assert(report.treeShake);
            expect(report.treeShake.skippedPackages).toMatchObject(["hl7.fhir.r5.core"]);
            expect(report.treeShake.packages).toMatchSnapshot();
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
    const logger = mkTestLogger();
    const patientTss = await resolveTs(
        r4,
        r4Package,
        "http://hl7.org/fhir/StructureDefinition/Patient" as CanonicalUrl,
        logger,
    );
    const patientOrigin = patientTss[0] as SpecializationTypeSchema;
    assert(patientOrigin !== undefined);

    it("Original Patient", () => {
        expect(JSON.stringify(patientOrigin, null, 2)).toMatchSnapshot();
    });

    it("No rule -- no change", () => {
        const patient = treeShakeTypeSchema(patientOrigin, {});
        expect(JSON.stringify(patient, null, 2)).toBe(JSON.stringify(patientOrigin, null, 2));
    });

    it("ignoreExtensions on non-profile schema is no-op", () => {
        const patient = treeShakeTypeSchema(patientOrigin, {
            ignoreExtensions: ["http://example.com/ext/race"],
        });
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
            }) as SpecializationTypeSchema;
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
                }) as SpecializationTypeSchema;
                expect(patient.fields?.multipleBirth).toBeUndefined();
                expect(patient.fields?.multipleBirthBoolean).toBeUndefined();
                expect(patient.fields?.multipleBirthInteger).toBeUndefined();
            });

            it("choice instance", () => {
                const patient = treeShakeTypeSchema(patientOrigin, {
                    ignoreFields: ["multipleBirthInteger"],
                }) as SpecializationTypeSchema;
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
                }) as SpecializationTypeSchema;
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
                }) as SpecializationTypeSchema;
                expect(JSON.stringify(patient, null, 2)).toBe(JSON.stringify(patientOrigin, null, 2));
            });
        });
    });

    describe("selectFields", async () => {
        it("regular field", () => {
            const patient = treeShakeTypeSchema(patientOrigin, {
                selectFields: ["gender"],
            }) as SpecializationTypeSchema;
            expect(patient.fields?.gender).toBeDefined();
            expect(patient.fields?.name).toBeUndefined();
            expect(patient.fields?.birthDate).toBeUndefined();
            expect(patient.fields?.address).toBeUndefined();
            expect(JSON.stringify(patient, null, 2)).toMatchSnapshot();
        });

        it("multiple regular fields", () => {
            const patient = treeShakeTypeSchema(patientOrigin, {
                selectFields: ["gender", "birthDate", "active"],
            }) as SpecializationTypeSchema;
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
                }) as SpecializationTypeSchema;

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
                }) as SpecializationTypeSchema;

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
                }) as SpecializationTypeSchema;

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
                }) as SpecializationTypeSchema;

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

describe("ignoreExtensions", () => {
    const mkDep = (url: string): TypeIdentifier => ({
        kind: "complex-type",
        name: url.split("/").pop()! as Name,
        url: url as CanonicalUrl,
        package: "test",
        version: "1.0.0",
    });

    const mkProfileId = (url: string): ProfileIdentifier => ({
        kind: "profile",
        name: url.split("/").pop()! as Name,
        url: url as CanonicalUrl,
        package: "test",
        version: "1.0.0",
    });

    const mkProfile = (): ProfileTypeSchema => ({
        identifier: mkProfileId("http://example.com/TestProfile"),
        base: mkDep("http://hl7.org/fhir/StructureDefinition/Patient"),
        extensions: [
            {
                name: "race",
                path: "Patient.extension",
                url: "http://example.com/ext/race",
                profile: mkProfileId("http://example.com/ext/race"),
                valueFieldTypes: [mkDep("http://hl7.org/fhir/StructureDefinition/Coding")],
            },
            {
                name: "ethnicity",
                path: "Patient.extension",
                url: "http://example.com/ext/ethnicity",
                profile: mkProfileId("http://example.com/ext/ethnicity"),
                valueFieldTypes: [mkDep("http://hl7.org/fhir/StructureDefinition/CodeableConcept")],
            },
            {
                name: "birthsex",
                path: "Patient.extension",
                url: "http://example.com/ext/birthsex",
                profile: mkProfileId("http://example.com/ext/birthsex"),
            },
        ],
    });

    it("removes matching extensions from profile", () => {
        const profile = mkProfile();
        const result = treeShakeTypeSchema(profile, {
            ignoreExtensions: ["http://example.com/ext/race"],
        }) as ProfileTypeSchema;
        expect(result.extensions).toHaveLength(2);
        expect(result.extensions?.find((e) => e.url === "http://example.com/ext/race")).toBeUndefined();
        expect(result.extensions?.find((e) => e.url === "http://example.com/ext/ethnicity")).toBeDefined();
        expect(result.extensions?.find((e) => e.url === "http://example.com/ext/birthsex")).toBeDefined();
    });

    it("throws error on non-existent extension URL", () => {
        const profile = mkProfile();
        expect(() => {
            treeShakeTypeSchema(profile, {
                ignoreExtensions: ["http://example.com/ext/nonexistent"],
            });
        }).toThrowError(
            "Extension http://example.com/ext/nonexistent not found in profile http://example.com/TestProfile",
        );
    });

    it("empty ignoreExtensions array is no-op", () => {
        const profile = mkProfile();
        const result = treeShakeTypeSchema(profile, {
            ignoreExtensions: [],
        }) as ProfileTypeSchema;
        expect(result.extensions).toHaveLength(3);
    });

    it("dependencies are recalculated (ignored extension deps not in output)", () => {
        const profile = mkProfile();
        const result = treeShakeTypeSchema(profile, {
            ignoreExtensions: ["http://example.com/ext/race"],
        }) as ProfileTypeSchema;
        // Coding was only a dep of the "race" extension, so it should be gone
        expect(
            result.dependencies?.find((d) => d.url === "http://hl7.org/fhir/StructureDefinition/Coding"),
        ).toBeUndefined();
        // race definition identifier should be gone
        expect(result.dependencies?.find((d) => d.url === "http://example.com/ext/race")).toBeUndefined();
        // CodeableConcept is still a dep of the "ethnicity" extension
        expect(
            result.dependencies?.find((d) => d.url === "http://hl7.org/fhir/StructureDefinition/CodeableConcept"),
        ).toBeDefined();
        // ethnicity definition identifier should still be there
        expect(result.dependencies?.find((d) => d.url === "http://example.com/ext/ethnicity")).toBeDefined();
        // Patient base dep should still be there
        expect(
            result.dependencies?.find((d) => d.url === "http://hl7.org/fhir/StructureDefinition/Patient"),
        ).toBeDefined();
    });

    it("removing all extensions sets extensions to undefined", () => {
        const profile = mkProfile();
        const result = treeShakeTypeSchema(profile, {
            ignoreExtensions: [
                "http://example.com/ext/race",
                "http://example.com/ext/ethnicity",
                "http://example.com/ext/birthsex",
            ],
        }) as ProfileTypeSchema;
        expect(result.extensions).toBeUndefined();
    });
});
