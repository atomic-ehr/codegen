import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import type { PreprocessContext } from "@atomic-ehr/fhir-canonical-manager";
import type { GenerationReport } from "@root/api/builder";
import {
    type BuilderFactoryOptions,
    describeGenerateConfig,
    GenerateConfigError,
    type GenerationBuilder,
    mkForceDependenciesPreprocessor,
    parseGenerateConfig,
    runGenerateConfig,
} from "@root/api/generate-config";

const CONFIG_PATH = "/tmp/atomic-codegen-fixture/codegen.json";
const CONFIG_DIR = Path.dirname(CONFIG_PATH);

type Call = { method: string; args: unknown[] };

type Recording = {
    builder: GenerationBuilder;
    calls: Call[];
};

const mkReport = (success: boolean, errors: string[]): GenerationReport => ({
    success,
    outputDir: "",
    filesGenerated: {},
    errors,
    warnings: [],
    duration: 0,
});

/** A GenerationBuilder that records every call instead of touching FHIR packages or the disk. */
const mkRecordingBuilder = (outcome: { success?: boolean; errors?: string[]; throws?: string } = {}): Recording => {
    const calls: Call[] = [];
    const record =
        (method: string) =>
        (...args: unknown[]): GenerationBuilder => {
            calls.push({ method, args });
            return builder;
        };
    const builder: GenerationBuilder = {
        fromPackage: record("fromPackage") as GenerationBuilder["fromPackage"],
        fromPackageRef: record("fromPackageRef") as GenerationBuilder["fromPackageRef"],
        localTgzPackage: record("localTgzPackage") as GenerationBuilder["localTgzPackage"],
        localStructureDefinitions: record(
            "localStructureDefinitions",
        ) as GenerationBuilder["localStructureDefinitions"],
        typeSchema: record("typeSchema") as GenerationBuilder["typeSchema"],
        introspection: record("introspection") as GenerationBuilder["introspection"],
        typescript: record("typescript") as GenerationBuilder["typescript"],
        python: record("python") as GenerationBuilder["python"],
        csharp: record("csharp") as GenerationBuilder["csharp"],
        outputTo: record("outputTo") as GenerationBuilder["outputTo"],
        cleanOutput: record("cleanOutput") as GenerationBuilder["cleanOutput"],
        throwException: record("throwException") as GenerationBuilder["throwException"],
        generate: async () => {
            calls.push({ method: "generate", args: [] });
            if (outcome.throws) throw new Error(outcome.throws);
            return mkReport(outcome.success ?? true, outcome.errors ?? []);
        },
    };
    return { builder, calls };
};

const mkFactory = (
    outcomes: Record<string, { success?: boolean; errors?: string[]; throws?: string }> = {},
): {
    createBuilder: (options: BuilderFactoryOptions) => GenerationBuilder;
    recordings: Recording[];
    seen: BuilderFactoryOptions[];
} => {
    const recordings: Recording[] = [];
    const seen: BuilderFactoryOptions[] = [];
    let index = 0;
    const createBuilder = (options: BuilderFactoryOptions): GenerationBuilder => {
        seen.push(options);
        const outcome = outcomes[String(index)] ?? {};
        index += 1;
        const recording = mkRecordingBuilder(outcome);
        recordings.push(recording);
        return recording.builder;
    };
    return { createBuilder, recordings, seen };
};

const validConfig = () => ({
    version: 1,
    builders: [
        {
            name: "core",
            fromPackages: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
            typescript: {},
            outputTo: "./out/core",
        },
    ],
});

const methodsOf = (recording: Recording): string[] => recording.calls.map((call) => call.method);

describe("parseGenerateConfig", () => {
    it("accepts a minimal valid config", () => {
        const config = parseGenerateConfig(validConfig(), CONFIG_PATH);

        expect(config.version).toBe(1);
        expect(config.builders).toHaveLength(1);
        expect(config.builders[0]!.name).toBe("core");
    });

    it("rejects an unknown key in a builder and names it", () => {
        const raw = validConfig();
        (raw.builders[0] as Record<string, unknown>).typscript = {};

        expect(() => parseGenerateConfig(raw, CONFIG_PATH)).toThrow(GenerateConfigError);
        try {
            parseGenerateConfig(raw, CONFIG_PATH);
        } catch (error) {
            const issues = (error as GenerateConfigError).issues;
            expect(issues).toHaveLength(1);
            expect(issues[0]!.path).toBe("builders[0].typscript");
            expect(issues[0]!.message).toContain('unknown key "typscript"');
            expect(issues[0]!.message).toContain("typescript");
        }
    });

    it("rejects an unknown key at the root and inside options", () => {
        const raw = { ...validConfig(), buidlers: [], options: { registryy: "https://example.org" } };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const paths = (error as GenerateConfigError).issues.map((issue) => issue.path);
            expect(paths).toContain("buidlers");
            expect(paths).toContain("options.registryy");
        }
    });

    it("rejects an unknown tree shake rule key", () => {
        const raw = validConfig();
        (raw.builders[0] as Record<string, unknown>).typeSchema = {
            treeShake: {
                "hl7.fhir.r4.core": { "http://hl7.org/fhir/StructureDefinition/Patient": { ignoreField: [] } },
            },
        };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issues = (error as GenerateConfigError).issues;
            expect(issues[0]!.path).toBe(
                "builders[0].typeSchema.treeShake.hl7.fhir.r4.core.http://hl7.org/fhir/StructureDefinition/Patient.ignoreField",
            );
            expect(issues[0]!.message).toContain('unknown key "ignoreField"');
        }
    });

    it("reports a missing outputTo", () => {
        const raw = validConfig();
        delete (raw.builders[0] as Record<string, unknown>).outputTo;

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issues = (error as GenerateConfigError).issues;
            expect(issues).toHaveLength(1);
            expect(issues[0]!.path).toBe("builders[0].outputTo");
            expect(issues[0]!.message).toContain("outputTo is required");
        }
    });

    it("reports an empty builders array", () => {
        try {
            parseGenerateConfig({ version: 1, builders: [] }, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issues = (error as GenerateConfigError).issues;
            expect(issues).toHaveLength(1);
            expect(issues[0]!.path).toBe("builders");
            expect(issues[0]!.message).toContain("at least one builder");
        }
    });

    it("reports a version of the wrong type", () => {
        const raw = { ...validConfig(), version: "1" };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issues = (error as GenerateConfigError).issues;
            expect(issues).toHaveLength(1);
            expect(issues[0]!.path).toBe("version");
            expect(issues[0]!.message).toContain("expected the number 1");
            expect(issues[0]!.message).toContain('a string ("1")');
        }
    });

    it("reports an unsupported version number distinctly from a wrong type", () => {
        const raw = { ...validConfig(), version: 2 };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            expect((error as GenerateConfigError).issues[0]!.message).toContain("unsupported config version 2");
        }
    });

    it("reports a builder without any input", () => {
        const raw = { version: 1, builders: [{ name: "core", typescript: {}, outputTo: "./out" }] };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            expect((error as GenerateConfigError).issues[0]!.message).toContain("no input configured");
        }
    });

    it("reports a builder without any output generator", () => {
        const raw = {
            version: 1,
            builders: [
                { name: "core", fromPackages: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }], outputTo: "./out" },
            ],
        };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            expect((error as GenerateConfigError).issues[0]!.message).toContain("no output generator configured");
        }
    });

    it("reports duplicate builder names", () => {
        const raw = validConfig();
        raw.builders.push({ ...raw.builders[0]!, outputTo: "./out/other" });

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            expect((error as GenerateConfigError).issues[0]!.message).toContain('duplicate builder name "core"');
        }
    });

    it("reports a duplicate output directory between builders", () => {
        const raw = validConfig();
        raw.builders.push({ ...raw.builders[0]!, name: "other" });

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issue = (error as GenerateConfigError).issues[0]!;
            expect(issue.path).toBe("builders[1].outputTo");
            expect(issue.message).toContain('duplicates the output directory of builder "core"');
        }
    });

    it("reports an output directory nested inside another builder's output", () => {
        const raw = validConfig();
        raw.builders.push({ ...raw.builders[0]!, name: "other", outputTo: "./out/core/nested" });

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issue = (error as GenerateConfigError).issues[0]!;
            expect(issue.path).toBe("builders[1].outputTo");
            expect(issue.message).toContain('is nested inside the output directory of builder "core"');
        }
    });

    it("collects every problem instead of stopping at the first", () => {
        const raw = {
            version: "1",
            builders: [
                { name: "a", fromPackages: [{ name: "x", version: "1.0.0" }], typescript: {} },
                {
                    name: "b",
                    fromPackages: [{ name: "x", version: "1.0.0" }],
                    typescript: {},
                    nope: true,
                    outputTo: "./b",
                },
            ],
        };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const paths = (error as GenerateConfigError).issues.map((issue) => issue.path);
            expect(paths).toEqual(["version", "builders[0].outputTo", "builders[1].nope"]);
        }
    });

    it("resolves relative paths against the config file directory, not the process cwd", () => {
        const raw = {
            version: 1,
            builders: [
                {
                    name: "core",
                    localTgzPackages: ["./archives/local.tgz"],
                    localStructureDefinitions: [
                        { package: { name: "x", version: "1.0.0" }, path: "../shared/structure-definitions" },
                    ],
                    typescript: {},
                    outputTo: "./out/core",
                },
            ],
        };

        const config = parseGenerateConfig(raw, CONFIG_PATH);
        const builder = config.builders[0]!;

        expect(builder.outputTo).toBe(Path.join(CONFIG_DIR, "out/core"));
        expect(builder.localTgzPackages).toEqual([Path.join(CONFIG_DIR, "archives/local.tgz")]);
        expect(builder.localStructureDefinitions![0]!.path).toBe(
            Path.resolve(CONFIG_DIR, "../shared/structure-definitions"),
        );
        expect(builder.outputTo.startsWith(process.cwd())).toBe(false);
    });

    it("keeps absolute paths untouched", () => {
        const raw = validConfig();
        raw.builders[0]!.outputTo = "/srv/generated/core";

        expect(parseGenerateConfig(raw, CONFIG_PATH).builders[0]!.outputTo).toBe("/srv/generated/core");
    });
});

describe("runGenerateConfig", () => {
    it("applies one builder's configuration in a fixed order", async () => {
        const config = parseGenerateConfig(
            {
                version: 1,
                builders: [
                    {
                        name: "core",
                        fromPackages: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
                        fromPackageRefs: ["https://example.org/package.tgz"],
                        localTgzPackages: ["./local.tgz"],
                        localStructureDefinitions: [{ package: { name: "x", version: "1.0.0" }, path: "./sds" }],
                        typeSchema: { treeShake: {} },
                        introspection: { typeTree: "tree.json" },
                        typescript: { generateProfile: true },
                        outputTo: "./out/core",
                        cleanOutput: true,
                        throwException: true,
                    },
                ],
            },
            CONFIG_PATH,
        );
        const factory = mkFactory();

        const result = await runGenerateConfig(config, { createBuilder: factory.createBuilder });

        expect(result.success).toBe(true);
        expect(methodsOf(factory.recordings[0]!)).toEqual([
            "fromPackage",
            "fromPackageRef",
            "localTgzPackage",
            "localStructureDefinitions",
            "typeSchema",
            "introspection",
            "typescript",
            "outputTo",
            "cleanOutput",
            "throwException",
            "generate",
        ]);
    });

    it("passes resolved values through to the builder", async () => {
        const config = parseGenerateConfig(validConfig(), CONFIG_PATH);
        const factory = mkFactory();

        await runGenerateConfig(config, { createBuilder: factory.createBuilder });
        const calls = factory.recordings[0]!.calls;

        expect(calls.find((call) => call.method === "fromPackage")!.args).toEqual(["hl7.fhir.r4.core", "4.0.1"]);
        expect(calls.find((call) => call.method === "outputTo")!.args).toEqual([Path.join(CONFIG_DIR, "out/core")]);
    });

    it("runs multiple builders in config order", async () => {
        const raw = validConfig();
        raw.builders.push({
            name: "dental",
            fromPackages: [{ name: "example.dental", version: "1.0.0" }],
            typescript: {},
            outputTo: "./out/dental",
        });
        const config = parseGenerateConfig(raw, CONFIG_PATH);
        const factory = mkFactory();

        const result = await runGenerateConfig(config, { createBuilder: factory.createBuilder });

        expect(result.builders.map((builder) => builder.name)).toEqual(["core", "dental"]);
        expect(factory.recordings).toHaveLength(2);
        expect(factory.recordings[1]!.calls.find((call) => call.method === "fromPackage")!.args).toEqual([
            "example.dental",
            "1.0.0",
        ]);
    });

    it("attempts every builder even after one fails and reports all failures", async () => {
        const raw = validConfig();
        raw.builders.push({
            name: "broken",
            fromPackages: [{ name: "example.broken", version: "1.0.0" }],
            typescript: {},
            outputTo: "./out/broken",
        });
        raw.builders.push({
            name: "tail",
            fromPackages: [{ name: "example.tail", version: "1.0.0" }],
            typescript: {},
            outputTo: "./out/tail",
        });
        const config = parseGenerateConfig(raw, CONFIG_PATH);
        const factory = mkFactory({
            "0": { success: false, errors: ["typescript generator failed: boom"] },
            "1": { throws: "canonical manager exploded" },
        });

        const result = await runGenerateConfig(config, { createBuilder: factory.createBuilder });

        expect(result.success).toBe(false);
        expect(result.builders.map((builder) => builder.success)).toEqual([false, false, true]);
        expect(result.builders[0]!.errors).toEqual(["typescript generator failed: boom"]);
        expect(result.builders[1]!.errors).toEqual(["canonical manager exploded"]);
        expect(factory.recordings).toHaveLength(3);
        expect(methodsOf(factory.recordings[2]!)).toContain("generate");
    });

    it("omits cleanOutput and throwException when the config does not set them", async () => {
        const config = parseGenerateConfig(validConfig(), CONFIG_PATH);
        const factory = mkFactory();

        await runGenerateConfig(config, { createBuilder: factory.createBuilder });

        expect(methodsOf(factory.recordings[0]!)).not.toContain("cleanOutput");
        expect(methodsOf(factory.recordings[0]!)).not.toContain("throwException");
    });

    it("lets a builder override the shared throwException default", async () => {
        const raw = { ...validConfig(), options: { throwException: true } };
        raw.builders.push({
            name: "lenient",
            fromPackages: [{ name: "example.lenient", version: "1.0.0" }],
            typescript: {},
            outputTo: "./out/lenient",
            throwException: false,
        } as (typeof raw.builders)[number]);
        const config = parseGenerateConfig(raw, CONFIG_PATH);
        const factory = mkFactory();

        await runGenerateConfig(config, { createBuilder: factory.createBuilder });

        const inherited = factory.recordings[0]!.calls.find((call) => call.method === "throwException");
        const overridden = factory.recordings[1]!.calls.find((call) => call.method === "throwException");
        expect(inherited!.args).toEqual([true]);
        expect(overridden!.args).toEqual([false]);
    });

    it("forwards shared options to the builder factory", async () => {
        const raw = {
            ...validConfig(),
            options: {
                registry: "https://example.org/pkgs/",
                ignorePackageIndex: true,
                dropCanonicalManagerCache: true,
            },
        };
        const config = parseGenerateConfig(raw, CONFIG_PATH);
        const factory = mkFactory();

        await runGenerateConfig(config, { createBuilder: factory.createBuilder });

        expect(factory.seen[0]!.registry).toBe("https://example.org/pkgs/");
        expect(factory.seen[0]!.ignorePackageIndex).toBe(true);
        expect(factory.seen[0]!.dropCanonicalManagerCache).toBe(true);
        expect(factory.seen[0]!.preprocessPackage).toBeUndefined();
    });
});

describe("forceDependencies", () => {
    const packageContext = (dependencies: Record<string, string>): PreprocessContext => ({
        kind: "package",
        package: { name: "example.package", version: "1.0.0" },
        packageJson: { name: "example.package", version: "1.0.0", dependencies },
    });

    it("rewrites a declared dependency version", () => {
        const preprocess = mkForceDependenciesPreprocessor({ "de.basisprofil.r4": "1.6.0-ballot2" });

        const result = preprocess(packageContext({ "de.basisprofil.r4": "1.5.4", "hl7.fhir.r4.core": "4.0.1" }));

        expect(result.kind).toBe("package");
        expect(result.kind === "package" && result.packageJson.dependencies).toEqual({
            "de.basisprofil.r4": "1.6.0-ballot2",
            "hl7.fhir.r4.core": "4.0.1",
        });
    });

    it("does not add a dependency the package never declared", () => {
        const preprocess = mkForceDependenciesPreprocessor({ "de.basisprofil.r4": "1.6.0-ballot2" });

        const result = preprocess(packageContext({ "hl7.fhir.r4.core": "4.0.1" }));

        expect(result.kind === "package" && result.packageJson.dependencies).toEqual({ "hl7.fhir.r4.core": "4.0.1" });
    });

    it("leaves resource contexts untouched", () => {
        const preprocess = mkForceDependenciesPreprocessor({ "de.basisprofil.r4": "1.6.0-ballot2" });
        const context: PreprocessContext = {
            kind: "resource",
            package: { name: "example.package", version: "1.0.0" },
            resource: { resourceType: "StructureDefinition", url: "http://example.org/sd" } as never,
        };

        expect(preprocess(context)).toBe(context);
    });

    it("is equivalent to the hand-written preprocessPackage callback", () => {
        const handWritten = (context: PreprocessContext): PreprocessContext => {
            if (context.kind !== "package") return context;
            const dependencies = context.packageJson.dependencies as Record<string, string> | undefined;
            if (!dependencies?.["de.basisprofil.r4"]) return context;
            return {
                ...context,
                packageJson: {
                    ...context.packageJson,
                    dependencies: { ...dependencies, "de.basisprofil.r4": "1.6.0-ballot2" },
                },
            };
        };
        const fromConfig = mkForceDependenciesPreprocessor({ "de.basisprofil.r4": "1.6.0-ballot2" });

        const cases: Record<string, string>[] = [
            { "de.basisprofil.r4": "1.5.4", "hl7.fhir.r4.core": "4.0.1" },
            { "hl7.fhir.r4.core": "4.0.1" },
            { "de.basisprofil.r4": "1.6.0-ballot2" },
        ];
        for (const dependencies of cases) {
            const context = packageContext(dependencies);
            expect(fromConfig(context)).toEqual(handWritten(context));
        }
    });

    it("is handed to the builder factory when the config declares it", async () => {
        const raw = { ...validConfig(), options: { forceDependencies: { "de.basisprofil.r4": "1.6.0-ballot2" } } };
        const config = parseGenerateConfig(raw, CONFIG_PATH);
        const factory = mkFactory();

        await runGenerateConfig(config, { createBuilder: factory.createBuilder });
        const preprocess = factory.seen[0]!.preprocessPackage;

        expect(preprocess).toBeDefined();
        const rewritten = preprocess!(packageContext({ "de.basisprofil.r4": "1.5.4" }));
        expect(rewritten.kind === "package" && rewritten.packageJson.dependencies).toEqual({
            "de.basisprofil.r4": "1.6.0-ballot2",
        });
    });

    it("rejects a non-string forced version", () => {
        const raw = { ...validConfig(), options: { forceDependencies: { "de.basisprofil.r4": 1.6 } } };

        try {
            parseGenerateConfig(raw, CONFIG_PATH);
            throw new Error("expected a GenerateConfigError");
        } catch (error) {
            const issues = (error as GenerateConfigError).issues;
            expect(issues[0]!.path).toBe("options.forceDependencies.de.basisprofil.r4");
            expect(issues[0]!.message).toContain("expected a string");
        }
    });
});

describe("describeGenerateConfig", () => {
    it("renders every builder with resolved paths", () => {
        const raw = {
            ...validConfig(),
            options: { forceDependencies: { "de.basisprofil.r4": "1.6.0-ballot2" } },
        };
        const plan = describeGenerateConfig(parseGenerateConfig(raw, CONFIG_PATH));

        expect(plan).toContain("Generate plan (1 builder(s)):");
        expect(plan).toContain("forceDependencies: de.basisprofil.r4 -> 1.6.0-ballot2");
        expect(plan).toContain("input: package hl7.fhir.r4.core@4.0.1");
        expect(plan).toContain("generators: typescript");
        expect(plan).toContain(`outputTo: ${Path.join(CONFIG_DIR, "out/core")}`);
    });
});
