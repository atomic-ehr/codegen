// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { CanonicalManager, type PreprocessContext } from "@atomic-ehr/fhir-canonical-manager";
import { registerFromManager } from "@root/typeschema/register";
import { APIBuilder, prettyReport } from "../../src/api/builder";

const preprocessPackage = (ctx: PreprocessContext): PreprocessContext => {
    if (ctx.kind !== "resource") return ctx;
    if (ctx.package.name === "hl7.cda.uv.core") {
        let str = JSON.stringify(ctx.resource);
        str = str.replaceAll(
            "http://hl7.org/cda/stds/core/StructureDefinition/IVL_TS",
            "http://hl7.org/cda/stds/core/StructureDefinition/IVL-TS",
        );
        return { ...ctx, resource: JSON.parse(str) };
    }
    // CarePlanAct profile binds moodCode to an external NLM ValueSet that
    // isn't available in any loaded package. Reuse the base Act binding.
    if (ctx.package.name === "hl7.cda.us.ccda") {
        const res = ctx.resource as { url?: string };
        if (res.url === "http://hl7.org/cda/us/ccda/StructureDefinition/CarePlanAct") {
            let str = JSON.stringify(ctx.resource);
            str = str.replaceAll(
                "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1267.37",
                "http://terminology.hl7.org/ValueSet/v3-xDocumentActMood",
            );
            return { ...ctx, resource: JSON.parse(str) };
        }
    }
    // The bundle-type CodeSystem is missing codes "bundle" and
    // "subscription-notification" used by BatchBundle and
    // SubscriptionNotificationBundle profiles. Patch all instances since
    // resolveAny may pick any package's copy of the CodeSystem.
    const res = ctx.resource as { url?: string; concept?: { code: string }[] };
    if (res.url === "http://hl7.org/fhir/bundle-type" && res.concept) {
        const existing = new Set(res.concept.map((c) => c.code));
        const missing = ["bundle", "subscription-notification"].filter((c) => !existing.has(c));
        if (missing.length > 0) {
            return {
                ...ctx,
                resource: {
                    ...ctx.resource,
                    concept: [...res.concept, ...missing.map((code) => ({ code }))],
                },
            };
        }
    }
    return ctx;
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
