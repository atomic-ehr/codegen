import { afterAll, describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

describe("Optional constrained profile fields", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.optionalconstraint", version: "0.1.0" },
            path: Path.join(__dirname, "../../assets/profile-optional-constraint"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();
    if (!result.success) throw new Error("Profile generation failed");
    const files = result.filesGenerated.typescript ?? {};
    const profilePath = Object.keys(files).find((key) => key.includes("ServiceRequest_OptionalCategoryServiceRequest"));
    if (!profilePath) throw new Error("Generated ServiceRequest profile is missing");

    const directory = await fs.mkdtemp(Path.join(os.tmpdir(), "optional-profile-constraint-"));
    afterAll(() => fs.rm(directory, { recursive: true, force: true }));
    for (const [relativePath, content] of Object.entries(files)) {
        const destination = Path.join(directory, relativePath);
        await fs.mkdir(Path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, content);
    }
    const { OptionalCategoryServiceRequestProfile: profile } = await import(Path.join(directory, profilePath));
    const resource = {
        resourceType: "ServiceRequest",
        meta: { profile: ["http://example.test/StructureDefinition/optional-category-service-request"] },
        status: "active",
        intent: "order",
        subject: { reference: "Patient/example" },
    };

    it("accepts an omitted optional pattern field through the generated parser", () => {
        expect(() => profile.from(resource)).not.toThrow();
    });

    it("accepts a present matching optional fixed value", () => {
        expect(() => profile.from({ ...resource, doNotPerform: false })).not.toThrow();
    });

    it("rejects a present mismatching optional fixed value", () => {
        expect(() => profile.from({ ...resource, doNotPerform: true })).toThrow(
            "field 'doNotPerform' does not match expected fixed value",
        );
    });

    it("accepts a present matching repeating pattern", () => {
        const category = [{ coding: [{ system: "http://example.test/category", code: "example" }] }];
        expect(() => profile.from({ ...resource, category })).not.toThrow();
    });

    it("parses its own factory output with the populated repeating pattern", () => {
        const created = profile.createResource({ status: "active", subject: { reference: "Patient/example" } });
        expect(created.category).toEqual([{ coding: [{ system: "http://example.test/category", code: "example" }] }]);
        expect(() => profile.from(created)).not.toThrow();
    });

    it("still requires a constrained required field", () => {
        const { intent: _intent, ...withoutIntent } = resource;
        expect(() => profile.from(withoutIntent)).toThrow("required field 'intent' is missing");
    });

    it.each([null, false, 0, "", [{ coding: [{ system: "http://example.test/category", code: "other" }] }]])(
        "rejects a present mismatching optional pattern: %j",
        (category) => {
            expect(() => profile.from({ ...resource, category })).toThrow(
                "field 'category' does not match expected fixed value",
            );
        },
    );

    it("rejects a present mismatching required fixed value", () => {
        expect(() => profile.from({ ...resource, intent: "plan" })).toThrow(
            "field 'intent' does not match expected fixed value",
        );
    });
});
