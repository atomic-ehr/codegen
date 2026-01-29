import { APIBuilder } from "../src/api/builder";

const builder = new APIBuilder()
    .throwException()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .typescript({
        withDebugComment: false,
        generateProfile: false,
        primitiveTypeExtension: false,
    })
    .outputTo("./src/fhir-types")
    .treeShake({
        "hl7.fhir.r4.core": {
            "http://hl7.org/fhir/StructureDefinition/CodeSystem": {},
            "http://hl7.org/fhir/StructureDefinition/StructureDefinition": {},
            "http://hl7.org/fhir/StructureDefinition/ValueSet": {},
            "http://hl7.org/fhir/StructureDefinition/Extension": {
                selectFields: ["url", "valueUri"],
            },
        },
    })
    .cleanOutput(true);

const report = await builder.generate();
if (report.success) {
    console.log("✅ FHIR types generated successfully!");
} else {
    console.error("❌ FHIR types generation failed.");
    process.exit(1);
}
