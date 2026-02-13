// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { CanonicalManager, type PreprocessPackageContext } from "@atomic-ehr/fhir-canonical-manager";
import { APIBuilder, prettyReport } from "../src/api/builder";

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

const preprocessPackage = ({ packageJson }: PreprocessPackageContext): PreprocessPackageContext => {
    let json = packageJson;
    const name = json.name as string;

    // Fix package name typos
    const fixedName = packageNameFixes[name];
    if (fixedName) {
        console.log(`Fixed package name: ${name} -> ${fixedName}`);
        json = { ...json, name: fixedName };
    }

    // Add missing core dependency to packages that don't properly declare it
    if (needsCoreDependency(name)) {
        const deps = (json.dependencies as Record<string, string>) || {};
        if (!deps["hl7.fhir.r4.core"]) {
            console.log(`Injecting hl7.fhir.r4.core dependency into ${name}`);
            json = {
                ...json,
                dependencies: { ...deps, "hl7.fhir.r4.core": "4.0.1" },
            };
        }
    }

    return { packageJson: json };
};

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const manager = CanonicalManager({
        packages: [
            "hl7.fhir.r4.core@4.0.1",
            "ehelse.fhir.no.grunndata@2.3.5",
            "hl7.fhir.no.basis@2.2.2",
            "sfm.030322@2.0.1",
        ],
        workingDir: ".codegen-cache/canonical-manager-cache",
        registry: "https://packages.simplifier.net",
        preprocessPackage,
    });

    const builder = new APIBuilder({ manager })
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
        .outputTo("./examples/tmp/norge-r4")
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));
    if (!report.success) process.exit(1);
}
