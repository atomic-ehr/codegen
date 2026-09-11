// Run this script using Bun CLI with:
// bun run examples/on-the-fly/kbv-condition-diagnosis/generate.ts

import { APIBuilder, prettyReport } from "../../../src/api/builder";

// Generates TypeScript types for the KBV_PR_Base_Condition_Diagnosis profile
// (kbv.basis@1.9.0) together with full introspection output: TypeSchemas,
// FHIR schemas, and source StructureDefinitions. The profile type-slices the
// Condition.onset[x] and abatement[x] choice elements with open slicing rules.
if (require.main === module) {
    console.log("Generating KBV Condition Diagnosis types...");

    const builder = new APIBuilder({
        canonicalManager: {
            registry: "https://packages.simplifier.net",
            packageIndex: "regenerate",
        },
    })
        .fromPackage("kbv.basis", "1.9.0")
        .throwException()
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .typeSchema({
            treeShake: {
                "kbv.basis": {
                    "https://fhir.kbv.de/StructureDefinition/KBV_PR_Base_Condition_Diagnosis": {},
                },
            },
        })
        .introspection({
            typeSchemas: { target: "type-schemas", profileSnapshots: true },
            fhirSchemas: "fhir-schemas",
            structureDefinitions: "structure-definitions",
            typeTree: "type-tree.yaml",
        })
        .outputTo("./examples/on-the-fly/kbv-condition-diagnosis/fhir-types")
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}
