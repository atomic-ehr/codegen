import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, r4Manager } from "@typeschema-test/utils";

describe("C# Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager, logger: mkErrorLogger() })
        .csharp({
            inMemoryOnly: true,
        })
        .throwException()
        .generate();
    const files = result.filesGenerated.csharp!;

    it("generates 154 files successfully", () => {
        expect(result.success).toBeTrue();
        expect(Object.keys(files).length).toEqual(154);
    });

    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(files["generated/types/Hl7FhirR4Core/Patient.cs"]).toMatchSnapshot();
    });
    it("static files", async () => {
        expect(files["generated/types/Client.cs"]).toMatchSnapshot();
        expect(files["generated/types/Helper.cs"]).toMatchSnapshot();
    });
});
