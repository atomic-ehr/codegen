import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger, r4Manager } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-optional-constraint");

const profileImportLines = (init: string | undefined): string[] =>
    (init ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.startsWith("import ") && line.includes(".profiles"));

describe("Python profile package exports", async () => {
    describe("resource package without profiles, plus a profile-only package", async () => {
        const result = await new APIBuilder({ logger: mkSilentLogger() })
            .localStructureDefinitions({
                package: { name: "example.test.optionalconstraint", version: "0.1.0" },
                path: FIXTURE_PATH,
                dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
            })
            .typeSchema({
                treeShake: {
                    "hl7.fhir.r4.core": {
                        "http://hl7.org/fhir/StructureDefinition/ServiceRequest": {},
                    },
                    "example.test.optionalconstraint": {
                        "http://example.test/StructureDefinition/optional-category-service-request": {},
                    },
                },
            })
            .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
            .generate();
        const files = result.filesGenerated.python!;
        const init = files["generated/__init__.py"];

        it("should succeed", () => {
            expect(result.success).toBeTrue();
            expect(init).toBeDefined();
        });

        it("skips `import <pkg>.profiles` for a resource package with no profiles", () => {
            expect(files["generated/hl7_fhir_r4_core/profiles/__init__.py"]).toBeUndefined();
            expect(init).not.toContain("fhir_types.hl7_fhir_r4_core.profiles");
        });

        it("exports profiles from their own package", () => {
            expect(files["generated/example_test_optionalconstraint/profiles/__init__.py"]).toBeDefined();
            const packageInit = files["generated/example_test_optionalconstraint/__init__.py"];
            expect(packageInit).toContain("from .profiles import OptionalCategoryServiceRequestProfile");
            expect(packageInit).toContain("'OptionalCategoryServiceRequestProfile'");
        });

        it("does not eagerly import profile-only packages from the root", () => {
            expect(profileImportLines(init)).toEqual([]);
            expect(init).not.toContain("# noqa: F401");
        });
    });

    describe("no profiles kept at all", async () => {
        const result = await new APIBuilder({ register: await r4Manager(), logger: mkSilentLogger() })
            .typeSchema({
                treeShake: {
                    "hl7.fhir.r4.core": {
                        "http://hl7.org/fhir/StructureDefinition/ServiceRequest": {},
                    },
                },
            })
            .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
            .generate();
        const files = result.filesGenerated.python!;
        const init = files["generated/__init__.py"];

        it("should succeed", () => {
            expect(result.success).toBeTrue();
            expect(init).toBeDefined();
        });

        it("emits no profile imports and no profile helpers", () => {
            expect(profileImportLines(init)).toEqual([]);
            expect(files["generated/profile_helpers.py"]).toBeUndefined();
        });
    });
});
