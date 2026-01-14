import { APIBuilder, prettyReport } from "../../src";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .python({
            allowExtraFields: false,
            staticDir: "./src/api/writer-generator/python/static-files",
            fieldFormat: "snake_case",
        })
        .treeShake({
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Patient": {
                    selectFields:["name", "gender", "birthDate"],
                },
                "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                "http://hl7.org/fhir/StructureDefinition/DomainResource": {},
                "http://hl7.org/fhir/StructureDefinition/Element": {},
            },
        })
        .outputTo("./examples/python/fhir_types")
        .cleanOutput(true);

    const report = await builder.generate();

    console.log(prettyReport(report));

    if (!report.success) {
        process.exit(1);
    }
}
