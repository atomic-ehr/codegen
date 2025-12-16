import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { APIBuilder, LogLevel } from "../../src/api";

const __dirname = Path.dirname(fileURLToPath(import.meta.url));

async function generateFromLocalPackageFolder() {
    const builder = new APIBuilder({
        logLevel: LogLevel.INFO,
    });

    await builder
        .localStructureDefinitions({
            package: { name: "example.folder.structures", version: "0.0.1" },
            path: Path.join(__dirname, "structure-definitions"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({})
        .treeShake({
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
            },
        })
        .outputTo("./examples/local-package-folder")
        .generate();
}

generateFromLocalPackageFolder().catch((error) => {
    console.error(error);
    process.exit(1);
});
