import { APIBuilder, mkCodegenLogger, prettyReport } from "../../src";

console.log("📦 Generating FHIR R4 Core Types...");

const logger = mkCodegenLogger({
    prefix: "API",
    suppressTags: ["#fieldTypeNotFound", "#largeValueSet"],
});

const builder = new APIBuilder({ logger })
    .throwException()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .python({
        allowExtraFields: false,
        primitiveTypeExtension: true,
        generateProfile: false,
        fhirpyClient: false,
        fieldFormat: "snake_case",
    })
    .typeSchema({
        treeShake: {
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
                "http://hl7.org/fhir/StructureDefinition/DomainResource": {},
                "http://hl7.org/fhir/StructureDefinition/BackboneElement": {},
                "http://hl7.org/fhir/StructureDefinition/Element": {},
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/Observation": {},
                "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
                // Extensions
                "http://hl7.org/fhir/StructureDefinition/patient-birthPlace": {},
                "http://hl7.org/fhir/StructureDefinition/patient-nationality": {},
                "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix": {},
                "http://hl7.org/fhir/StructureDefinition/patient-birthTime": {},
            },
        },
    })
    .introspection({
        typeSchemas: "type-schemas",
    })
    .outputTo("./examples/python/fhir_types")
    .cleanOutput(true);

const report = await builder.generate();

console.log(prettyReport(report));

if (!report.success) {
    process.exit(1);
}
