import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";
import * as helpers from "../../../assets/api/writer-generator/typescript/profile-helpers";

const IMPORT_STATEMENT_RE = /import[\s\S]*?from\s+["'][^"']+["'];/g;
const EXPORT_KEYWORD_RE = /export /g;

// Run the generated module without touching the file system: type-only imports
// are erased and the runtime helpers are injected as parameters, so the class
// executes against the production helper implementations.
type ProfileClass = new (resource: unknown) => { validate: () => { errors: string[]; warnings: string[] } };

const instantiateProfile = (source: string): ProfileClass => {
    const javascript = new Bun.Transpiler({ loader: "ts" })
        .transformSync(source.replace(IMPORT_STATEMENT_RE, ""))
        .replace(EXPORT_KEYWORD_RE, "");
    return new Function(...Object.keys(helpers), `${javascript}; return ConstrainedValuesServiceRequestProfile;`)(
        ...Object.values(helpers),
    );
};

const MATCHING = { coding: [{ system: "http://example.test/category", code: "example" }] };
const OTHER = { coding: [{ system: "http://other.test", code: "other" }] };

/**
 * The profile constrains three elements:
 *
 * - `doNotPerform` — optional (min 0) with `fixedBoolean: false`
 * - `category`     — repeating (0..*) with a `patternCodeableConcept`
 * - `intent`       — required (min 1) with `fixedCode: "order"`
 */
describe("Profile constrained values", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.constrainedvalues", version: "0.1.0" },
            path: Path.join(__dirname, "../../assets/profile-constrained-values"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();
    if (!result.success) throw new Error("Profile generation failed");
    const files = result.filesGenerated.typescript ?? {};
    const profilePath = Object.keys(files).find((key) =>
        key.includes("ServiceRequest_ConstrainedValuesServiceRequest"),
    );
    if (!profilePath) throw new Error("Generated ServiceRequest profile is missing");
    const profileSource = files[profilePath] ?? "";

    const profile = instantiateProfile(profileSource);
    const resource = {
        resourceType: "ServiceRequest",
        meta: { profile: ["http://example.test/StructureDefinition/constrained-values-service-request"] },
        status: "active",
        intent: "order",
        subject: { reference: "Patient/example" },
    };

    it("captures the generated profile module", () => {
        expect(profileSource).toMatchSnapshot();
    });

    const errorsFor = (resource: unknown) => new profile(resource).validate().errors;

    it("accepts an omitted optional fixed value", () => {
        expect(errorsFor({ ...resource, category: [MATCHING] })).toEqual([]);
    });

    it("accepts a conformant repeating pattern", () => {
        expect(errorsFor({ ...resource, doNotPerform: false, category: [MATCHING] })).toEqual([]);
    });

    it("accepts a fully conformant resource", () => {
        expect(errorsFor({ ...resource, doNotPerform: false, category: [MATCHING, MATCHING] })).toEqual([]);
    });

    // A pattern on a repeating element applies to every repetition.
    it("rejects a repeating pattern where one repetition does not match", () => {
        expect(errorsFor({ ...resource, doNotPerform: false, category: [MATCHING, OTHER] })).toContain(
            "ConstrainedValuesServiceRequest: field 'category' does not match expected fixed value",
        );
    });

    it("rejects an empty repeating element with a constraint", () => {
        expect(errorsFor({ ...resource, doNotPerform: false, category: [] })).toContain(
            "ConstrainedValuesServiceRequest: field 'category' does not match expected fixed value",
        );
    });

    it("rejects an array supplied for a single-valued constrained element", () => {
        expect(errorsFor({ ...resource, doNotPerform: [false], category: [MATCHING] })).toContain(
            "ConstrainedValuesServiceRequest: field 'doNotPerform' does not match expected fixed value",
        );
    });

    it("rejects a repeating pattern where no repetition matches", () => {
        expect(errorsFor({ ...resource, doNotPerform: false, category: [OTHER] })).toContain(
            "ConstrainedValuesServiceRequest: field 'category' does not match expected fixed value",
        );
    });

    it("rejects a present mismatching optional fixed value", () => {
        expect(errorsFor({ ...resource, doNotPerform: true, category: [MATCHING] })).toContain(
            "ConstrainedValuesServiceRequest: field 'doNotPerform' does not match expected fixed value",
        );
    });

    it("rejects a missing required constrained field", () => {
        const { intent: _intent, ...withoutIntent } = resource;
        expect(errorsFor({ ...withoutIntent, doNotPerform: false })).toContain(
            "ConstrainedValuesServiceRequest: required field 'intent' is missing",
        );
    });

    it("rejects a mismatching required fixed value", () => {
        expect(errorsFor({ ...resource, doNotPerform: false, intent: "plan" })).toContain(
            "ConstrainedValuesServiceRequest: field 'intent' does not match expected fixed value",
        );
    });
});
