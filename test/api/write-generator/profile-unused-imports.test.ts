import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-unused-imports");

const importBlock = (source: string | undefined): string => (source?.match(/^import [^;]*;/gm) ?? []).join("\n");

const validateMethod = (source: string | undefined): string | undefined =>
    source?.match(/^ {4}validate\(\)[\s\S]*?^ {4}\}$/m)?.[0];

describe("Profile module imports and validate() locals", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.unusedimports", version: "0.0.1" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();

    const profileFile = (moduleName: string): string | undefined => {
        const key = Object.keys(result.filesGenerated.typescript ?? {}).find((k) =>
            k.endsWith(`/example-test-unusedimports/profiles/${moduleName}.ts`),
        );
        return key ? result.filesGenerated.typescript?.[key] : undefined;
    };

    const patient = profileFile("Patient_UnusedImportsPatient");
    const person = profileFile("Person_UrlLessExtensionPerson");
    const quantity = profileFile("Quantity_NothingToValidateQuantity");

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(patient).toBeDefined();
        expect(person).toBeDefined();
        expect(quantity).toBeDefined();
    });

    it("imports for a profile with one required field, a flat-input complex extension and a generic extension", () => {
        expect(importBlock(patient)).toBe(
            `import type { Extension } from "../../hl7-fhir-r4-core/Extension";
import type { Patient } from "../../hl7-fhir-r4-core/Patient";
import { ComplexFlatExtensionProfile, type ComplexFlatExtensionProfileFlat } from "./Extension_ComplexFlatExtension";
import {
    ensureProfile,
    extractComplexExtension,
    isExtension,
    upsertExtension,
    validateRequired,
} from "../../profile-helpers";`,
        );
    });

    it("validate() for a profile with one required field", () => {
        expect(validateMethod(patient)).toBe(
            `    validate(): { errors: string[]; warnings: string[] } {
        const profileName = "UnusedImportsPatient"
        const res = this.resource
        return {
            errors: [
                ...validateRequired(res, profileName, "birthDate"),
            ],
            warnings: [],
        }
    }`,
        );
    });

    it("imports for a profile whose only extension slice has no url", () => {
        expect(importBlock(person)).toBe(
            `import type { Person } from "../../hl7-fhir-r4-core/Person";
import { ensureProfile } from "../../profile-helpers";`,
        );
    });

    it("validate() for a profile whose only extension slice has no url", () => {
        expect(validateMethod(person)).toBe(
            `    validate(): { errors: string[]; warnings: string[] } {
        return {
            errors: [],
            warnings: [],
        }
    }`,
        );
    });

    it("imports for a profile with nothing to validate", () => {
        expect(importBlock(quantity)).toBe(`import type { Quantity } from "../../hl7-fhir-r4-core/Quantity";`);
    });

    it("validate() for a profile with nothing to validate", () => {
        expect(validateMethod(quantity)).toBe(
            `    validate(): { errors: string[]; warnings: string[] } {
        return {
            errors: [],
            warnings: [],
        }
    }`,
        );
    });
});
