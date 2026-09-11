import { ensureDependency, inResource, renamePackage, replaceText } from "@atomic-ehr/fhir-canonical-manager/patch";
import { APIBuilder, prettyReport } from "../../../src/api/builder";

if (require.main === module) {
    console.log("Generating Norge R4 types...");

    const builder = new APIBuilder({
        canonicalManager: {
            registry: "https://packages.simplifier.net",
            patches: {
                packageJson: [
                    // Many Norge packages reference core types without declaring the dependency;
                    // make every package (except core itself) depend on core.
                    ensureDependency({ "hl7.fhir.r4.core": "4.0.1" }),
                    // Fix known package name typo.
                    renamePackage("simplifier.core.r4.rResources", "simplifier.core.r4.resources"),
                ],
                // gd-RelatedPerson widens patient to include Person, but base R4 RelatedPerson.patient
                // only allows Patient — narrow the Person targets back to Patient.
                fhirResource: [
                    inResource("http://ehelse.no/fhir/StructureDefinition/gd-RelatedPerson", [
                        replaceText(
                            "http://hl7.org/fhir/StructureDefinition/Person",
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        ),
                        replaceText(
                            "http://hl7.no/fhir/StructureDefinition/no-basis-Person",
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        ),
                        replaceText(
                            "http://ehelse.no/fhir/StructureDefinition/gd-Person",
                            "http://hl7.org/fhir/StructureDefinition/Patient",
                        ),
                    ]),
                ],
            },
        },
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
