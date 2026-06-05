import { APIBuilder, prettyReport } from "../../../src/api/builder";
import { injectDependency, renamePackage, renameReferenceTarget } from "../../../src/api/patches";

// Fix known package name typos (in-memory transformation)
const packageNameFixes: Record<string, string> = {
    "simplifier.core.r4.rResources": "simplifier.core.r4.resources",
};

// Packages that need hl7.fhir.r4.core dependency injected
const needsCoreDependency = (name: string): boolean => {
    return (
        name.startsWith("simplifier.core.r4.") ||
        name === "simplifier.core.r4" ||
        name.startsWith("hl7.fhir.no.") ||
        name.startsWith("ehelse.fhir.no.") ||
        name.startsWith("nhn.fhir.no.") ||
        name.startsWith("sfm.")
    );
};

if (require.main === module) {
    console.log("Generating Norge R4 types...");

    const builder = new APIBuilder({
        patches: {
            package: [
                // Core packages reference core types without declaring the dep; fix the name typo.
                injectDependency((pkg) => needsCoreDependency(pkg.name), { "hl7.fhir.r4.core": "4.0.1" }),
                renamePackage(packageNameFixes),
            ],
            // gd-RelatedPerson widens patient to include Person, but base R4 RelatedPerson.patient
            // only allows Patient — narrow the Person targets back to Patient.
            resource: [
                renameReferenceTarget(
                    {
                        "http://hl7.org/fhir/StructureDefinition/Person":
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        "http://hl7.no/fhir/StructureDefinition/no-basis-Person":
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        "http://ehelse.no/fhir/StructureDefinition/gd-Person":
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                    },
                    { url: "http://ehelse.no/fhir/StructureDefinition/gd-RelatedPerson" },
                ),
            ],
        },
        registry: "https://packages.simplifier.net",
    })
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .fromPackage("ehelse.fhir.no.grunndata", "2.3.5")
        .fromPackage("hl7.fhir.no.basis", "2.2.2")
        .fromPackage("sfm.030322", "2.0.1")
        .throwException()
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .typeSchema({})
        .introspection({
            typeSchemas: "type-schemas",
            typeTree: "type-tree.yaml",
            fhirSchemas: "fhir-schemas",
            structureDefinitions: "structure-definitions",
        })
        .outputTo("./examples/on-the-fly/norge-r4/fhir-types")
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}
