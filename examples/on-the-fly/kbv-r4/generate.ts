import { APIBuilder, prettyReport } from "../../../src/api/builder";
import { injectDependency, inPackage } from "../../../src/api/patches";

if (require.main === module) {
    console.log("Generating KBV R4 types...");

    const builder = new APIBuilder({
        // de.basisprofil.r4 references core types without declaring hl7.fhir.r4.core.
        patches: { packageJson: inPackage("de.basisprofil.r4", [injectDependency({ "hl7.fhir.r4.core": "4.0.1" })]) },
        registry: "https://packages.simplifier.net",
        ignorePackageIndex: true,
    })
        .fromPackage("kbv.ita.for", "1.3.1")
        .fromPackage("de.basisprofil.r4", "1.6.0-ballot2")
        .fromPackage("kbv.basis", "1.8.0")
        .throwException()
        .typescript({
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .typeSchema({})
        .outputTo("./examples/on-the-fly/kbv-r4/fhir-types")
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}
