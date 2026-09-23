import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-reference-target");

/**
 * The Python side of the fixture the TypeScript reference-target test uses,
 * pinning what the Python writer emits today — the defect included.
 *
 * `Task.focus` is `Reference(Any)`, and the profile restates it with nothing but
 * `mustSupport`. The emitted check lists `Resource` as the only allowed type,
 * which no instance can ever carry as its `resourceType`, so every conformant
 * reference is rejected and `from_resource()` raises. The TypeScript writer
 * reads `effectiveResource` off the field and gets the concrete types; Python
 * still resolves the targets itself.
 */
describe("Python profile reference targets", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.referencetarget", version: "0.1.0" },
            path: FIXTURE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
        .generate();

    const profileKey = "generated/example_test_referencetarget/profiles/task_reference_target_task.py";
    const profileFile = result.filesGenerated.python?.[profileKey];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(profileFile).toBeDefined();
    });

    it("matches snapshot", () => {
        expect(profileFile).toMatchSnapshot();
    });
});
