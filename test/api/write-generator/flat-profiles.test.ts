import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const mkBuilder = (shake: boolean) => {
    const roots = {
        "example.test.slicedchoice": {
            "http://example.test/StructureDefinition/sliced-choice-observation": {},
        },
        "example.test.nestedtypeindex": {
            "http://example.test/StructureDefinition/patient-bundle": {},
            "http://example.test/StructureDefinition/quantity-component-observation": {},
        },
    };
    return new APIBuilder({ logger: mkSilentLogger() })
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .localStructureDefinitions({
            package: { name: "example.test.slicedchoice", version: "0.0.1" },
            path: Path.join(__dirname, "../../assets/profile-sliced-choice"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .localStructureDefinitions({
            package: { name: "example.test.nestedtypeindex", version: "0.0.1" },
            path: Path.join(__dirname, "../../assets/profile-nested-type-index"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typeSchema({ ...(shake ? { treeShake: roots } : {}) })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .python({ inMemoryOnly: true, generateProfile: true, client: "none" });
};

describe("flat profile generation", () => {
    for (const shake of [false, true]) {
        it(`generates profiles with isolated backbone constraints${shake ? " after tree shaking" : ""}`, async () => {
            const result = await mkBuilder(shake).generate();
            expect(result.success, JSON.stringify(result.errors)).toBeTrue();
            const ts = result.filesGenerated.typescript!;
            const py = result.filesGenerated.python!;
            const sliced =
                ts["generated/types/example-test-slicedchoice/profiles/Observation_SlicedChoiceObservation.ts"]!;
            const quantity =
                ts[
                    "generated/types/example-test-nestedtypeindex/profiles/Observation_QuantityComponentObservation.ts"
                ]!;
            expect(sliced).toContain('"measuredFinding", [], [["valueQuantity","valueString"]])');
            expect(sliced).toContain("ObservationComponent");
            expect(quantity).not.toContain("QuantityComponentObservationComponent");
            expect(py["generated/example_test_slicedchoice/profiles/observation_sliced_choice_observation.py"]).toMatch(
                /from fhir_types\.hl7_fhir_r4_core\.observation import .*ObservationComponent/,
            );

            const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "flat-profile-generation-"));
            try {
                for (const [relative, content] of Object.entries({ ...ts, ...py })) {
                    const target = Path.join(dir, relative);
                    fs.mkdirSync(Path.dirname(target), { recursive: true });
                    fs.writeFileSync(target, content);
                }
                fs.writeFileSync(
                    Path.join(dir, "tsconfig.json"),
                    JSON.stringify({
                        compilerOptions: {
                            strict: true,
                            module: "ESNext",
                            moduleResolution: "bundler",
                            target: "ES2022",
                            skipLibCheck: true,
                            noEmit: true,
                        },
                        include: ["generated/**/*.ts"],
                    }),
                );
                const compile = spawnSync(
                    process.execPath,
                    [Bun.resolveSync("typescript/bin/tsc", import.meta.dir), "-p", dir],
                    { encoding: "utf8", timeout: 20_000 },
                );
                expect(compile.status, `${compile.stdout}${compile.stderr}`).toBe(0);
                const profilePath = Object.keys(ts).find((path) =>
                    path.endsWith("Observation_SlicedChoiceObservation.ts"),
                )!;
                const { SlicedChoiceObservationProfile } = await import(Path.join(dir, profilePath));
                const profile = SlicedChoiceObservationProfile.create({ status: "final", code: { text: "example" } });
                profile.setCodedFinding({ coding: [{ system: "http://example.test/finding", code: "present" }] });
                profile.setMeasuredFinding({ valueString: "test" });
                expect(() => SlicedChoiceObservationProfile.from(profile.toResource())).not.toThrow();
                const parse = spawnSync(
                    "python3",
                    [
                        "-c",
                        "import ast,pathlib,sys; [ast.parse(p.read_text(),filename=str(p)) for p in pathlib.Path(sys.argv[1]).rglob('*.py')]",
                        dir,
                    ],
                    { encoding: "utf8", timeout: 20_000 },
                );
                expect(parse.status, `${parse.stdout}${parse.stderr}`).toBe(0);
            } finally {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        });
    }
});
