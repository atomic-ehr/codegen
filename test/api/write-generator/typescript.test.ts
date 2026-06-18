import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { ValueSet } from "@root/fhir-types/hl7-fhir-r4-core";
import type { Register } from "@root/typeschema/register";
import { type CanonicalUrl, enrichValueSet, type PackageMeta, packageMetaToFhir } from "@root/typeschema/types";
import {
    ccdaManager,
    mkErrorLogger,
    mkR4Register,
    type PFS,
    type PVS,
    r4Manager,
    registerFs,
} from "@typeschema-test/utils";
import { applyFixedValue } from "../../../assets/api/writer-generator/typescript/profile-helpers";

const appendValueSet = (register: Register, pkg: PackageMeta, valueSet: PVS) => {
    const richValueSet = enrichValueSet(valueSet as ValueSet, pkg);
    register.resolver[packageMetaToFhir(pkg)]!.valueSets[richValueSet.url] = richValueSet;
};

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager, logger: mkErrorLogger() })
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    const files = result.filesGenerated.typescript!;

    it("generates 608 files successfully", () => {
        expect(result.success).toBeTrue();
        expect(Object.keys(files).length).toEqual(608);
    });

    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(files["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
    it("generates Coding with generic parameter", async () => {
        const codingTs = files["generated/types/hl7-fhir-r4-core/Coding.ts"];
        expect(codingTs).toContain("export interface Coding<T extends string = string>");
        expect(codingTs).toContain("code?: T");
        expect(codingTs).toMatchSnapshot();
    });
    it("generates CodeableConcept with generic parameter", async () => {
        const ccTs = files["generated/types/hl7-fhir-r4-core/CodeableConcept.ts"];
        expect(ccTs).toContain("export interface CodeableConcept<T extends string = string>");
        expect(ccTs).toContain("coding?: Coding<T>[]");
        expect(ccTs).toMatchSnapshot();
    });
    it("generates BundleEntry with generic type-family parameters", async () => {
        const bundleTs = files["generated/types/hl7-fhir-r4-core/Bundle.ts"];
        expect(bundleTs).toContain(
            "export interface BundleEntry<T1 extends Resource = Resource, T2 extends Resource = Resource>",
        );
        expect(bundleTs).toContain("resource?: T1");
        expect(bundleTs).toContain("response?: BundleEntryResponse<T2>");
        expect(bundleTs).toMatchSnapshot();
    });
    it("generates Bundle with inherited generic params from BundleEntry", async () => {
        const bundleTs = files["generated/types/hl7-fhir-r4-core/Bundle.ts"];
        expect(bundleTs).toContain(
            "export interface Bundle<T1 extends Resource = Resource, T2 extends Resource = Resource>",
        );
        expect(bundleTs).toContain("entry?: BundleEntry<T1, T2>[]");
        expect(bundleTs).toMatchSnapshot();
    });
    it("generates BundleEntryResponse with generic type-family parameter", async () => {
        const bundleTs = files["generated/types/hl7-fhir-r4-core/Bundle.ts"];
        expect(bundleTs).toContain("export interface BundleEntryResponse<T extends Resource = Resource>");
        expect(bundleTs).toContain("outcome?: T");
    });
    it("generates DomainResource with generic type-family parameter", async () => {
        const domainResourceTs = files["generated/types/hl7-fhir-r4-core/DomainResource.ts"];
        expect(domainResourceTs).toContain("export interface DomainResource<T extends Resource = Resource>");
        expect(domainResourceTs).toContain("contained?: T[]");
    });
});

describe("TypeScript profile fixed CodeableConcept semantics", async () => {
    const fixedSystem = "http://example.org/CodeSystem/coverage-type";
    const secondarySystem = "http://example.org/CodeSystem/hzv-contract";

    it("applies fixed CodeableConcept codings without dropping compatible secondary codings", () => {
        const resource = {
            type: {
                text: "Private coverage",
                coding: [
                    { system: fixedSystem, code: "PKV", display: "Private insurance" },
                    { system: secondarySystem, code: "AOK_BY_HZV" },
                ],
            },
        };

        applyFixedValue(resource, "type", {
            coding: [{ system: fixedSystem }],
        });

        expect(resource.type).toEqual({
            text: "Private coverage",
            coding: [
                { system: fixedSystem, code: "PKV", display: "Private insurance" },
                { system: secondarySystem, code: "AOK_BY_HZV" },
            ],
        });
    });

    it("generates apply() with fixed-value merge and skips placeholder-only enum validation", async () => {
        const register = await mkR4Register();
        const pkg = { name: "codegen.test", version: "1.0.0" };
        const placeholderValueSetUrl = "http://example.org/ValueSet/placeholder-coverage-type";
        const profileUrl = "http://example.org/StructureDefinition/fixed-coverage";
        const profile: PFS = {
            description: "Coverage profile with fixed CodeableConcept coding and placeholder-only binding",
            derivation: "constraint",
            type: "Coverage",
            name: "FixedCoverage",
            kind: "resource",
            url: profileUrl,
            base: "http://hl7.org/fhir/StructureDefinition/Coverage",
            package_meta: pkg,
            required: ["type"],
            elements: {
                type: {
                    type: "CodeableConcept",
                    binding: {
                        strength: "required",
                        valueSet: placeholderValueSetUrl,
                        bindingName: "PlaceholderCoverageType",
                    },
                    elements: {
                        coding: {
                            slicing: {
                                slices: {
                                    InsuranceType: {
                                        min: 1,
                                        match: { system: fixedSystem },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        registerFs(register, profile);
        appendValueSet(register, pkg, {
            resourceType: "ValueSet",
            id: "placeholder-coverage-type",
            name: "PlaceholderCoverageType",
            url: placeholderValueSetUrl,
            status: "active",
            expansion: {
                timestamp: "2026-01-01T00:00:00Z",
                contains: [{ system: "http://terminology.hl7.org/CodeSystem/v3-NullFlavor", code: "UNK" }],
            },
        });

        const result = await new APIBuilder({ register, logger: mkErrorLogger() })
            .typescript({
                inMemoryOnly: true,
                withDebugComment: false,
                generateProfile: true,
                openResourceTypeSet: false,
            })
            .generate();

        expect(result.success).toBeTrue();
        const files = result.filesGenerated.typescript!;
        const profileFile = Object.entries(files).find(([path]) => path.endsWith("profiles/Coverage_FixedCoverage.ts"));
        expect(profileFile).toBeDefined();
        const profileTs = profileFile![1];

        expect(profileTs).toContain(`applyFixedValue(resource, "type", {"coding":[{"system":"${fixedSystem}"}]})`);
        expect(profileTs).not.toContain("Object.assign(resource");
        expect(profileTs).not.toContain(`validateEnum(res, profileName, "type", ["UNK"])`);
        expect(profileTs).not.toContain(`CodeableConcept<("UNK")>`);
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
    const files = result.filesGenerated.typescript!;

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("without resourceType", async () => {
        expect(files["generated/types/hl7-cda-uv-core/CV.ts"]).toMatchSnapshot();
        expect(files["generated/types/hl7-cda-uv-core/index.ts"]).toMatchSnapshot();
        expect(files["generated/types/hl7-cda-uv-core/profiles/index.ts"]).toMatchSnapshot();
    });
    it("with resourceType", async () => {
        expect(files["generated/types/hl7-cda-uv-core/Material.ts"]).toMatchSnapshot();
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

    const files = result.filesGenerated.typescript!;

    it("generates bodyweight profile with validate()", () => {
        expect(
            files["generated/types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight.ts"],
        ).toMatchSnapshot();
    });

    it("generates bp profile with validate()", () => {
        expect(files["generated/types/hl7-fhir-r4-core/profiles/Observation_observation_bp.ts"]).toMatchSnapshot();
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

    const files = result.filesGenerated.typescript!;

    it("generates US Core Patient profile", () => {
        expect(files["generated/types/hl7-fhir-us-core/profiles/Patient_USCorePatientProfile.ts"]).toMatchSnapshot();
    });

    it("generates US Core Blood Pressure profile", () => {
        expect(
            files["generated/types/hl7-fhir-us-core/profiles/Observation_USCoreBloodPressureProfile.ts"],
        ).toMatchSnapshot();
    });

    it("generates US Core Body Weight profile", () => {
        const key = "generated/types/hl7-fhir-us-core/profiles/Observation_USCoreBodyWeightProfile.ts";
        expect(files[key]).toMatchSnapshot();
    });

    it("generates US Core Race extension profile", () => {
        const key = "generated/types/hl7-fhir-us-core/profiles/Extension_USCoreRaceExtension.ts";
        expect(files[key]).toMatchSnapshot();
    });

    it("generates US Core profiles index", () => {
        expect(files["generated/types/hl7-fhir-us-core/profiles/index.ts"]).toMatchSnapshot();
    });
});
