// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder, prettyReport } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.cda.uv.core", "2.0.1-sd")
        .typescript({ withDebugComment: false, resourceTypeFieldForLogicalResource: false })
        .outputTo("./examples/typescript-ccda/fhir-types")
        .introspection({
            typeSchemas: "type-schemas",
            typeTree: "type-tree.yaml",
        })
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));

    if (!report.success) process.exit(1);
}
