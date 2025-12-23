import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("C# Writer Generator", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .csharp({
            inMemoryOnly: true,
        })
        .throwException()
        .generate();
    expect(Object.keys(result.filesGenerated).length).toEqual(154);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/Hl7FhirR4Core/Patient.cs"]).toMatchSnapshot();
    });
    it("static files", async () => {
        expect(result.filesGenerated["generated/types/Client.cs"]).toMatchSnapshot();
        expect(result.filesGenerated["generated/types/Helper.cs"]).toMatchSnapshot();
    });
});
