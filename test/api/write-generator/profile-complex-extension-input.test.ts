import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkCodegenLogger } from "@root/utils/log";
import { mkSilentLogger } from "@typeschema-test/utils";
import ts from "typescript";

const output = await mkdtemp(Path.join(tmpdir(), "complex-extension-input-"));
const collisionOutput = await mkdtemp(Path.join(tmpdir(), "complex-extension-collision-"));
afterAll(() => Promise.all([output, collisionOutput].map((path) => rm(path, { recursive: true, force: true }))));

/**
 * Expected-value provenance for the resource-profile getter contract:
 * - worked_example_pointer: atomic-ehr/codegen#224 maintainer review, "complex extension getter output contracts"
 * - fixture_path: test/assets/profile-complex-extension-input/complex-extension-host.json
 * - selector: differential.element[Patient.extension:identifiedComplex].type[0].profile[0]
 * - ig_canonical: http://example.test/StructureDefinition/identified-complex-extension
 * - element: Extension.extension slicing members optionalValue, requiredNote, and hyphenated-note
 * - ig_canonical: http://hl7.org/fhir/StructureDefinition/patient-animal
 * - element: Extension.extension:species
 */
describe("Complex Extension factory input", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.complexextensioninput", version: "0.1.0" },
            path: Path.join(__dirname, "../../assets/profile-complex-extension-input"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();
    if (!result.success) throw new Error("Profile generation failed");
    const files = result.filesGenerated.typescript ?? {};
    for (const [path, content] of Object.entries(files)) {
        const destination = Path.join(output, path);
        await mkdir(Path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
    }
    const profilePath = (base: "Extension" | "Patient", name: string) => {
        const path = Object.keys(files).find((path) => path.endsWith(`/${base}_${name}.ts`));
        if (!path) throw new Error(`Missing profile ${name}`);
        return Path.join(output, path);
    };
    const extensionProfilePath = (name: string) => profilePath("Extension", name);
    const hostProfilePath = profilePath("Patient", "ComplexExtensionHost");

    it("typechecks required, optional, raw, and flat factory calls", async () => {
        const consumer = Path.join(output, "consumer.ts");
        await writeFile(
            consumer,
            `
import { RequiredComplexExtensionProfile as Required } from ${JSON.stringify(extensionProfilePath("RequiredComplexExtension"))};
import { OptionalComplexExtensionProfile as Optional } from ${JSON.stringify(extensionProfilePath("OptionalComplexExtension"))};
import { IdentifiedComplexExtensionProfile as Identified } from ${JSON.stringify(extensionProfilePath("IdentifiedComplexExtension"))};
Required.createResource({ requiredValue: "present" });
Required.create({ extension: [{ url: "requiredValue", valueString: "present" }] });
// @ts-expect-error Required sub-extension input cannot be omitted.
Required.createResource();
// @ts-expect-error The wrapper has the same required input contract.
Required.create();
Optional.createResource();
Optional.create();
Identified.createResource({ id: "known", requiredNote: "required", optionalValue: "present" });
Identified.create({ id: "known", extension: [] });
// @ts-expect-error Flat inputs must retain required ordinary fields.
Identified.createResource({ requiredNote: "required", optionalValue: "present" });
// @ts-expect-error The complex extension factory keeps its mandatory argument.
Identified.createResource();
`,
        );
        const program = ts.createProgram([consumer], {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.Preserve,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowImportingTsExtensions: true,
            types: [],
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        expect(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCurrentDirectory: () => output,
                getCanonicalFileName: (path) => path,
                getNewLine: () => "\n",
            }),
        ).toBe("");
    });

    it("projects complex extension getters without weakening setter and factory inputs", async () => {
        const consumer = Path.join(output, "resource-profile-consumer.ts");
        await writeFile(
            consumer,
            `
import {
    ComplexExtensionHostProfile as Host,
    type ComplexExtensionHost_AnimalFlat,
} from ${JSON.stringify(hostProfilePath)};
import {
    IdentifiedComplexExtensionProfile as Identified,
    type IdentifiedComplexExtensionProfileFlat,
} from ${JSON.stringify(extensionProfilePath("IdentifiedComplexExtension"))};

type Equal<Left, Right> =
    (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2) ? true : false;
type Expect<T extends true> = T;

const host = Host.create();
host.setIdentifiedComplex({ id: "known", requiredNote: "required", optionalValue: "optional" });
Identified.createResource({ id: "known", requiredNote: "required" });
// @ts-expect-error The profile-backed Flat setter keeps ordinary and required sub-extension inputs mandatory.
host.setIdentifiedComplex({ optionalValue: "optional" });

const profileBacked = host.getIdentifiedComplex();
type ProfileBackedOutput = Expect<
    Equal<
        NonNullable<typeof profileBacked>,
        Partial<Pick<IdentifiedComplexExtensionProfileFlat, "optionalValue" | "requiredNote" | "hyphenatedNote">>
    >
>;
const profileBackedOptionalOnly: NonNullable<typeof profileBacked> = { optionalValue: "optional" };
profileBackedOptionalOnly.requiredNote?.toUpperCase();
// @ts-expect-error Flat getters exclude ordinary fields from the extension profile.
profileBackedOptionalOnly.id;
if (profileBackedOptionalOnly) {
    // @ts-expect-error A getter cannot promise that a profile-required sub-extension is present on raw input.
    const requiredNote: string = profileBackedOptionalOnly.requiredNote;
}

const raw = host.getIdentifiedComplex("raw");
if (raw) host.setIdentifiedComplex(raw);
const profile = host.getIdentifiedComplex("profile");
if (profile) host.setIdentifiedComplex(profile);

host.setAnimal({ species: { text: "cat" } });
const inline = host.getAnimal();
type InlineOutput = Expect<Equal<NonNullable<typeof inline>, Partial<ComplexExtensionHost_AnimalFlat>>>;
const inlineOptionalOnly: NonNullable<typeof inline> = {};
inlineOptionalOnly.species?.text;
`,
        );
        const program = ts.createProgram([consumer], {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.Preserve,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowImportingTsExtensions: true,
            types: [],
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        expect(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCurrentDirectory: () => output,
                getCanonicalFileName: (path) => path,
                getNewLine: () => "\n",
            }),
        ).toBe("");

        const { ComplexExtensionHostProfile: Host } = await import(hostProfilePath);
        const host = Host.create().setIdentifiedComplex({
            id: "known",
            requiredNote: "required",
            optionalValue: "optional",
        });
        const expectedRaw = {
            id: "known",
            url: "http://example.test/StructureDefinition/identified-complex-extension",
            extension: [
                { url: "optionalValue", valueString: "optional" },
                { url: "requiredNote", valueString: "required" },
            ],
        };
        expect(host.getIdentifiedComplex("raw")).toEqual(expectedRaw);
        host.setIdentifiedComplex(host.getIdentifiedComplex("raw")!);
        expect(host.getIdentifiedComplex("raw")).toEqual(expectedRaw);
        host.setIdentifiedComplex(host.getIdentifiedComplex("profile")!);
        expect(host.getIdentifiedComplex("raw")).toEqual(expectedRaw);
        expect(host.getIdentifiedComplex()).toEqual({ optionalValue: "optional", requiredNote: "required" });
    });

    it("builds required sub-extensions and preserves ordinary required fields", async () => {
        const { RequiredComplexExtensionProfile: Required } = await import(
            extensionProfilePath("RequiredComplexExtension")
        );
        const { OptionalComplexExtensionProfile: Optional } = await import(
            extensionProfilePath("OptionalComplexExtension")
        );
        const { IdentifiedComplexExtensionProfile: Identified } = await import(
            extensionProfilePath("IdentifiedComplexExtension")
        );
        expect(Required.createResource({ requiredValue: "present" })).toEqual({
            url: "http://example.test/StructureDefinition/required-complex-extension",
            extension: [{ url: "requiredValue", valueString: "present" }],
        });
        expect(Optional.createResource().extension).toEqual([]);
        expect(Identified.createResource({ id: "known", requiredNote: "required", optionalValue: "present" })).toEqual({
            id: "known",
            url: "http://example.test/StructureDefinition/identified-complex-extension",
            extension: [
                { url: "optionalValue", valueString: "present" },
                { url: "requiredNote", valueString: "required" },
            ],
        });
    });

    /**
     * Expected-value provenance for collision fallback:
     * - worked_example_pointer: atomic-ehr/codegen#224 maintainer review, "flat collision raw-only fallback"
     * - fixture_path: test/assets/profile-complex-extension-input/collision/colliding-complex-extension.json
     * - selector: differential.element[Extension.extension:id].type[0].code
     * - ig_canonical: http://example.test/StructureDefinition/colliding-complex-extension
     * - element: Extension.id and Extension.extension:id normalized member id
     * - fixture_path: test/assets/profile-complex-extension-input/collision/collision-host.json
     * - selector: differential.element[Patient.extension:colliding].type[0].profile[0]
     */
    it("falls back to raw-only factories when Flat members collide", async () => {
        const logger = mkCodegenLogger({ level: "SILENT" });
        const result = await new APIBuilder({ logger })
            .localStructureDefinitions({
                package: { name: "example.test.complexextensioncollision", version: "0.1.0" },
                path: Path.join(__dirname, "../../assets/profile-complex-extension-input/collision"),
                dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
            })
            .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
            .generate();

        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
        const collisionCanonical = "http://example.test/StructureDefinition/colliding-complex-extension";
        const collisionDiagnostic = logger
            .buffer()
            .find((entry) => entry.level === "ERROR" && entry.message.includes(collisionCanonical))?.message;
        expect(collisionDiagnostic).toContain(collisionCanonical);
        expect(collisionDiagnostic).toMatch(/\bid\b/);

        const collisionFiles = result.filesGenerated.typescript ?? {};
        for (const [path, content] of Object.entries(collisionFiles)) {
            const destination = Path.join(collisionOutput, path);
            await mkdir(Path.dirname(destination), { recursive: true });
            await writeFile(destination, content);
        }
        const collisionProfilePath = Object.keys(collisionFiles).find((path) =>
            path.endsWith("/Extension_CollidingComplexExtension.ts"),
        );
        const collisionHostPath = Object.keys(collisionFiles).find((path) =>
            path.endsWith("/Patient_CollisionHost.ts"),
        );
        if (!collisionProfilePath || !collisionHostPath) throw new Error("Missing generated collision profiles");
        const absoluteCollisionProfilePath = Path.join(collisionOutput, collisionProfilePath);
        const absoluteCollisionHostPath = Path.join(collisionOutput, collisionHostPath);
        const collisionProfileSource = collisionFiles[collisionProfilePath] ?? "";
        const collisionHostSource = collisionFiles[collisionHostPath] ?? "";
        expect(collisionProfileSource).toContain("export type CollidingComplexExtensionProfileFlat = never");
        expect(collisionHostSource).not.toMatch(/export type \w*Collid\w*Flat/);

        const consumer = Path.join(collisionOutput, "collision-consumer.ts");
        await writeFile(
            consumer,
            `
import {
    CollidingComplexExtensionProfile as Colliding,
    type CollidingComplexExtensionProfileFlat,
} from ${JSON.stringify(absoluteCollisionProfilePath)};
import { CollisionHostProfile as Host } from ${JSON.stringify(absoluteCollisionHostPath)};

type Equal<Left, Right> =
    (<T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2) ? true : false;
type Expect<T extends true> = T;
type FlatIsUnusable = Expect<Equal<CollidingComplexExtensionProfileFlat, never>>;

const rawInput = { id: "ordinary", extension: [{ url: "id", valueInteger: 7 }] };
Colliding.createResource(rawInput);
const collidingProfile = Colliding.create(rawInput);
// @ts-expect-error A collision fallback requires the Raw extension discriminator.
Colliding.createResource({ id: "ordinary" });

const host = Host.create().setColliding(collidingProfile);
const raw = host.getColliding("raw");
if (raw) host.setColliding(raw);
const profile = host.getColliding("profile");
if (profile) host.setColliding(profile);

const flat = host.getColliding();
type HonestAnonymousFlat = Expect<Equal<NonNullable<typeof flat>, Partial<{ id: number }>>>;
flat?.id?.toFixed();
if (flat) {
    // @ts-expect-error The anonymous getter projection is not a writable Flat factory input.
    host.setColliding(flat);
}
`,
        );
        const program = ts.createProgram([consumer], {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.Preserve,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowImportingTsExtensions: true,
            types: [],
        });
        const diagnostics = ts.getPreEmitDiagnostics(program);
        expect(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCurrentDirectory: () => collisionOutput,
                getCanonicalFileName: (path) => path,
                getNewLine: () => "\n",
            }),
        ).toBe("");

        const { CollidingComplexExtensionProfile: Colliding } = await import(absoluteCollisionProfilePath);
        const { CollisionHostProfile: Host } = await import(absoluteCollisionHostPath);
        const rawInput = { id: "ordinary", extension: [{ url: "id", valueInteger: 7 }] };
        const expectedRaw = {
            id: "ordinary",
            url: collisionCanonical,
            extension: [{ url: "id", valueInteger: 7 }],
        };
        expect(Colliding.createResource(rawInput)).toEqual(expectedRaw);
        const host = Host.create().setColliding(Colliding.create(rawInput));
        expect(host.getColliding("raw")).toEqual(expectedRaw);
        host.setColliding(host.getColliding("profile")!);
        expect(host.getColliding("raw")).toEqual(expectedRaw);
        host.setColliding(host.getColliding("raw")!);
        expect(host.getColliding("raw")).toEqual(expectedRaw);
        expect(host.getColliding()).toEqual({ id: 7 });
    });
});
