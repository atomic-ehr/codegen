import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";
import ts from "typescript";

const output = await mkdtemp(Path.join(tmpdir(), "complex-extension-input-"));
afterAll(() => rm(output, { recursive: true, force: true }));

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
    const profilePath = (name: string) => {
        const path = Object.keys(files).find((path) => path.endsWith(`/Extension_${name}.ts`));
        if (!path) throw new Error(`Missing profile ${name}`);
        return Path.join(output, path);
    };

    it("typechecks required, optional, raw, and flat factory calls", async () => {
        const consumer = Path.join(output, "consumer.ts");
        await writeFile(
            consumer,
            `
import { RequiredComplexExtensionProfile as Required } from ${JSON.stringify(profilePath("RequiredComplexExtension"))};
import { OptionalComplexExtensionProfile as Optional } from ${JSON.stringify(profilePath("OptionalComplexExtension"))};
import { IdentifiedComplexExtensionProfile as Identified } from ${JSON.stringify(profilePath("IdentifiedComplexExtension"))};
Required.createResource({ requiredValue: "present" });
Required.create({ extension: [{ url: "requiredValue", valueString: "present" }] });
// @ts-expect-error Required sub-extension input cannot be omitted.
Required.createResource();
// @ts-expect-error The wrapper has the same required input contract.
Required.create();
Optional.createResource();
Optional.create();
Identified.createResource({ id: "known", optionalValue: "present" });
Identified.create({ id: "known", extension: [] });
// @ts-expect-error Flat inputs must retain required ordinary fields.
Identified.createResource({ optionalValue: "present" });
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

    it("builds required sub-extensions and preserves ordinary required fields", async () => {
        const { RequiredComplexExtensionProfile: Required } = await import(profilePath("RequiredComplexExtension"));
        const { OptionalComplexExtensionProfile: Optional } = await import(profilePath("OptionalComplexExtension"));
        const { IdentifiedComplexExtensionProfile: Identified } = await import(
            profilePath("IdentifiedComplexExtension")
        );
        expect(Required.createResource({ requiredValue: "present" })).toEqual({
            url: "http://example.test/StructureDefinition/required-complex-extension",
            extension: [{ url: "requiredValue", valueString: "present" }],
        });
        expect(Optional.createResource().extension).toEqual([]);
        expect(Identified.createResource({ id: "known", optionalValue: "present" })).toEqual({
            id: "known",
            url: "http://example.test/StructureDefinition/identified-complex-extension",
            extension: [{ url: "optionalValue", valueString: "present" }],
        });
    });
});
