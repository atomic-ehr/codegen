import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const FIXTURE_PATH = Path.join(__dirname, "../../assets/profile-reference-target");

/**
 * Regression, the Python half of #242: `Task.focus` is `Reference(Any)`, and the
 * profile restates it with nothing but `mustSupport`. The emitted check used to
 * list `Resource` as the only allowed type, which no instance can ever carry as
 * its `resourceType`, so every conformant reference was rejected.
 *
 * #242 recorded the expansion on the schema as `effectiveResource` and pointed
 * the TypeScript writer at it; this reads the same answer from the same place.
 * The fixture is the StructureDefinition of the TypeScript test, so the two
 * writers are pinned against one profile.
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

    // Both names appear nowhere in the module before the expansion — unlike
    // "Task", which is the profile's own resourceType and so proves nothing.
    it("expands an abstract family target into its member resource types", () => {
        expect(profileFile).toContain('"Organization"');
        expect(profileFile).toContain('"ServiceRequest"');
    });

    it("leaves out the family root and any family type among the members", () => {
        expect(profileFile).not.toContain('"Resource"');
        expect(profileFile).not.toContain('"DomainResource"');
    });

    it("leaves an explicit target alone", () => {
        expect(profileFile).toContain('validate_reference(self._resource, profile_name, "requester", [');
        expect(profileFile).toContain('"Practitioner"');
    });

    it("matches snapshot", () => {
        expect(profileFile).toMatchSnapshot();
    });
});
