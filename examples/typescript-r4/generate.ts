// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder, prettyReport } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        // .typescript({ withDebugComment: false, generateProfile: false })
        // .fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2//package.tgz")
        .writeTypeSchemas("examples/typescript-r4/type-schemas")
        .outputTo("./examples/typescript-r4/fhir-types")
        .writeTypeTree("./examples/typescript-r4/type-tree.yaml")
        .treeShake({
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
                "http://hl7.org/fhir/StructureDefinition/DomainResource": {
                    ignoreFields: ["extension", "modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/BackboneElement": {
                    ignoreFields: ["modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/Element": {
                    ignoreFields: ["extension"],
                },
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/Observation": {},
                "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
            },
        })
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}
