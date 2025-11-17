// Run this script using Bun CLI with:
// bun run examples/typescript-us-core/generate.ts

import { APIBuilder } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .verbose()
        .throwException()
        .fromPackage("hl7.fhir.us.core", "6.1.0")
        .typescript({ withDebugComment: false, withProfiles: true })
        .outputTo("./examples/typescript-us-core/fhir-types")
        .writeTypeTree("./examples/typescript-us-core/type-tree.yaml")
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
