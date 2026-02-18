import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("Python Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("error")
        .python({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(153);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/hl7_fhir_r4_core/patient.py"]).toMatchSnapshot();
    });
    it("static files", async () => {
        expect(result.filesGenerated["generated/requirements.txt"]).toMatchSnapshot();
    });
});
