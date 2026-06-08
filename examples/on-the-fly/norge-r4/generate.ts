import { APIBuilder, prettyReport } from "../../../src/api/builder";
import {
    injectDependency,
    inPackage,
    inResource,
    renamePackage,
    renameReferenceTarget,
} from "../../../src/api/patches";

const CORE_PACKAGE = "hl7.fhir.r4.core";

// True for every package except core itself — injectDependency is a no-op when the
// dependency is already declared, so this only needs to keep core from depending on itself.
const needsCoreDependency = (name: string): boolean => name !== CORE_PACKAGE;

if (require.main === module) {
    console.log("Generating Norge R4 types...");

    const builder = new APIBuilder({
        patches: {
            packageJson: [
                // Many Norge packages reference core types without declaring the dependency;
                // inject it wherever it's missing.
                inPackage((pkg) => needsCoreDependency(pkg.name), [injectDependency({ [CORE_PACKAGE]: "4.0.1" })]),
                // Fix known package name typo.
                renamePackage({ "simplifier.core.r4.rResources": "simplifier.core.r4.resources" }),
            ],
            // gd-RelatedPerson widens patient to include Person, but base R4 RelatedPerson.patient
            // only allows Patient — narrow the Person targets back to Patient.
            fhirResource: [
                inResource("http://ehelse.no/fhir/StructureDefinition/gd-RelatedPerson", [
                    renameReferenceTarget({
                        "http://hl7.org/fhir/StructureDefinition/Person":
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        "http://hl7.no/fhir/StructureDefinition/no-basis-Person":
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        "http://ehelse.no/fhir/StructureDefinition/gd-Person":
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                    }),
                ]),
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
