// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .verbose()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .typescript2({ withDebugComment: false })
        .writeTypeTree("index.json")
        // .writeTypeSchemas("examples/r4-type-schema")
        .outputTo("./examples/typescript-r4/fhir-types")
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
