import { APIBuilder, prettyReport } from "../../src";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .csharp({
            rootNamespace: "FhirTypes",
        })
        .outputTo("./examples/csharp/generated")
        .cleanOutput(true);

    const report = await builder.generate();

    console.log(prettyReport(report));

    if (!report.success) process.exit(1);
}
