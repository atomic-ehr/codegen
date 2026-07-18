import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { mkSilentLogger } from "@typeschema-test/utils";

const LOCAL_PACKAGE_PATH = Path.join(
    __dirname,
    "../../../../examples/typescript-custom-packages/structure-definitions",
);

/**
 * Tests for local package folder functionality with multi-package dependency resolution.
 * */
describe("Local Package Folder - Multi-Package Generation", async () => {
    const localPackageConfig = {
        package: { name: "example.folder.structures", version: "0.0.1" },
        path: LOCAL_PACKAGE_PATH,
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    };

    const treeShakeConfig = {
        "example.folder.structures": {
            "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
        },
        "hl7.fhir.r4.core": {
            "http://hl7.org/fhir/StructureDefinition/Patient": {},
        },
    };

    const promoteLogicalConfig = {
        "example.folder.structures": ["http://example.org/fhir/StructureDefinition/ExampleNotebook" as CanonicalUrl],
    };

    describe("TypeScript Generation", async () => {
        const result = await new APIBuilder({ logger: mkSilentLogger() })
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({ treeShake: treeShakeConfig })
            .typescript({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleNotebook type in custom package folder", () => {
            const notebookFile =
                result.filesGenerated.typescript!["generated/types/example-folder-structures/ExampleNotebook.ts"];
            expect(notebookFile).toBeDefined();
            expect(notebookFile).toMatchSnapshot();
        });

        it("should resolve R4 dependencies (Identifier, Reference, Coding)", () => {
            const notebookFile =
                result.filesGenerated.typescript!["generated/types/example-folder-structures/ExampleNotebook.ts"];
            expect(notebookFile).toContain("Identifier");
            expect(notebookFile).toContain("Reference");
            expect(notebookFile).toContain("Coding");
        });

        it("should generate R4 dependency types", () => {
            expect(result.filesGenerated.typescript!["generated/types/hl7-fhir-r4-core/Identifier.ts"]).toBeDefined();
            expect(result.filesGenerated.typescript!["generated/types/hl7-fhir-r4-core/Reference.ts"]).toBeDefined();
            expect(result.filesGenerated.typescript!["generated/types/hl7-fhir-r4-core/Coding.ts"]).toBeDefined();
        });
    });

    describe("TypeScript Generation with type-discriminated profile", async () => {
        const result = await new APIBuilder({ logger: mkSilentLogger() })
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({
                treeShake: {
                    "example.folder.structures": {
                        "http://example.org/fhir/StructureDefinition/ExampleTypedBundle": {},
                    },
                    "hl7.fhir.r4.core": {
                        "http://hl7.org/fhir/StructureDefinition/Patient": {},
                        "http://hl7.org/fhir/StructureDefinition/Organization": {},
                    },
                },
            })
            .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleTypedBundle profile with type-discriminated slices", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Bundle_ExampleTypedBundle.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).toMatchSnapshot();
        });
    });

    describe("TypeScript Generation with open type-sliced choice", async () => {
        const result = await new APIBuilder({ logger: mkSilentLogger() })
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({
                treeShake: {
                    "example.folder.structures": {
                        "http://example.org/fhir/StructureDefinition/ExampleOpenChoiceCondition": {},
                        "http://example.org/fhir/StructureDefinition/ExampleClosedChoiceCondition": {},
                        "http://example.org/fhir/StructureDefinition/ExampleInheritedOpenChoiceCondition": {},
                        "http://example.org/fhir/StructureDefinition/ExampleOpenEffectiveObservation": {},
                        "http://example.org/fhir/StructureDefinition/ExampleOpenMultiTypeObservation": {},
                        "http://example.org/fhir/StructureDefinition/ExampleOpenPrimitiveValueObservation": {},
                        "http://example.org/fhir/StructureDefinition/ExampleRootRestrictedChoiceCondition": {},
                    },
                    "hl7.fhir.r4.core": {
                        "http://hl7.org/fhir/StructureDefinition/Condition": {},
                    },
                },
            })
            .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
            .generate();

        it("should keep every open-sliced choice variant permitted", () => {
            expect(result.success).toBeTrue();

            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Condition_ExampleOpenChoiceCondition.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetDateTime")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetPeriod")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetRange")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetString")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetAge")');
        });

        it("should exclude every base variant not allowed by closed slicing", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Condition_ExampleClosedChoiceCondition.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetDateTime")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetPeriod")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetRange")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetString")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetAge")');
        });

        it("should inherit open slicing when a leaf only declares a typed slice", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Condition_ExampleInheritedOpenChoiceCondition.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetDateTime")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetPeriod")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetRange")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetString")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetAge")');
        });

        it("should not widen an inherited choice restriction through open slicing", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Observation_ExampleOpenEffectiveObservation.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "effectiveDateTime")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "effectivePeriod")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "effectiveTiming")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "effectiveInstant")');
        });

        // Guards codegen-y24: the differential type list is the effective ceiling even when only one slice is materialized.
        it("fixes codegen-y24 for explicit open multi-type ceilings", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Observation_ExampleOpenMultiTypeObservation.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "effectiveDateTime")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "effectivePeriod")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "effectiveTiming")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "effectiveInstant")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "valueQuantity")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "valueCodeableConcept")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "valueBoolean")');
        });

        // Guards codegen-y24 for a primitive type that has no separate typed slice in the differential.
        it("fixes codegen-y24 for explicit open primitive choice types", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Observation_ExampleOpenPrimitiveValueObservation.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "valueBoolean")');
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "valueCodeableConcept")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "valueQuantity")');
        });

        it("should apply a child root type restriction under inherited open slicing", () => {
            const profileFile =
                result.filesGenerated.typescript![
                    "generated/types/example-folder-structures/profiles/Condition_ExampleRootRestrictedChoiceCondition.ts"
                ];
            expect(profileFile).toBeDefined();
            expect(profileFile).not.toContain('validateExcluded(res, profileName, "onsetDateTime")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetPeriod")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetRange")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetString")');
            expect(profileFile).toContain('validateExcluded(res, profileName, "onsetAge")');
        });
    });

    describe("Python Generation", async () => {
        const result = await new APIBuilder({ logger: mkSilentLogger() })
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
            .python({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleNotebook type (promoted logical)", () => {
            const notebook = result.filesGenerated.python!["generated/example_folder_structures/example_notebook.py"];
            expect(notebook).toBeDefined();
            expect(notebook).toMatchSnapshot();
        });

        it("should generate R4 dependency types", () => {
            // Python generator resolves R4 dependencies from tree-shaking
            expect(result.filesGenerated.python!["generated/hl7_fhir_r4_core/__init__.py"]).toBeDefined();
            expect(result.filesGenerated.python!["generated/hl7_fhir_r4_core/domain_resource.py"]).toBeDefined();
        });

        it("should generate base types for dependencies", () => {
            const domainResource = result.filesGenerated.python!["generated/hl7_fhir_r4_core/domain_resource.py"];
            expect(domainResource).toBeDefined();
            expect(domainResource).toMatchSnapshot();
        });

        it("should generate Patient resource", () => {
            const patient = result.filesGenerated.python!["generated/hl7_fhir_r4_core/patient.py"];
            expect(patient).toBeDefined();
            expect(patient).toMatchSnapshot();
        });
    });

    describe("C# Generation", async () => {
        const result = await new APIBuilder({ logger: mkSilentLogger() })
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
            .csharp({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleNotebook type (promoted logical)", () => {
            const notebook =
                result.filesGenerated.csharp!["generated/types/ExampleFolderStructures/ExampleNotebook.cs"];
            expect(notebook).toBeDefined();
            expect(notebook).toMatchSnapshot();
        });

        it("should generate R4 dependency types", () => {
            // C# generator resolves R4 dependencies from tree-shaking
            expect(result.filesGenerated.csharp!["generated/types/Hl7FhirR4Core/DomainResource.cs"]).toBeDefined();
            expect(result.filesGenerated.csharp!["generated/types/Hl7FhirR4Core/Resource.cs"]).toBeDefined();
        });

        it("should generate DomainResource base class", () => {
            const domainResource = result.filesGenerated.csharp!["generated/types/Hl7FhirR4Core/DomainResource.cs"];
            expect(domainResource).toBeDefined();
            expect(domainResource).toMatchSnapshot();
        });

        it("should generate Resource base class", () => {
            const resource = result.filesGenerated.csharp!["generated/types/Hl7FhirR4Core/Resource.cs"];
            expect(resource).toBeDefined();
            expect(resource).toMatchSnapshot();
        });

        it("should generate Patient resource", () => {
            const patient = result.filesGenerated.csharp!["generated/types/Hl7FhirR4Core/Patient.cs"];
            expect(patient).toBeDefined();
            expect(patient).toMatchSnapshot();
        });
    });
});
