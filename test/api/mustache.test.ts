import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("Mustache Template Based Generation", async () => {
    const report = await new APIBuilder({ register: r4Manager })
        .setLogLevel("error")
        .mustache("./examples/mustache/java", {
            debug: "COMPACT",
            inMemoryOnly: true,
            shouldRunHooks: false,
            meta: {
                timestamp: "2025-12-24T00:00:00.000Z",
            },
        })
        .throwException()
        .generate();
    expect(report.success).toBeTrue();
    expect(Object.keys(report.filesGenerated).length).toEqual(192);
    it("Patient resource", async () => {
        expect(
            report.filesGenerated["generated/model/src/main/java/de/solutio/fhir/models/resources/PatientDTO.java"],
        ).toMatchSnapshot();
    });
});
