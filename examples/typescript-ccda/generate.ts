// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { registerFromPackageMetas } from "@root/typeschema/register";
import { APIBuilder, prettyReport } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating FHIR R4 Core Types...");

    const registry = await registerFromPackageMetas([{ name: "hl7.cda.uv.core", version: "2.0.1-sd" }], {});
    if (registry === undefined) throw new Error("Failed to register package");

    const cdaResources = registry
        .allSd()
        .filter(
            (sd) =>
                sd.extension?.find(
                    (ext) => ext.url === "http://hl7.org/fhir/tools/StructureDefinition/type-profile-style",
                )?.valueUri === "cda",
        )
        .map((sd) => sd.url);

    const builder = new APIBuilder({ manager: registry })
        .throwException()
        .promoteLogicToResource({ "hl7.cda.uv.core": cdaResources })
        .typescript({ withDebugComment: false, resourceTypeFieldForLogicalResource: false })
        .outputTo("./examples/typescript-ccda/fhir-types")
        .introspection({
            typeSchemas: "type-schemas",
            fhirSchemas: "fs",
            structureDefinitions: "sd",
            typeTree: "type-tree.yaml",
        })
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));

    if (!report.success) process.exit(1);
}
