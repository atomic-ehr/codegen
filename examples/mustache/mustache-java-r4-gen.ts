import { APIBuilder } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .setLogLevel("DEBUG")
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .outputTo("./examples/mustache/mustache-java-r4-output")
        .mustache("./examples/mustache/java", { debug: "COMPACT" })
        .introspection({ typeTree: "type-tree.yaml" })
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
