import { APIBuilder, prettyReport } from "../../src";

console.log("📦 Generating FHIR R4 Core Types...");

const builder = new APIBuilder()
    .throwException()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .python({
        allowExtraFields: false,
        staticDir: "./src/api/writer-generator/python/static-files",
        fieldFormat: "snake_case",
    })
    .outputTo("./examples/python/fhir_types")
    .cleanOutput(true);

const report = await builder.generate();

console.log(prettyReport(report));

if (!report.success) {
    process.exit(1);
}
