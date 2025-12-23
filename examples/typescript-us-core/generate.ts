// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating US Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.us.core", "8.0.1")
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .outputTo("./examples/typescript-us-core/fhir-types")
        .writeTypeTree("./examples/typescript-us-core/type-tree.yaml")
        .cleanOutput(true);

    const report = await builder.generate();

    console.log(report);

    if (report.success) {
        console.log("✅ FHIR US Core types generated successfully!");
    } else {
        console.error("❌ FHIR US Core types generation failed.");
        process.exit(1);
    }
}
