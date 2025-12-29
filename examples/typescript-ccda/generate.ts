// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder, prettyReport } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
        .typescript({ withDebugComment: false })
        .outputTo("./examples/typescript-ccda/fhir-types")
        .introspection({
            typeSchemas: "./examples/typescript-ccda/type-schemas",
            typeTree: "./examples/typescript-ccda/tree.yaml",
        })
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));

    if (!report.success) process.exit(1);
}
