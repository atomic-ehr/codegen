import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger } from "@typeschema-test/utils";

/** Find a generated file by path suffix, failing loudly when it is missing. */
const fileBySuffix = (files: Record<string, string>, suffix: string): string => {
    const key = Object.keys(files).find((k) => k.endsWith(suffix));
    if (!key) throw new Error(`No generated file matching '*${suffix}'. Files: ${Object.keys(files).join(", ")}`);
    return files[key] as string;
};

// Mirrors examples/on-the-fly/kbv-condition-diagnosis/generate.ts: the KBV
// profile type-slices Condition.onset[x]/abatement[x] with open slicing rules
// and restates Condition.subject with a profile reference target
// (KBV_PR_Base_Patient). The snapshots pin every pipeline stage — FHIR schema,
// TypeSchema, and generated TypeScript — for the profile and its base Condition.
describe("KBV Condition Diagnosis generation (kbv.basis@1.9.0)", async () => {
    const result = await new APIBuilder({
        canonicalManager: {
            registry: "https://packages.simplifier.net",
            packageIndex: "regenerate",
        },
        logger: mkErrorLogger(),
    })
        .fromPackage("kbv.basis", "1.9.0")
        .throwException()
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .typeSchema({
            treeShake: {
                "kbv.basis": {
                    "https://fhir.kbv.de/StructureDefinition/KBV_PR_Base_Condition_Diagnosis": {},
                },
            },
        })
        .introspection({
            inMemoryOnly: true,
            typeSchemas: { target: "type-schemas", profileSnapshots: true },
            fhirSchemas: "fhir-schemas",
        })
        .generate();

    const introspection = result.filesGenerated.introspection ?? {};
    const typescript = result.filesGenerated.typescript ?? {};

    it("should succeed", () => {
        expect(result.success).toBeTrue();
    });

    it("FHIR schema: Condition", () => {
        expect(
            fileBySuffix(introspection, "fhir-schemas/hl7.fhir.r4.core/Condition(Condition).json"),
        ).toMatchSnapshot();
    });

    it("TypeSchema: Condition", () => {
        expect(
            fileBySuffix(introspection, "type-schemas/hl7.fhir.r4.core/Condition(Condition).json"),
        ).toMatchSnapshot();
    });

    it("FHIR schema: KBV_PR_Base_Condition_Diagnosis", () => {
        expect(
            fileBySuffix(
                introspection,
                "fhir-schemas/kbv.basis/KBV_PR_Base_Condition_Diagnosis(KBV_PR_Base_Condition_Diagnosis).json",
            ),
        ).toMatchSnapshot();
    });

    it("TypeSchema: KBV_PR_Base_Condition_Diagnosis profile", () => {
        expect(
            fileBySuffix(
                introspection,
                "type-schemas/kbv.basis/KBV_PR_Base_Condition_Diagnosis(KBV_PR_Base_Condition_Diagnosis).json",
            ),
        ).toMatchSnapshot();
    });

    it("TypeSchema: KBV_PR_Base_Condition_Diagnosis snapshot", () => {
        expect(
            fileBySuffix(
                introspection,
                "type-schemas/kbv.basis/KBV_PR_Base_Condition_Diagnosis(KBV_PR_Base_Condition_Diagnosis).snapshot.json",
            ),
        ).toMatchSnapshot();
    });

    it("generated type: Condition.ts", () => {
        expect(fileBySuffix(typescript, "hl7-fhir-r4-core/Condition.ts")).toMatchSnapshot();
    });

    it("generated profile: Condition_KBV_PR_Base_Condition_Diagnosis.ts", () => {
        expect(fileBySuffix(typescript, "profiles/Condition_KBV_PR_Base_Condition_Diagnosis.ts")).toMatchSnapshot();
    });
});
