// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { APIBuilder, mkCodegenLogger, prettyReport } from "../../src";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const builder = new APIBuilder({ logger: mkCodegenLogger({ suppressTags: ["#fieldTypeNotFound"] }) })
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
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
                    "http://hl7.org/fhir/StructureDefinition/bp": {},
                    // Extensions
                    "http://hl7.org/fhir/StructureDefinition/patient-birthPlace": {},
                    "http://hl7.org/fhir/StructureDefinition/patient-nationality": {},
                    "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix": {},
                    "http://hl7.org/fhir/StructureDefinition/patient-birthTime": {},
                },
            },
            resolveCollisions: {
                "urn:fhir:binding:CommunicationReason": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/Communication",
                },
                "urn:fhir:binding:ObservationCategory": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/Observation",
                },
                "urn:fhir:binding:ObservationRangeMeaning": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/Observation",
                },
                "urn:fhir:binding:PaymentType": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/ClaimResponse",
                },
            },
        })
        .introspection({
            typeSchemas: "type-schemas",
            typeTree: "type-tree.yaml",
            fhirSchemas: "fhir-schemas",
            structureDefinitions: "structure-definitions",
        })
        .outputTo("./examples/typescript-r4/fhir-types")
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}
