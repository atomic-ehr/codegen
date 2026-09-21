// Run this script using Bun CLI with:
// bun run scripts/generate-fhir-types.ts

import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import {
    ensureCodes,
    ensureDependency,
    inPackage,
    inResource,
    replaceText,
} from "@atomic-ehr/fhir-canonical-manager/patch";
import { registerFromManager } from "@root/typeschema/register";
import { APIBuilder, prettyReport } from "../../../src/api/builder";
import { builtinPatches } from "../../../src/api/builtin-patches";

if (require.main === module) {
    console.log("📦 Generating CCDA Types...");

    const manager = CanonicalManager({
        packages: [],
        workingDir: ".codegen-cache/canonical-manager-cache",
        patches: {
            packageJson: [
                // Four packages here declare hl7.fhir.uv.extensions.r4, and all of them ask for a
                // line whose R4 variants of eight extensions still reference R5-only datatypes
                // (Availability, CodeableReference) — the lines the shipped input fixes exclude.
                // 5.3.0 fixes them upstream, so redirect every declaration: dependencies are
                // installed from the patched manifest, node_modules is flat, and the exclusions
                // are version-scoped, so the eight generate for real against R4 types.
                inPackage("hl7.fhir.us.core", [ensureDependency({ "hl7.fhir.uv.extensions.r4": "5.3.0" })]),
                inPackage("hl7.fhir.uv.xver-r5.r4", [ensureDependency({ "hl7.fhir.uv.extensions.r4": "5.3.0" })]),
                inPackage("hl7.terminology.r4", [ensureDependency({ "hl7.fhir.uv.extensions.r4": "5.3.0" })]),
                // Pre-split THO name, reached via hl7.fhir.uv.smart-app-launch@2.2.0; asks for 1.0.0.
                inPackage("hl7.terminology", [ensureDependency({ "hl7.fhir.uv.extensions.r4": "5.3.0" })]),
            ],
            // The builder injects builtinPatches only into loaders it constructs itself.
            // This manager is built by hand (we need the register up front to select the
            // CDA logical models for promoteLogical), and CM patches are constructor-time
            // configuration that cannot be attached afterwards — so the shipped input
            // fixes are applied explicitly here.
            indexEntry: builtinPatches.indexEntry,
            fhirResource: [
                // IVL_TS is a typo'd canonical in hl7.cda.uv.core (should be IVL-TS).
                inPackage("hl7.cda.uv.core", [
                    replaceText(
                        "http://hl7.org/cda/stds/core/StructureDefinition/IVL_TS",
                        "http://hl7.org/cda/stds/core/StructureDefinition/IVL-TS",
                    ),
                ]),
                // CarePlanAct binds moodCode to an external NLM ValueSet absent from every loaded
                // package; reuse the base Act binding.
                inPackage("hl7.cda.us.ccda", [
                    inResource("http://hl7.org/cda/us/ccda/StructureDefinition/CarePlanAct", [
                        replaceText(
                            "http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1267.37",
                            "http://terminology.hl7.org/ValueSet/v3-xDocumentActMood",
                        ),
                    ]),
                ]),
                // The resolved (R4) bundle-type CodeSystem lacks codes pinned by the R5
                // bundle profiles; patch every copy (resolveAny may pick any).
                // "subscription-notification" is a real R5 code; "bundle" is an R5 spec typo
                // for "batch" — FIXME: repair batch-bundle's patternCode instead (output-changing).
                ensureCodes("http://hl7.org/fhir/bundle-type", ["bundle", "subscription-notification"]),
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
        .outputTo("./examples/on-the-fly/ccda/fhir-types")
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
