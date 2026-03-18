import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { ccdaManager, mkErrorLogger, r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager, logger: mkErrorLogger() })
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(608);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
    it("generates Coding with generic parameter", async () => {
        const codingTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/Coding.ts"];
        expect(codingTs).toContain("export interface Coding<T extends string = string>");
        expect(codingTs).toContain("code?: T");
    });
    it("generates CodeableConcept with generic parameter", async () => {
        const ccTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/CodeableConcept.ts"];
        expect(ccTs).toContain("export interface CodeableConcept<T extends string = string>");
        expect(ccTs).toContain("coding?: Coding<T>[]");
    });
    it("generates BundleEntry with generic type-family parameter", async () => {
        const bundleTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/Bundle.ts"];
        expect(bundleTs).toContain("export interface BundleEntry<T extends Resource = Resource>");
        expect(bundleTs).toContain("resource?: T");
    });
    it("generates BundleEntryResponse with generic type-family parameter", async () => {
        const bundleTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/Bundle.ts"];
        expect(bundleTs).toContain("export interface BundleEntryResponse<T extends Resource = Resource>");
        expect(bundleTs).toContain("outcome?: T");
    });
    it("generates DomainResource with generic type-family parameter", async () => {
        const domainResourceTs = result.filesGenerated["generated/types/hl7-fhir-r4-core/DomainResource.ts"];
        expect(domainResourceTs).toContain("export interface DomainResource<T extends Resource = Resource>");
        expect(domainResourceTs).toContain("contained?: T[]");
    });
});

describe("TypeScript CDA with Logical Model Promotion to Resource", async () => {
    const result = await new APIBuilder({ register: ccdaManager, logger: mkErrorLogger() })
        .typeSchema({
            promoteLogical: {
                "hl7.cda.uv.core": ["http://hl7.org/cda/stds/core/StructureDefinition/Material" as CanonicalUrl],
            },
        })
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    it("without resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/CV.ts"]).toMatchSnapshot();
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/index.ts"]).toMatchSnapshot();
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/profiles/index.ts"]).toMatchSnapshot();
    });
    it("with resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/Material.ts"]).toMatchSnapshot();
    });
});

describe("TypeScript R4 Example (with generateProfile)", async () => {
    const logger = mkErrorLogger();
    const result = await new APIBuilder({ register: r4Manager, logger })
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .generate();

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("file rewrite warnings", () => {
        const rewriteWarnings = logger
            .buffer()
            .filter((e) => e.level === "WARN" && e.message.includes("File will be rewritten"))
            .map((e) => e.message);
        expect(rewriteWarnings).toMatchSnapshot();
    });

    it("generates bodyweight profile with validate()", () => {
        expect(
            result.filesGenerated["generated/types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight.ts"],
        ).toMatchSnapshot();
    });

    it("generates bp profile with validate()", () => {
        expect(
            result.filesGenerated["generated/types/hl7-fhir-r4-core/profiles/Observation_observation_bp.ts"],
        ).toMatchSnapshot();
    });
});

describe("TypeScript US Core Example", async () => {
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
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .generate();

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("generates US Core Patient profile", () => {
        expect(
            result.filesGenerated["generated/types/hl7-fhir-us-core/profiles/Patient_USCorePatientProfile.ts"],
        ).toMatchSnapshot();
    });

    it("generates US Core Blood Pressure profile", () => {
        expect(
            result.filesGenerated[
                "generated/types/hl7-fhir-us-core/profiles/Observation_USCoreBloodPressureProfile.ts"
            ],
        ).toMatchSnapshot();
    });

    it("generates US Core Body Weight profile", () => {
        const key = "generated/types/hl7-fhir-us-core/profiles/Observation_USCoreBodyWeightProfile.ts";
        expect(result.filesGenerated[key]).toMatchSnapshot();
    });

    it("generates US Core Race extension profile", () => {
        const key = "generated/types/hl7-fhir-us-core/profiles/Extension_USCoreRaceExtension.ts";
        expect(result.filesGenerated[key]).toMatchSnapshot();
    });

    it("generates US Core profiles index", () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-us-core/profiles/index.ts"]).toMatchSnapshot();
    });
});
