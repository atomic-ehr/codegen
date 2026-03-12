// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating US Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.us.core", "8.0.1")
        .typeSchema({
            treeShake: {
                "hl7.fhir.us.core": {
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-tribal-affiliation": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-individual-sex": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-interpreter-needed": {},
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

    // console.log(report);

    if (report.success) {
        console.log("✅ FHIR US Core types generated successfully!");
    } else {
        console.error("❌ FHIR US Core types generation failed.");
        process.exit(1);
    }
}
