import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { APIBuilder, prettyReport } from "../../src/api";

const __dirname = Path.dirname(fileURLToPath(import.meta.url));

// This example demonstrates two non-registry input mechanisms in one script.

// 1. Local StructureDefinitions from disk (.localStructureDefinitions) → ./fhir-types
const localReport = await new APIBuilder()
    .localStructureDefinitions({
        package: { name: "example.folder.structures", version: "0.0.1" },
        path: Path.join(__dirname, "structure-definitions"),
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    })
    .typescript({ generateProfile: true })
    .throwException(true)
    .typeSchema({
        treeShake: {
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
                "http://example.org/fhir/StructureDefinition/ExampleTypedBundle": {},
                "http://example.org/fhir/StructureDefinition/PatientMetaRequired": {},
            },
            "hl7.fhir.r4.core": {
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/Organization": {},
            },
        },
    })
    .introspection({ typeSchemas: "ts/" })
    .outputTo("./examples/typescript-custom-packages/fhir-types")
    .generate();

console.log(prettyReport(localReport));
if (!localReport.success) process.exit(1);

// 2. Remote .tgz package by URL (.fromPackageRef) — SQL-on-FHIR → ./sql-on-fhir-types
const sqlReport = await new APIBuilder()
    .throwException()
    .typescript({ withDebugComment: false, generateProfile: false })
    // The IG references R5 core resources (e.g. ViewDefinition's base chain reaches Library)
    // but doesn't declare an hl7.fhir.r5.core dependency, so add it explicitly to resolve them.
    .fromPackage("hl7.fhir.r5.core", "5.0.0")
    .fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
    .outputTo("./examples/typescript-custom-packages/sql-on-fhir-types")
    .introspection({ typeTree: "tree.yaml" })
    .typeSchema({
        treeShake: {
            "org.sql-on-fhir.ig": {
                "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
            },
        },
    })
    .cleanOutput(true)
    .generate();

console.log(prettyReport(sqlReport));
if (!sqlReport.success) process.exit(1);

console.log("✅ FHIR types generated successfully!");
