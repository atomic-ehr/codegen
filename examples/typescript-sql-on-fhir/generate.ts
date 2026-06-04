import { APIBuilder, prettyReport } from "../../src/api/builder";

const builder = new APIBuilder()
    .throwException()
    .typescript({ withDebugComment: false, generateProfile: false })
    // The IG references R5 core resources (e.g. ViewDefinition's base chain reaches Library)
    // but doesn't declare an hl7.fhir.r5.core dependency, so add it explicitly to resolve them.
    .fromPackage("hl7.fhir.r5.core", "5.0.0")
    .fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
    .outputTo("./examples/typescript-sql-on-fhir/fhir-types")
    .introspection({ typeTree: "tree.yaml" })
    .typeSchema({
        treeShake: {
            "org.sql-on-fhir.ig": {
                "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
            },
        },
    })
    .cleanOutput(true);

const report = await builder.generate();

console.log(prettyReport(report));

if (report.success) {
    console.log("✅ FHIR types generated successfully!");
} else {
    console.error("❌ FHIR types generation failed.");
    process.exit(1);
}
