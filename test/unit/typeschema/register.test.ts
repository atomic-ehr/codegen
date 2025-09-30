import { describe, expect, it } from "bun:test";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { registerFromPackageMetas } from "@typeschema/register";

export type PFS = Partial<FHIRSchema>;

// TODO: multipackage mode and package info

describe("Register tests", async () => {
    const r4Package = { name: "hl7.fhir.r4.core", version: "4.0.1" };
    const r4 = await registerFromPackageMetas([r4Package]);

    it("ensureCanonicalUrl", () => {
        expect(r4.ensureCanonicalUrl("Patient")).toBe("http://hl7.org/fhir/StructureDefinition/Patient");
    });

    describe("Structure definition", () => {
        it("should return all StructureDefinitions", () => {
            const allSD = r4.allSD();
            expect(Array.isArray(allSD)).toBe(true);
            expect(allSD.length).toBe(655);

            const patientSD = r4.resolveSD("http://hl7.org/fhir/StructureDefinition/Patient")!;
            expect(patientSD).toBeDefined();
        });
    });

    describe("FHIR Schema", () => {
        it("should return all FHIRSchemas", () => {
            const allFS = r4.allFS();
            expect(Array.isArray(allFS)).toBe(true);
            expect(allFS.length).toBe(655);

            const patientFS = r4.resolveFS("http://hl7.org/fhir/StructureDefinition/Patient")!;
            expect(patientFS).toBeDefined();
            expect(patientFS.package_meta).toMatchObject(r4Package);
        });
    });

    // describe("appendFS()", () => {
    //   it("should add a new FHIRSchema to the registry", () => {
    //     const customFS: FHIRSchema = {
    //       url: "http://example.com/StructureDefinition/CustomResource",
    //       name: "CustomResource",
    //       kind: "resource",
    //       derivation: "specialization",
    //       base: "http://hl7.org/fhir/StructureDefinition/DomainResource",
    //       elements: {},
    //       required: [],
    //       type: "CustomResource",
    //     };

    //     // Verify it doesn't exist initially
    //     expect(r4.resolveFS(customFS.url)).toBeUndefined();

    //     // Add it
    //     r4.appendFS(customFS);

    //     // Verify it exists now
    //     const resolved = r4.resolveFS(customFS.url);
    //     expect(resolved).toBeDefined();
    //     expect(resolved?.name).toBe("CustomResource");
    //     expect(resolved?.package_meta).toBeDefined();
    //   });

    //   it("should override existing FHIRSchema with same URL", () => {
    //     const url = "http://example.com/StructureDefinition/TestResource";

    //     const fs1: FHIRSchema = {
    //       url,
    //       name: "TestResource1",
    //       kind: "resource",
    //       derivation: "specialization",
    //       base: "http://hl7.org/fhir/StructureDefinition/DomainResource",
    //       elements: {},
    //       required: [],
    //       type: "TestResource1",
    //     };

    //     const fs2: FHIRSchema = {
    //       url,
    //       name: "TestResource2",
    //       kind: "resource",
    //       derivation: "specialization",
    //       base: "http://hl7.org/fhir/StructureDefinition/DomainResource",
    //       elements: {},
    //       required: [],
    //       type: "TestResource2",
    //     };

    //     r4.appendFS(fs1);
    //     expect(r4.resolveFS(url)?.name).toBe("TestResource1");

    //     r4.appendFS(fs2);
    //     expect(r4.resolveFS(url)?.name).toBe("TestResource2");
    //   });
    // });

    // describe("registerFromManager", () => {
    //   it("should create a register from a CanonicalManager instance", async () => {
    //     const manager = CanonicalManager({
    //       packages: ["hl7.fhir.r4.core@4.0.1"],
    //       workingDir: "tmp/fhir-test",
    //     });
    //     await manager.init();

    //     const register = await registerFromManager(manager);

    //     // Verify register has all expected methods
    //     expect(typeof register.appendFS).toBe("function");
    //     expect(typeof register.resolveFS).toBe("function");
    //     expect(typeof register.allSD).toBe("function");
    //     expect(typeof register.allFS).toBe("function");
    //     expect(typeof register.allVS).toBe("function");
    //     expect(typeof register.complexTypeDict).toBe("function");

    //     // Verify it has loaded resources
    //     expect(register.allSD().length).toBeGreaterThan(0);
    //     expect(register.allFS().length).toBeGreaterThan(0);
    //   });
    // });

    // describe("integration scenarios", () => {
    //   it("should maintain consistency between SD and FS collections", () => {
    //     const allSD = r4.allSD();
    //     const allFS = r4.allFS();

    //     // For each FS, there should be a corresponding SD
    //     for (const fs of allFS) {
    //       const correspondingSD = allSD.find((sd) => sd.url === fs.url);
    //       if (correspondingSD) {
    //         expect(correspondingSD.name).toBe(fs.name);
    //         expect(correspondingSD.type).toBe(fs.type);
    //       }
    //     }
    //   });

    //   it("should properly categorize resources vs complex types", () => {
    //     const allFS = r4.allFS();
    //     const complexTypes = r4.complexTypeDict();

    //     // Resources should not be in complex types dictionary
    //     const resourceFS = allFS.filter((fs) => fs.kind === "resource");
    //     for (const resource of resourceFS) {
    //       expect(complexTypes[resource.url]).toBeUndefined();
    //     }

    //     // All complex types should be in the dictionary
    //     const complexFS = allFS.filter((fs) => fs.kind === "complex-type");
    //     for (const complex of complexFS) {
    //       expect(complexTypes[complex.url]).toBeDefined();
    //     }
    //   });
    // });
});
