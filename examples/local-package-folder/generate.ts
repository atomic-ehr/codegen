import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { APIBuilder, prettyReport } from "../../src/api";

const __dirname = Path.dirname(fileURLToPath(import.meta.url));

async function generateFromLocalPackageFolder() {
    const builder = new APIBuilder();

    const report = await builder
        .localStructureDefinitions({
            package: { name: "example.folder.structures", version: "0.0.1" },
            path: Path.join(__dirname, "structure-definitions"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({})
        .throwException(true)
        .typeSchema({
            treeShake: {
                "example.folder.structures": {
                    "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
                    "http://example.org/fhir/StructureDefinition/ExampleTypedBundle": {},
                },
                "hl7.fhir.r4.core": {
                    "http://hl7.org/fhir/StructureDefinition/Patient": {},
                    "http://hl7.org/fhir/StructureDefinition/Organization": {},
                },
            },
        })
        .introspection({ typeSchemas: "ts/" })
        .outputTo("./examples/local-package-folder/fhir-types")
        .generate();

    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}

generateFromLocalPackageFolder().catch((error) => {
    console.error(error);
    process.exit(1);
});
