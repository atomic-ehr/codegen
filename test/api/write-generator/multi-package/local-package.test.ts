import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";

const LOCAL_PACKAGE_PATH = Path.join(__dirname, "../../../assets/local-package/structure-definitions");

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
        "example.folder.structures": [
            "http://example.org/fhir/StructureDefinition/ExampleNotebook" as CanonicalUrl,
        ],
    };

    describe("TypeScript Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({ treeShake: treeShakeConfig })
            .typescript({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleNotebook type in custom package folder", () => {
            const notebookFile = result.filesGenerated["generated/types/example-folder-structures/ExampleNotebook.ts"];
            expect(notebookFile).toBeDefined();
            expect(notebookFile).toMatchSnapshot();
        });

        it("should resolve R4 dependencies (Identifier, Reference, Coding)", () => {
            const notebookFile = result.filesGenerated["generated/types/example-folder-structures/ExampleNotebook.ts"];
            expect(notebookFile).toContain("Identifier");
            expect(notebookFile).toContain("Reference");
            expect(notebookFile).toContain("Coding");
        });

        it("should generate R4 dependency types", () => {
            expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Identifier.ts"]).toBeDefined();
            expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Reference.ts"]).toBeDefined();
            expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Coding.ts"]).toBeDefined();
        });
    });

    describe("Python Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
            .python({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleNotebook type (promoted logical)", () => {
            const notebook = result.filesGenerated["generated/example_folder_structures/example_notebook.py"];
            expect(notebook).toBeDefined();
            expect(notebook).toMatchSnapshot();
        });

        it("should generate R4 dependency types", () => {
            // Python generator resolves R4 dependencies from tree-shaking
            expect(result.filesGenerated["generated/hl7_fhir_r4_core/__init__.py"]).toBeDefined();
            expect(result.filesGenerated["generated/hl7_fhir_r4_core/domain_resource.py"]).toBeDefined();
        });

        it("should generate base types for dependencies", () => {
            const domainResource = result.filesGenerated["generated/hl7_fhir_r4_core/domain_resource.py"];
            expect(domainResource).toBeDefined();
            expect(domainResource).toMatchSnapshot();
        });

        it("should generate Patient resource", () => {
            const patient = result.filesGenerated["generated/hl7_fhir_r4_core/patient.py"];
            expect(patient).toBeDefined();
            expect(patient).toMatchSnapshot();
        });
    });

    describe("C# Generation", async () => {
        const result = await new APIBuilder()
            .setLogLevel("SILENT")
            .localStructureDefinitions(localPackageConfig)
            .typeSchema({ treeShake: treeShakeConfig, promoteLogical: promoteLogicalConfig })
            .csharp({ inMemoryOnly: true })
            .generate();

        it("should succeed", () => {
            expect(result.success).toBeTrue();
        });

        it("should generate ExampleNotebook type (promoted logical)", () => {
            const notebook = result.filesGenerated["generated/types/ExampleFolderStructures/ExampleNotebook.cs"];
            expect(notebook).toBeDefined();
            expect(notebook).toMatchSnapshot();
        });

        it("should generate R4 dependency types", () => {
            // C# generator resolves R4 dependencies from tree-shaking
            expect(result.filesGenerated["generated/types/Hl7FhirR4Core/DomainResource.cs"]).toBeDefined();
            expect(result.filesGenerated["generated/types/Hl7FhirR4Core/Resource.cs"]).toBeDefined();
        });

        it("should generate DomainResource base class", () => {
            const domainResource = result.filesGenerated["generated/types/Hl7FhirR4Core/DomainResource.cs"];
            expect(domainResource).toBeDefined();
            expect(domainResource).toMatchSnapshot();
        });

        it("should generate Resource base class", () => {
            const resource = result.filesGenerated["generated/types/Hl7FhirR4Core/Resource.cs"];
            expect(resource).toBeDefined();
            expect(resource).toMatchSnapshot();
        });

        it("should generate Patient resource", () => {
            const patient = result.filesGenerated["generated/types/Hl7FhirR4Core/Patient.cs"];
            expect(patient).toBeDefined();
            expect(patient).toMatchSnapshot();
        });
    });
});
