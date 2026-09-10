import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, mkR5Register } from "@typeschema-test/utils";

// Real-closure test (downloads hl7.fhir.r5.core once, then served from the CM cache):
// the builtin exclusions drop R5's known-broken CodeSystem profiles, opting out brings
// them back, and hand-written excludedCanonicals reproduce the drop.
const SHAREABLE = "http://hl7.org/fhir/StructureDefinition/shareablecodesystem";
const PUBLISHABLE = "http://hl7.org/fhir/StructureDefinition/publishablecodesystem";

const generatedSchemaNames = async (typeSchemaConf: object): Promise<string[]> => {
    const register = await mkR5Register();
    const result = await new APIBuilder({ register, logger: mkErrorLogger() })
        .typeSchema(typeSchemaConf)
        .introspection({ typeSchemas: "type-schemas", inMemoryOnly: true })
        .generate();

    if (!result.success) throw new Error(`generation failed: ${result.errors.join(", ")}`);
    return Object.keys(result.filesGenerated.introspection ?? {});
};

const hasSchema = (names: string[], fragment: string) => names.some((n) => n.toLowerCase().includes(fragment));

describe("canonical exclusions on the real R5 closure", () => {
    it("builtin exclusions drop the broken R5 profiles by default", async () => {
        const names = await generatedSchemaNames({});

        expect(hasSchema(names, "shareablecodesystem")).toBeFalse();
        expect(hasSchema(names, "publishablecodesystem")).toBeFalse();
        // Control: a healthy sibling profile generates.
        expect(hasSchema(names, "shareablevalueset")).toBeTrue();
    });

    it("builtinExclusions: false brings them back", async () => {
        const names = await generatedSchemaNames({ builtinExclusions: false });

        expect(hasSchema(names, "shareablecodesystem")).toBeTrue();
        expect(hasSchema(names, "publishablecodesystem")).toBeTrue();
    });

    it("hand-written excludedCanonicals reproduce the drop", async () => {
        const names = await generatedSchemaNames({
            builtinExclusions: false,
            excludedCanonicals: [
                { package: "hl7.fhir.r5.core#5.0.0", url: SHAREABLE, reason: "broken content" },
                { package: "hl7.fhir.r5.core#5.0.0", url: PUBLISHABLE, reason: "R5-only base types" },
            ],
        });

        expect(hasSchema(names, "shareablecodesystem")).toBeFalse();
        expect(hasSchema(names, "publishablecodesystem")).toBeFalse();
        expect(hasSchema(names, "shareablevalueset")).toBeTrue();
    });
});
