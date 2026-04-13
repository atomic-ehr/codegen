import { APIBuilder, mkCodegenLogger, prettyReport } from "../../src";

console.log("📦 Generating FHIR R4 Core Types...");

const logger = mkCodegenLogger({
    prefix: "API",
    suppressTags: ["#fieldTypeNotFound", "#largeValueSet"],
});

const builder = new APIBuilder({ logger })
    .throwException()
    .fromPackage("hl7.fhir.us.core", "8.0.1")
    .python({
        allowExtraFields: false,
        primitiveTypeExtension: true,
        generateProfile: true,
        fhirpyClient: false,
        fieldFormat: "snake_case",
    })
    .typeSchema({
        treeShake: {
            "hl7.fhir.us.core": {
                "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient": {},
                "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure": {},
                "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight": {},
            },
        },
    })
    .introspection({
        typeSchemas: "type-schemas",
    })
    .outputTo("./examples/python-profiles/fhir_types")
    .cleanOutput(true);

const report = await builder.generate();

console.log(prettyReport(report));

if (!report.success) {
    process.exit(1);
}
