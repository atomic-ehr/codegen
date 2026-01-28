import { APIBuilder, prettyReport } from "../../src";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types with fhirpy support...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .python({
            allowExtraFields: false,
            fieldFormat: "snake_case",
            fhirpyClient: true,
        })
        .outputTo("./examples/python-fhirpy/fhir_types")
        .cleanOutput(true);

    const report = await builder.generate();

    console.log(prettyReport(report));

    if (!report.success) {
        process.exit(1);
    }
}
