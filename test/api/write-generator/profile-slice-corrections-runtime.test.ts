import { describe, expect, it } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, mkR4Register, type PFS, registerFs } from "@typeschema-test/utils";

const HELPERS_PATH = Path.join(__dirname, "../../../assets/api/writer-generator/typescript/profile-helpers.ts");

const SNOMED = "http://snomed.info/sct";
const METHOD_SYSTEM = "http://example.org/CodeSystem/method";

// Runtime behavior of the generated validator for system-only required coding
// slices, pinned via outcome snapshots (compare the emitted-text pins in
// profile-slice-corrections.test.ts). A system-only slice constrains which
// coding system a CodeableConcept must carry; the snapshots record what
// `validate()` actually reports for a resource coded from the wrong system.

type ProfileInstance = {
    validate: () => { errors: string[]; warnings: string[] };
};

type ProfileClass = {
    apply: (resource: Record<string, unknown>) => ProfileInstance;
};

/** Import the generated module next to a copy of the runtime helper asset. */
const loadProfileModule = async (relativePath: string, source: string): Promise<ProfileClass> => {
    const dir = await fs.mkdtemp(Path.join(os.tmpdir(), "codegen-slice-runtime-"));
    const dest = Path.join(dir, relativePath);
    await fs.mkdir(Path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, source);
    const helpersDest = Path.resolve(Path.dirname(dest), "../../profile-helpers.ts");
    await fs.copyFile(HELPERS_PATH, helpersDest);
    const mod = await import(dest);
    return mod.SystemOnlyCodingObservationProfile as ProfileClass;
};

describe("system-only coding slice runtime validation", async () => {
    const register = await mkR4Register();
    const pkg = { name: "codegen.test", version: "1.0.0" };

    const systemOnlyProfile: PFS = {
        description: "Observation profile with system-only required coding slices",
        derivation: "constraint",
        type: "Observation",
        name: "SystemOnlyCodingObservation",
        kind: "resource",
        url: "http://example.org/StructureDefinition/system-only-coding",
        base: "http://hl7.org/fhir/StructureDefinition/Observation",
        package_meta: pkg,
        required: ["bodySite"],
        elements: {
            bodySite: {
                type: "CodeableConcept",
                elements: {
                    coding: {
                        slicing: {
                            slices: { Snomed: { min: 1, match: { system: SNOMED } } },
                        },
                    },
                },
            },
            method: {
                type: "CodeableConcept",
                elements: {
                    coding: {
                        slicing: {
                            slices: { Method: { min: 1, match: { system: METHOD_SYSTEM } } },
                        },
                    },
                },
            },
        },
    };

    registerFs(register, systemOnlyProfile);

    const result = await new APIBuilder({ register, logger: mkErrorLogger() })
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .generate();
    const files = result.filesGenerated.typescript ?? {};
    const found = Object.entries(files).find(([path]) =>
        path.endsWith("profiles/Observation_SystemOnlyCodingObservation.ts"),
    );
    if (!found) throw new Error("generated profile module not found");
    const [modulePath, source] = found;
    const relativePath = modulePath.split("/").slice(-3).join("/");
    const Profile = await loadProfileModule(relativePath, source);

    const mkObservation = (bodySite: Record<string, unknown>, method?: Record<string, unknown>) => ({
        resourceType: "Observation",
        status: "final",
        code: { text: "example" },
        bodySite,
        ...(method ? { method } : {}),
    });

    it("bodySite coded from the wrong system", () => {
        const resource = mkObservation({ coding: [{ system: "http://example.org/other", code: "left-arm" }] });
        expect(Profile.apply(resource).validate().errors).toMatchSnapshot();
    });

    it("optional method coded from the wrong system", () => {
        const resource = mkObservation(
            { coding: [{ system: SNOMED, code: "368208006" }] },
            { coding: [{ system: "http://example.org/other", code: "manual" }] },
        );
        expect(Profile.apply(resource).validate().errors).toMatchSnapshot();
    });

    it("accepts codings from the constrained systems", () => {
        const resource = mkObservation(
            { coding: [{ system: SNOMED, code: "368208006" }] },
            { coding: [{ system: METHOD_SYSTEM, code: "manual" }] },
        );
        expect(Profile.apply(resource).validate().errors).toEqual([]);
    });

    it("absent optional method reports nothing about method", () => {
        const resource = mkObservation({ coding: [{ system: SNOMED, code: "368208006" }] });
        expect(Profile.apply(resource).validate().errors).toEqual([]);
    });
});
