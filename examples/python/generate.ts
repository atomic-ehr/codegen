import { APIBuilder, prettyReport } from "../../src";
import { type Logger, makeLogger } from "../../src/utils/logger";

console.log("📦 Generating FHIR R4 Core Types...");

const logger: Logger = makeLogger({
    prefix: "API",
    suppressTags: ["FIELD_TYPE_NOT_FOUND", "LARGE_VALUESET"],
});

const builder = new APIBuilder({ logger })
    .throwException()
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .python({
        allowExtraFields: false,
        fhirpyClient: false,
        fieldFormat: "snake_case",
    })
    .typeSchema({
        treeShake: {
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
                "http://hl7.org/fhir/StructureDefinition/DomainResource": {
                    ignoreFields: ["extension", "modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/BackboneElement": {
                    ignoreFields: ["modifierExtension"],
                },
                "http://hl7.org/fhir/StructureDefinition/Element": {},
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/Observation": {},
                "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
            },
        },
    })
    .outputTo("./examples/python/fhir_types")
    .cleanOutput(true);

const report = await builder.generate();

console.log(prettyReport(report));

if (!report.success) {
    process.exit(1);
}
