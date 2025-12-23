import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(Object.keys(result.filesGenerated).length).toEqual(236);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
});
