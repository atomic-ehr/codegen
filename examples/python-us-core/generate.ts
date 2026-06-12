import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { APIBuilder, mkCodegenLogger, prettyReport } from "../../src";

const __dirname = Path.dirname(fileURLToPath(import.meta.url));

console.log("📦 Generating FHIR R4 Core Types...");

const logger = mkCodegenLogger({
    prefix: "API",
    suppressTags: ["#fieldTypeNotFound", "#largeValueSet"],
});

const builder = new APIBuilder({ logger })
    .throwException()
    .fromPackage("hl7.fhir.us.core", "8.0.1")
    .localStructureDefinitions({
        package: { name: "example.folder.structures", version: "0.0.1" },
        path: Path.join(__dirname, "../local-package-folder/structure-definitions"),
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    })
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
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleTypedBundle": {},
            },
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Organization": {},
            },
        },
    })
    .introspection({
        typeSchemas: "type-schemas",
    })
    .outputTo("./examples/python-us-core/fhir_types")
    .cleanOutput(true);

const report = await builder.generate();

console.log(prettyReport(report));

if (!report.success) {
    process.exit(1);
}
