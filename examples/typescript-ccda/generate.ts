// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { registerFromManager } from "@root/typeschema/register";
import { APIBuilder, prettyReport } from "../../src/api/builder";
import { patchCodeSystem, renameCanonical, swapBinding } from "../../src/api/patches";

if (require.main === module) {
    console.log("📦 Generating CCDA Types...");

    const manager = CanonicalManager({
        packages: [],
        workingDir: ".codegen-cache/canonical-manager-cache",
        patches: {
            resource: [
                // IVL_TS is a typo'd canonical in hl7.cda.uv.core (should be IVL-TS).
                renameCanonical(
                    {
                        "http://hl7.org/cda/stds/core/StructureDefinition/IVL_TS":
                            "http://hl7.org/cda/stds/core/StructureDefinition/IVL-TS",
                    },
                    { package: "hl7.cda.uv.core" },
                ),
                // CarePlanAct binds moodCode to an external NLM ValueSet absent from every loaded
                // package; reuse the base Act binding.
                swapBinding(
                    {
                        "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1267.37":
                            "http://terminology.hl7.org/ValueSet/v3-xDocumentActMood",
                    },
                    { package: "hl7.cda.us.ccda", url: "http://hl7.org/cda/us/ccda/StructureDefinition/CarePlanAct" },
                ),
                // The bundle-type CodeSystem omits codes used by BatchBundle /
                // SubscriptionNotificationBundle; patch every copy (resolveAny may pick any).
                patchCodeSystem("http://hl7.org/fhir/bundle-type", ["bundle", "subscription-notification"]),
            ],
        },
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
