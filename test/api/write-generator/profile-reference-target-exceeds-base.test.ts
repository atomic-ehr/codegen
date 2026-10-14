import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

/**
 * WidenedRelatedPerson restates RelatedPerson.patient (base: Patient) with Patient and Person.
 * Without a canonicalManager patch the generation fails with an error that shows both target
 * lists and both fixes; `examples/typescript-custom-packages` applies each fix.
 */
describe("a profile whose reference targets exceed its base", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .fromPackage("hl7.fhir.r5.core", "5.0.0")
        .localStructureDefinitions({
            package: { name: "example.reference.targets", version: "0.0.1" },
            path: Path.join(__dirname, "../../../examples/typescript-custom-packages/reference-targets"),
            dependencies: [{ name: "hl7.fhir.r5.core", version: "5.0.0" }],
        })
        .typeSchema({
            treeShake: {
                "example.reference.targets": { "http://example.test/StructureDefinition/widened-related-person": {} },
            },
        })
        .typescript({ inMemoryOnly: true, generateProfile: true })
        .generate();

    it("fails the generation", () => {
        expect(result.success).toBeFalse();
    });

    it("explains the defect and both fixes", () => {
        expect(result.errors).toMatchSnapshot();
    });
});
