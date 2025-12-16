import { APIBuilder } from "../../src/api/builder";

const builder = new APIBuilder()
    .throwException()
    .typescript({ withDebugComment: false, generateProfile: false })
    .fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
    .outputTo("./examples/typescript-sql-on-fhir/fhir-types")
    .writeTypeTree("./examples/typescript-sql-on-fhir/tree.yaml")
    .treeShake({
        "org.sql-on-fhir.ig": {
            "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
        },
    })
    .cleanOutput(true);

const report = await builder.generate();

console.log(report);

if (report.success) {
    console.log("✅ FHIR types generated successfully!");
} else {
    console.error("❌ FHIR types generation failed.");
    process.exit(1);
}
