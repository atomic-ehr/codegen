import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { APIBuilder, LogLevel, prettyReport } from "../../src/api";

const __dirname = Path.dirname(fileURLToPath(import.meta.url));

async function generateFromLocalPackageFolder() {
    const builder = new APIBuilder({
        logLevel: LogLevel.INFO,
    });

    const report = await builder
        .localStructureDefinitions({
            package: { name: "example.folder.structures", version: "0.0.1" },
            path: Path.join(__dirname, "structure-definitions"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({})
        .throwException(true)
        .treeShake({
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
            },
        })
        .outputTo("./examples/local-package-folder/fhir-types")
        .generate();

    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}

generateFromLocalPackageFolder().catch((error) => {
    console.error(error);
    process.exit(1);
});
