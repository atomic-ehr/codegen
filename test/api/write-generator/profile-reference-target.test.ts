import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";
import * as helpers from "../../../assets/api/writer-generator/typescript/profile-helpers";

const IMPORT_STATEMENT_RE = /import[\s\S]*?from\s+["'][^"']+["'];/g;
const EXPORT_KEYWORD_RE = /export /g;

// Execute the generated module without touching the file system: type-level
// imports are erased and the runtime helpers are injected as function
// parameters, so the class runs against the production helper implementations.
const instantiateProfile = (source: string): { from: (resource: unknown) => unknown } => {
    const javascript = new Bun.Transpiler({ loader: "ts" })
        .transformSync(source.replace(IMPORT_STATEMENT_RE, ""))
        .replace(EXPORT_KEYWORD_RE, "");
    return new Function(...Object.keys(helpers), `${javascript}; return ReferenceTargetTaskProfile;`)(
        ...Object.values(helpers),
    );
};

describe("Reference target validation", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.referencetarget", version: "0.1.0" },
            path: Path.join(__dirname, "../../assets/profile-reference-target"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();
    if (!result.success) throw new Error("Profile generation failed");
    const files = result.filesGenerated.typescript ?? {};
    const profilePath = Object.keys(files).find((key) => key.includes("Task_ReferenceTargetTask"));
    if (!profilePath) throw new Error("Generated Task profile is missing");
    const profileSource = files[profilePath] ?? "";

    const profile = instantiateProfile(profileSource);
    const resource = {
        resourceType: "Task",
        meta: { profile: ["http://example.test/StructureDefinition/reference-target-task"] },
        status: "requested",
        intent: "order",
    };

    it("captures the generated profile module", () => {
        expect(profileSource).toMatchSnapshot();
    });

    it("accepts a concrete reference for the abstract Resource target", () => {
        expect(() => profile.from({ ...resource, focus: { reference: "Organization/synthetic" } })).not.toThrow();
    });

    it("rejects a reference to a type that is not a resource", () => {
        expect(() => profile.from({ ...resource, focus: { reference: "NotAResource/synthetic" } })).toThrow(
            "field 'focus' references 'NotAResource'",
        );
    });

    it("accepts a matching explicit reference target", () => {
        expect(() => profile.from({ ...resource, requester: { reference: "Practitioner/synthetic" } })).not.toThrow();
    });

    it("rejects a mismatching explicit reference target", () => {
        expect(() => profile.from({ ...resource, requester: { reference: "Organization/synthetic" } })).toThrow(
            "field 'requester' references 'Organization' but only Practitioner are allowed",
        );
    });
});
