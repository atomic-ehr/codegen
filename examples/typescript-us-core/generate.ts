// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder, mkCodegenLogger, prettyReport } from "../../src/api";

if (require.main === module) {
    const logger = mkCodegenLogger({
        suppressTags: ["#fieldTypeNotFound", "#duplicateSchema", "#duplicateCanonical", "#largeValueSet"],
    });

    const builder = new APIBuilder({ logger })
        .throwException()
        .fromPackage("hl7.fhir.us.core", "8.0.1")
        .typeSchema({
            treeShake: {
                "hl7.fhir.us.core": {
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight": {},
                },
                "hl7.fhir.r4.core": {
                    "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                },
            },
        })
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .outputTo("./examples/typescript-us-core/fhir-types")
        .introspection({
            typeTree: "./type-tree.yaml",
            typeSchemas: "./ts",
        })
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));

    if (!report.success) process.exit(1);
}
