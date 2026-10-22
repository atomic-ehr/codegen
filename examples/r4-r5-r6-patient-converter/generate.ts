import { ensureDependency, inPackage } from "@atomic-ehr/fhir-canonical-manager/patch";
import { APIBuilder, mkCodegenLogger, prettyReport } from "../../src/api";

const logger = mkCodegenLogger({
    suppressTags: ["#fieldTypeNotFound", "#largeValueSet", "#skipCanonical", "#duplicateSchema"],
});

const report = await new APIBuilder({
    logger,
    canonicalManager: {
        patches: {
            // R5 and R6 moved the HL7 terminology CodeSystems out to hl7.terminology without
            // declaring a dependency on it. Without the edge they inherit R4's bundled copy.
            packageJson: [
                inPackage("hl7.fhir.r5.core", [ensureDependency({ "hl7.terminology": "6.0.2" })]),
                inPackage("hl7.fhir.r6.core", [ensureDependency({ "hl7.terminology": "6.0.2" })]),
            ],
        },
    },
})
    .fromPackage("hl7.fhir.r4.core", "4.0.1")
    .fromPackage("hl7.fhir.r5.core", "5.0.0")
    .fromPackage("hl7.fhir.r6.core", "6.0.0-ballot2")
    // The patch adds the edge; this installs the package.
    .fromPackage("hl7.terminology", "6.0.2")
    .throwException()
    .typescript({ withDebugComment: false, generateProfile: false })
    .typeSchema({
        // All three releases provide this canonical, so each key names its release.
        treeShake: {
            "hl7.fhir.r4.core#4.0.1": { "http://hl7.org/fhir/StructureDefinition/Patient": {} },
            "hl7.fhir.r5.core#5.0.0": { "http://hl7.org/fhir/StructureDefinition/Patient": {} },
            "hl7.fhir.r6.core#6.0.0-ballot2": { "http://hl7.org/fhir/StructureDefinition/Patient": {} },
        },
    })
    .outputTo("./examples/r4-r5-r6-patient-converter/fhir-types")
    .cleanOutput(true)
    .generate();

console.log(prettyReport(report));
if (!report.success) process.exit(1);

console.log("✅ FHIR types generated successfully!");
