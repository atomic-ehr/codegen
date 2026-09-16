import * as Path from "node:path";
import { fileURLToPath } from "node:url";
import { excludeCanonical } from "@atomic-ehr/fhir-canonical-manager/patch";
import { APIBuilder, prettyReport } from "../../src/api";

const __dirname = Path.dirname(fileURLToPath(import.meta.url));

// This example demonstrates two non-registry input mechanisms in a single generation:
//   - local StructureDefinitions from disk (.localStructureDefinitions)
//   - a remote .tgz package by URL (.fromPackageRef) — SQL-on-FHIR
// Both resolve against hl7.fhir.r5.core, so one builder covers them and everything
// lands in one type tree under ./fhir-types.
const report = await new APIBuilder({
    // Instead of the shipped builtin patches, declare the known-broken R5 canonicals by hand —
    // this demonstrates (and continuously exercises) the fully manual loader configuration.
    // Index patches apply at scan time, so a cached closure needs a cache drop to pick them up.
    builtinPatches: false,
    canonicalManager: {
        patches: {
            indexEntry: [
                excludeCanonical({
                    package: { name: "hl7.fhir.r5.core", version: "5.0.0" },
                    url: "http://hl7.org/fhir/StructureDefinition/shareablecodesystem",
                    reason: "Broken CodeSystem.concept.concept content (ElementReference).",
                }),
                excludeCanonical({
                    package: { name: "hl7.fhir.r5.core", version: "5.0.0" },
                    url: "http://hl7.org/fhir/StructureDefinition/publishablecodesystem",
                    reason: "Uses R5-only base types not available in R4 generation.",
                }),
            ],
        },
    },
})
    // The IG references R5 core resources (e.g. ViewDefinition's base chain reaches Library)
    // but doesn't declare an hl7.fhir.r5.core dependency, so add it explicitly to resolve them.
    .fromPackage("hl7.fhir.r5.core", "5.0.0")
    .fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
    .localStructureDefinitions({
        package: { name: "example.folder.structures", version: "0.0.1" },
        path: Path.join(__dirname, "structure-definitions"),
        dependencies: [{ name: "hl7.fhir.r5.core", version: "5.0.0" }],
    })
    .typeSchema({
        treeShake: {
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
                "http://example.org/fhir/StructureDefinition/ExampleTypedBundle": {},
                "http://example.org/fhir/StructureDefinition/PatientMetaRequired": {},
                "http://example.test/StructureDefinition/noted-patient": {},
                "http://example.test/StructureDefinition/noted-complex-extension": {},
                "http://example.test/StructureDefinition/required-complex-extension": {},
                "http://example.test/StructureDefinition/optional-complex-extension": {},
                "http://example.test/StructureDefinition/identified-complex-extension": {},
            },
            "hl7.fhir.r5.core": {
                "http://hl7.org/fhir/StructureDefinition/Patient": {},
                "http://hl7.org/fhir/StructureDefinition/Organization": {},
            },
            "org.sql-on-fhir.ig": {
                "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
            },
        },
    })
    .throwException(true)
    .cleanOutput(true)
    .introspection({ typeSchemas: "ts/", typeTree: "tree.yaml" })
    .typescript({ withDebugComment: false, generateProfile: true })
    // Must follow .typescript(): that generator defaults its own output to <outputDir>/types,
    // and .outputTo() only rewrites the generators configured before it.
    .outputTo("./examples/typescript-custom-packages/fhir-types")
    .generate();

console.log(prettyReport(report));
if (!report.success) process.exit(1);

console.log("✅ FHIR types generated successfully!");
