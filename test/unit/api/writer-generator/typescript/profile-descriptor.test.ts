import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, r4Manager } from "@typeschema-test/utils";

const PROFILE_PATH = "generated/types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight.ts";
const PROFILE_IMPORT = "./generated/types/hl7-fhir-r4-core/profiles/Observation_observation_bodyweight";
const TSC_PATH = Bun.resolveSync("typescript/bin/tsc", import.meta.dir);

const consumerSource = `import { observation_bodyweightProfile } from "${PROFILE_IMPORT}";

type ProfileDescriptor = {
    readonly resourceType: string;
    readonly canonicalUrl: string;
    from(resource: unknown): unknown;
    createResource(args: unknown): unknown;
};

const _descriptor: ProfileDescriptor = observation_bodyweightProfile;
const _resourceType: "Observation" = observation_bodyweightProfile.resourceType;
// @ts-expect-error The descriptor cannot be changed by callers.
observation_bodyweightProfile.resourceType = "Patient";
void [_descriptor, _resourceType];
`;

describe("generated profile structural descriptor", () => {
    test("a generated profile class is assignable to a generic FHIR client descriptor", async () => {
        const result = await new APIBuilder({ register: r4Manager, logger: mkErrorLogger() })
            .typeSchema({
                treeShake: {
                    "hl7.fhir.r4.core": {
                        "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
                    },
                },
            })
            .typescript({
                inMemoryOnly: true,
                withDebugComment: false,
                generateProfile: true,
                openResourceTypeSet: false,
            })
            .generate();

        expect(result.success).toBeTrue();
        const files = result.filesGenerated.typescript!;
        expect(files[PROFILE_PATH]).toBeDefined();

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "profile-descriptor-"));
        try {
            for (const [relPath, content] of Object.entries(files)) {
                const absPath = path.join(tmpDir, relPath);
                fs.mkdirSync(path.dirname(absPath), { recursive: true });
                fs.writeFileSync(absPath, content);
            }
            const { observation_bodyweightProfile } = await import(path.join(tmpDir, PROFILE_PATH));
            expect(observation_bodyweightProfile.resourceType).toBe("Observation");
            expect(observation_bodyweightProfile.canonicalUrl).toBe(
                "http://hl7.org/fhir/StructureDefinition/bodyweight",
            );
            const resource = observation_bodyweightProfile.createResource({ status: "final" });
            expect(resource.resourceType).toBe(observation_bodyweightProfile.resourceType);
            fs.writeFileSync(path.join(tmpDir, "consumer.ts"), consumerSource);
            fs.writeFileSync(
                path.join(tmpDir, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        strict: true,
                        module: "esnext",
                        moduleResolution: "bundler",
                        target: "esnext",
                        skipLibCheck: true,
                        noEmit: true,
                    },
                    include: ["consumer.ts", "generated/**/*.ts"],
                }),
            );

            const tsc = spawnSync(process.execPath, [TSC_PATH, "--noEmit", "-p", "tsconfig.json"], {
                cwd: tmpDir,
                encoding: "utf8",
                timeout: 20_000,
            });
            expect(tsc.status, `${tsc.error?.message ?? ""}${tsc.stdout}${tsc.stderr}`).toBe(0);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }, 30_000);
});
