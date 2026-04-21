import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, r4Manager } from "@typeschema-test/utils";

describe("Mustache Template Based Generation", async () => {
    const report = await new APIBuilder({ register: r4Manager, logger: mkErrorLogger() })
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
    const files = report.filesGenerated["mustache[./examples/mustache/java]"]!;
    expect(Object.keys(files).length).toEqual(192);
    it("Patient resource", async () => {
        expect(
            files["generated/model/src/main/java/de/solutio/fhir/models/resources/PatientDTO.java"],
        ).toMatchSnapshot();
    });
});
