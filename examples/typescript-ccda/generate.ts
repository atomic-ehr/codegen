// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { CanonicalManager, type PreprocessContext } from "@atomic-ehr/fhir-canonical-manager";
import { registerFromManager } from "@root/typeschema/register";
import { APIBuilder, prettyReport } from "../../src/api/builder";

const preprocessPackage = (ctx: PreprocessContext): PreprocessContext => {
    if (ctx.kind !== "resource") return ctx;
    if (ctx.package.name !== "hl7.cda.uv.core") return ctx;
    let str = JSON.stringify(ctx.resource);
    str = str.replaceAll(
        "http://hl7.org/cda/stds/core/StructureDefinition/IVL_TS",
        "http://hl7.org/cda/stds/core/StructureDefinition/IVL-TS",
    );
    return { ...ctx, resource: JSON.parse(str) };
};

if (require.main === module) {
    console.log("📦 Generating CCDA Types...");

    const manager = CanonicalManager({
        packages: [],
        workingDir: ".codegen-cache/canonical-manager-cache",
        preprocessPackage,
    });

    // Initialize manager with packages to discover CDA resources
    await manager.addPackages("hl7.fhir.r4.core@4.0.1", "hl7.cda.us.ccda@5.0.0-ballot");
    const ref2meta = await manager.init();
    const packageMetas = Object.values(ref2meta);

    const registry = await registerFromManager(manager, { focusedPackages: packageMetas });
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
