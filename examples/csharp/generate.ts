import { APIBuilder } from "../../src";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .csharp("SuperNameSpace", "src/api/writer-generator/csharp/staticFiles")
        .outputTo("./examples/csharp/generated")
        .cleanOutput(true);

    const report = await builder.generate();

    console.log(report);

    if (report.success) {
        console.log("✅ FHIR R4 types generated successfully!");
    } else {
        console.error("❌ FHIR R4 types generation failed.");
        process.exit(1);
    }
}
