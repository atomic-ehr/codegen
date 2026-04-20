import type { PreprocessContext } from "@atomic-ehr/fhir-canonical-manager";
import { APIBuilder, prettyReport } from "../../../src/api/builder";

const preprocessPackage = (ctx: PreprocessContext): PreprocessContext => {
    if (ctx.kind !== "package") return ctx;
    const json = ctx.packageJson;
    const name = json.name as string;

    // de.basisprofil.r4 doesn't declare hl7.fhir.r4.core as a dependency
    if (name === "de.basisprofil.r4") {
        const deps = (json.dependencies as Record<string, string>) || {};
        if (!deps["hl7.fhir.r4.core"]) {
            return {
                ...ctx,
                kind: "package",
                packageJson: {
                    ...json,
                    dependencies: { ...deps, "hl7.fhir.r4.core": "4.0.1" },
                },
            };
        }
    }

    return ctx;
};

if (require.main === module) {
    console.log("Generating KBV R4 types...");

    const builder = new APIBuilder({
        preprocessPackage,
        registry: "https://packages.simplifier.net",
        ignorePackageIndex: true,
    })
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .fromPackage("kbv.ita.for", "1.3.1")
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
