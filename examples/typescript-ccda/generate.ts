// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .verbose()
        .throwException()
        .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
        .typescript2({ withDebugComment: true, writeTypeTree: "./examples/typescript-ccda/tree.yaml" })
        .outputTo("./examples/typescript-ccda/fhir-types")
        .writeTypeSchemas("./examples/typescript-ccda/type-schemas")
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
