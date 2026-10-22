import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, typeSchemaSpecViolations } from "@typeschema-test/utils";

const typeSchemas = { target: "type-schemas.ndjson", profileSnapshots: true };

describe("TypeSchema output conforms to docs/type-schema.schema.json", () => {
    it("hl7.fhir.us.core with its hl7.fhir.r4.core closure", async () => {
        const report = await new APIBuilder({ logger: mkErrorLogger() })
            .fromPackage("hl7.fhir.us.core", "8.0.1")
            .introspection({ typeSchemas, inMemoryOnly: true })
            .generate();
        expect(typeSchemaSpecViolations(report)).toMatchSnapshot();
    }, 300_000);

    it("custom-packages example structure definitions with hl7.fhir.r5.core", async () => {
        const report = await new APIBuilder({ logger: mkErrorLogger() })
            .fromPackage("hl7.fhir.r5.core", "5.0.0")
            .localStructureDefinitions({
                package: { name: "example.folder.structures", version: "0.0.1" },
                path: Path.join(__dirname, "../../../examples/typescript-custom-packages/structure-definitions"),
                dependencies: [{ name: "hl7.fhir.r5.core", version: "5.0.0" }],
            })
            .introspection({ typeSchemas, inMemoryOnly: true })
            .generate();
        expect(typeSchemaSpecViolations(report)).toMatchSnapshot();
    }, 300_000);
});
