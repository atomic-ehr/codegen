// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { registerFromPackageMetas } from "@root/typeschema/register";
import { APIBuilder, prettyReport } from "../../src/api/builder";

if (require.main === module) {
    console.log("📦 Generating CCDA Types...");

    const registry = await registerFromPackageMetas(
        [
            { name: "hl7.fhir.r4.core", version: "4.0.1" },
            { name: "hl7.cda.us.ccda", version: "5.0.0-ballot" },
            // { name: "hl7.cda.uv.core", version: "2.0.2-sd" },
        ],
        {},
    );
    if (registry === undefined) throw new Error("Failed to register package");

    registry.patchSd((pkg, sd) => {
        if (pkg.name !== "hl7.cda.uv.core") return sd;
        let str = JSON.stringify(sd);
        str = str.replaceAll(
            "http://hl7.org/cda/stds/core/StructureDefinition/IVL_TS",
            "http://hl7.org/cda/stds/core/StructureDefinition/IVL-TS",
        );
        return JSON.parse(str);
    });

    const cdaResources = registry
        .allSd()
        .filter((sd) => {
            const typeProfileStyle = sd.extension?.find(
                (ext) => ext.url === "http://hl7.org/fhir/tools/StructureDefinition/type-profile-style",
            );
            return (typeProfileStyle?.valueUri ?? typeProfileStyle?.valueCode) === "cda";
        })
        .map((sd) => sd.url);

    console.log(cdaResources);

    const builder = new APIBuilder({ register: registry })
        .throwException()
        .typeSchema({ promoteLogical: { "hl7.cda.uv.core": cdaResources } })
        .typescript({ withDebugComment: false })
        .outputTo("./examples/typescript-ccda/fhir-types")
        .introspection({
            typeSchemas: "TS",
            fhirSchemas: "FS",
            structureDefinitions: "SD",
            typeTree: "type-tree.yaml",
        })
        .cleanOutput(true);

    const report = await builder.generate();
    console.log(prettyReport(report));

    if (!report.success) process.exit(1);
}
