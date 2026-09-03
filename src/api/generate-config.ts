/**
 * Declarative generation config
 *
 * Everything `APIBuilder` exposes as a fluent JS call is expressible here as plain data, so a
 * generation pipeline can be described by a JSON file instead of a hand-written script. This is
 * what the `atomic-codegen generate --config <file>` command consumes.
 *
 * Two rules make the format safe to hand to an automated caller:
 *
 * - Unknown keys are rejected. A misspelled key that was silently ignored would produce an empty
 *   or half-generated output tree that looks like a successful run.
 * - Path-valued fields are resolved against the config file's own directory, never the process
 *   working directory, so a generated config in a temporary directory behaves the same wherever
 *   the command is invoked from.
 */

import * as Path from "node:path";
import type { PreprocessContext } from "@atomic-ehr/fhir-canonical-manager";
import type { CSharpGeneratorOptions } from "@root/api/writer-generator/csharp/csharp";
import type { PythonGeneratorOptions } from "@root/api/writer-generator/python/writer";
import type { IrConf, TreeShakeRule } from "@root/typeschema/ir/types";
import type { CodegenLogManager } from "@root/utils/log";
import { APIBuilder, type GenerationReport, type LocalStructureDefinitionConfig } from "./builder";
import type { IntrospectionWriterOptions } from "./writer-generator/introspection";
import type { TypeScriptOptions } from "./writer-generator/typescript/writer";
import type { WriterOptions } from "./writer-generator/writer";

/** The only config schema version this build understands. */
export const GENERATE_CONFIG_VERSION = 1;

export type GenerateConfigPackage = {
    name: string;
    version: string;
};

export type GenerateConfigLocalStructureDefinitions = {
    package: GenerateConfigPackage;
    /** Directory of StructureDefinition files, resolved against the config file's directory. */
    path: string;
    dependencies?: GenerateConfigPackage[];
};

export type GenerateConfigBuilder = {
    /** Identifies the builder in reports and error messages. Must be unique within one config. */
    name: string;
    fromPackages?: GenerateConfigPackage[];
    fromPackageRefs?: string[];
    /** Local `.tgz` archives, resolved against the config file's directory. */
    localTgzPackages?: string[];
    localStructureDefinitions?: GenerateConfigLocalStructureDefinitions[];
    typeSchema?: IrConf;
    introspection?: Partial<IntrospectionWriterOptions>;
    typescript?: Partial<TypeScriptOptions>;
    python?: Partial<PythonGeneratorOptions>;
    csharp?: Partial<CSharpGeneratorOptions>;
    /** Output directory, resolved against the config file's directory. */
    outputTo: string;
    cleanOutput?: boolean;
    throwException?: boolean;
};

export type GenerateConfigOptions = {
    /** Custom FHIR package registry URL. */
    registry?: string;
    ignorePackageIndex?: boolean;
    dropCanonicalManagerCache?: boolean;
    /** Default for every builder that does not set its own `throwException`. */
    throwException?: boolean;
    /**
     * Pin a dependency to one version across the whole closure.
     *
     * Every package whose `package.json` declares one of these dependencies has the declared
     * version rewritten to the given one before the canonical manager resolves it, so two
     * packages asking for different versions of the same dependency cannot pull both in. This is
     * the declarative form of the `preprocessPackage` callback.
     */
    forceDependencies?: Record<string, string>;
};

export type GenerateConfig = {
    version: typeof GENERATE_CONFIG_VERSION;
    options?: GenerateConfigOptions;
    builders: GenerateConfigBuilder[];
};

export type GenerateConfigIssue = {
    /** JSON path of the offending value, for example `builders[1].outputTo`. */
    path: string;
    message: string;
};

export class GenerateConfigError extends Error {
    readonly issues: readonly GenerateConfigIssue[];

    constructor(issues: readonly GenerateConfigIssue[]) {
        super(
            [`Invalid generate config (${issues.length} problem${issues.length === 1 ? "" : "s"}):`]
                .concat(issues.map((issue) => `  ${issue.path || "<root>"}: ${issue.message}`))
                .join("\n"),
        );
        this.name = "GenerateConfigError";
        this.issues = issues;
    }
}

const ROOT_KEYS = ["version", "options", "builders"] as const satisfies readonly (keyof GenerateConfig)[];

const OPTIONS_KEYS = [
    "registry",
    "ignorePackageIndex",
    "dropCanonicalManagerCache",
    "throwException",
    "forceDependencies",
] as const satisfies readonly (keyof GenerateConfigOptions)[];

const BUILDER_KEYS = [
    "name",
    "fromPackages",
    "fromPackageRefs",
    "localTgzPackages",
    "localStructureDefinitions",
    "typeSchema",
    "introspection",
    "typescript",
    "python",
    "csharp",
    "outputTo",
    "cleanOutput",
    "throwException",
] as const satisfies readonly (keyof GenerateConfigBuilder)[];

const PACKAGE_KEYS = ["name", "version"] as const satisfies readonly (keyof GenerateConfigPackage)[];

const LOCAL_SD_KEYS = [
    "package",
    "path",
    "dependencies",
] as const satisfies readonly (keyof GenerateConfigLocalStructureDefinitions)[];

const IR_CONF_KEYS = [
    "treeShake",
    "treeShakeDefaults",
    "promoteLogical",
    "resolveCollisions",
] as const satisfies readonly (keyof IrConf)[];

const TREE_SHAKE_RULE_KEYS = [
    "ignoreFields",
    "selectFields",
    "ignoreExtensions",
    "followReferences",
] as const satisfies readonly (keyof TreeShakeRule)[];

/**
 * Generator option keys settable from config.
 *
 * `outputDir` is excluded on purpose: it is derived from the builder's `outputTo`. `logger` and
 * `resolveAssets` are excluded because they are runtime objects with no JSON representation.
 */
const FILE_SYSTEM_WRITER_KEYS = ["inMemoryOnly"] as const;

const WRITER_KEYS = [
    ...FILE_SYSTEM_WRITER_KEYS,
    "tabSize",
    "withDebugComment",
    "commentLinePrefix",
    "generateProfile",
] as const satisfies readonly (keyof WriterOptions)[];

const TYPESCRIPT_KEYS = [
    ...WRITER_KEYS,
    "lineWidth",
    "openResourceTypeSet",
    "primitiveTypeExtension",
    "extensionGetterDefault",
    "sliceGetterDefault",
] as const satisfies readonly (keyof TypeScriptOptions)[];

const PYTHON_KEYS = [
    ...WRITER_KEYS,
    "allowExtraFields",
    "primitiveTypeExtension",
    "rootPackageName",
    "fieldFormat",
    "client",
    "fhirpyClient",
] as const satisfies readonly (keyof PythonGeneratorOptions)[];

const CSHARP_KEYS = [
    ...WRITER_KEYS,
    "staticSourceDir",
    "rootNamespace",
] as const satisfies readonly (keyof CSharpGeneratorOptions)[];

const INTROSPECTION_KEYS = [
    ...FILE_SYSTEM_WRITER_KEYS,
    "typeSchemas",
    "typeTree",
    "fhirSchemas",
    "structureDefinitions",
] as const satisfies readonly (keyof IntrospectionWriterOptions)[];

const INPUT_KEYS = ["fromPackages", "fromPackageRefs", "localTgzPackages", "localStructureDefinitions"] as const;

const GENERATOR_KEYS = ["introspection", "typescript", "python", "csharp"] as const;

/** How `b` relates to `a` when both are absolute, normalized directories. */
const outputOverlap = (a: string, b: string): string | undefined => {
    if (a === b) return "duplicates";
    if (b.startsWith(a + Path.sep)) return "is nested inside";
    if (a.startsWith(b + Path.sep)) return "contains";
    return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const describeType = (value: unknown): string => {
    if (value === null) return "null";
    if (Array.isArray(value)) return "an array";
    if (typeof value === "string") return `a string (${JSON.stringify(value)})`;
    return `a ${typeof value}`;
};

const childPath = (parent: string, key: string): string => (parent === "" ? key : `${parent}.${key}`);

type Ctx = {
    issues: GenerateConfigIssue[];
    /** Directory of the config file; every relative path in the config is resolved against it. */
    configDir: string;
};

const report = (ctx: Ctx, path: string, message: string): undefined => {
    ctx.issues.push({ path, message });
    return undefined;
};

const checkKnownKeys = (ctx: Ctx, value: Record<string, unknown>, allowed: readonly string[], path: string): void => {
    for (const key of Object.keys(value)) {
        if (allowed.includes(key)) continue;
        report(ctx, childPath(path, key), `unknown key "${key}"; allowed keys: ${allowed.join(", ")}`);
    }
};

const readRecord = (ctx: Ctx, value: unknown, path: string): Record<string, unknown> | undefined =>
    isRecord(value) ? value : report(ctx, path, `expected an object, got ${describeType(value)}`);

const readString = (ctx: Ctx, value: unknown, path: string): string | undefined => {
    if (typeof value !== "string") return report(ctx, path, `expected a string, got ${describeType(value)}`);
    if (value.trim() === "") return report(ctx, path, "must not be empty");
    return value;
};

const readBoolean = (ctx: Ctx, value: unknown, path: string): boolean | undefined =>
    typeof value === "boolean" ? value : report(ctx, path, `expected a boolean, got ${describeType(value)}`);

const readArray = (ctx: Ctx, value: unknown, path: string): unknown[] | undefined =>
    Array.isArray(value) ? value : report(ctx, path, `expected an array, got ${describeType(value)}`);

const readStringArray = (ctx: Ctx, value: unknown, path: string): string[] | undefined => {
    const items = readArray(ctx, value, path);
    if (!items) return undefined;
    const result: string[] = [];
    items.forEach((item, index) => {
        const entry = readString(ctx, item, `${path}[${index}]`);
        if (entry !== undefined) result.push(entry);
    });
    return result;
};

const readStringMap = (ctx: Ctx, value: unknown, path: string): Record<string, string> | undefined => {
    const record = readRecord(ctx, value, path);
    if (!record) return undefined;
    const result: Record<string, string> = {};
    for (const [key, entry] of Object.entries(record)) {
        const version = readString(ctx, entry, childPath(path, key));
        if (version !== undefined) result[key] = version;
    }
    return result;
};

const resolvePath = (ctx: Ctx, value: string): string => Path.resolve(ctx.configDir, value);

const readPackage = (ctx: Ctx, value: unknown, path: string): GenerateConfigPackage | undefined => {
    const record = readRecord(ctx, value, path);
    if (!record) return undefined;
    checkKnownKeys(ctx, record, PACKAGE_KEYS, path);
    const name = readString(ctx, record.name, childPath(path, "name"));
    const version = readString(ctx, record.version, childPath(path, "version"));
    if (name === undefined || version === undefined) return undefined;
    return { name, version };
};

const readPackages = (ctx: Ctx, value: unknown, path: string): GenerateConfigPackage[] | undefined => {
    const items = readArray(ctx, value, path);
    if (!items) return undefined;
    const result: GenerateConfigPackage[] = [];
    items.forEach((item, index) => {
        const entry = readPackage(ctx, item, `${path}[${index}]`);
        if (entry) result.push(entry);
    });
    return result;
};

const readLocalStructureDefinitions = (
    ctx: Ctx,
    value: unknown,
    path: string,
): GenerateConfigLocalStructureDefinitions[] | undefined => {
    const items = readArray(ctx, value, path);
    if (!items) return undefined;
    const result: GenerateConfigLocalStructureDefinitions[] = [];
    items.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        const record = readRecord(ctx, item, itemPath);
        if (!record) return;
        checkKnownKeys(ctx, record, LOCAL_SD_KEYS, itemPath);
        const pkg = readPackage(ctx, record.package, childPath(itemPath, "package"));
        const sdPath = readString(ctx, record.path, childPath(itemPath, "path"));
        const dependencies =
            record.dependencies === undefined
                ? undefined
                : readPackages(ctx, record.dependencies, childPath(itemPath, "dependencies"));
        if (!pkg || sdPath === undefined) return;
        result.push({ package: pkg, path: resolvePath(ctx, sdPath), dependencies });
    });
    return result;
};

const readTreeShake = (ctx: Ctx, value: unknown, path: string): void => {
    const packages = readRecord(ctx, value, path);
    if (!packages) return;
    for (const [packageName, canonicals] of Object.entries(packages)) {
        const packagePath = childPath(path, packageName);
        const rules = readRecord(ctx, canonicals, packagePath);
        if (!rules) continue;
        for (const [canonical, rule] of Object.entries(rules)) {
            const rulePath = childPath(packagePath, canonical);
            const ruleRecord = readRecord(ctx, rule, rulePath);
            if (!ruleRecord) continue;
            checkKnownKeys(ctx, ruleRecord, TREE_SHAKE_RULE_KEYS, rulePath);
        }
    }
};

const readTypeSchema = (ctx: Ctx, value: unknown, path: string): IrConf | undefined => {
    const record = readRecord(ctx, value, path);
    if (!record) return undefined;
    checkKnownKeys(ctx, record, IR_CONF_KEYS, path);
    if (record.treeShake !== undefined) readTreeShake(ctx, record.treeShake, childPath(path, "treeShake"));
    return record as IrConf;
};

const readGeneratorOptions = <T>(ctx: Ctx, value: unknown, path: string, allowed: readonly string[]): T | undefined => {
    const record = readRecord(ctx, value, path);
    if (!record) return undefined;
    checkKnownKeys(ctx, record, allowed, path);
    return record as T;
};

const readBuilder = (ctx: Ctx, value: unknown, path: string): GenerateConfigBuilder | undefined => {
    const record = readRecord(ctx, value, path);
    if (!record) return undefined;
    checkKnownKeys(ctx, record, BUILDER_KEYS, path);

    const name = readString(ctx, record.name, childPath(path, "name"));
    const outputTo =
        record.outputTo === undefined
            ? report(ctx, childPath(path, "outputTo"), "outputTo is required; a builder must name its output directory")
            : readString(ctx, record.outputTo, childPath(path, "outputTo"));

    const builder: Partial<GenerateConfigBuilder> = {};
    if (record.fromPackages !== undefined)
        builder.fromPackages = readPackages(ctx, record.fromPackages, childPath(path, "fromPackages"));
    if (record.fromPackageRefs !== undefined)
        builder.fromPackageRefs = readStringArray(ctx, record.fromPackageRefs, childPath(path, "fromPackageRefs"));
    if (record.localTgzPackages !== undefined) {
        const archives = readStringArray(ctx, record.localTgzPackages, childPath(path, "localTgzPackages"));
        builder.localTgzPackages = archives?.map((archive) => resolvePath(ctx, archive));
    }
    if (record.localStructureDefinitions !== undefined)
        builder.localStructureDefinitions = readLocalStructureDefinitions(
            ctx,
            record.localStructureDefinitions,
            childPath(path, "localStructureDefinitions"),
        );
    if (record.typeSchema !== undefined)
        builder.typeSchema = readTypeSchema(ctx, record.typeSchema, childPath(path, "typeSchema"));
    if (record.introspection !== undefined)
        builder.introspection = readGeneratorOptions(
            ctx,
            record.introspection,
            childPath(path, "introspection"),
            INTROSPECTION_KEYS,
        );
    if (record.typescript !== undefined)
        builder.typescript = readGeneratorOptions(
            ctx,
            record.typescript,
            childPath(path, "typescript"),
            TYPESCRIPT_KEYS,
        );
    if (record.python !== undefined)
        builder.python = readGeneratorOptions(ctx, record.python, childPath(path, "python"), PYTHON_KEYS);
    if (record.csharp !== undefined)
        builder.csharp = readGeneratorOptions(ctx, record.csharp, childPath(path, "csharp"), CSHARP_KEYS);
    if (record.cleanOutput !== undefined)
        builder.cleanOutput = readBoolean(ctx, record.cleanOutput, childPath(path, "cleanOutput"));
    if (record.throwException !== undefined)
        builder.throwException = readBoolean(ctx, record.throwException, childPath(path, "throwException"));

    const hasInput = INPUT_KEYS.some((key) => record[key] !== undefined);
    if (!hasInput)
        report(
            ctx,
            path,
            `no input configured; set at least one of ${INPUT_KEYS.join(", ")} or the builder generates nothing`,
        );

    const hasGenerator = GENERATOR_KEYS.some((key) => record[key] !== undefined);
    if (!hasGenerator)
        report(
            ctx,
            path,
            `no output generator configured; set at least one of ${GENERATOR_KEYS.join(", ")} or the builder writes nothing`,
        );

    if (name === undefined || outputTo === undefined) return undefined;
    return { ...builder, name, outputTo: resolvePath(ctx, outputTo) };
};

const readOptions = (ctx: Ctx, value: unknown, path: string): GenerateConfigOptions | undefined => {
    const record = readRecord(ctx, value, path);
    if (!record) return undefined;
    checkKnownKeys(ctx, record, OPTIONS_KEYS, path);
    const options: GenerateConfigOptions = {};
    if (record.registry !== undefined) options.registry = readString(ctx, record.registry, childPath(path, "registry"));
    if (record.ignorePackageIndex !== undefined)
        options.ignorePackageIndex = readBoolean(ctx, record.ignorePackageIndex, childPath(path, "ignorePackageIndex"));
    if (record.dropCanonicalManagerCache !== undefined)
        options.dropCanonicalManagerCache = readBoolean(
            ctx,
            record.dropCanonicalManagerCache,
            childPath(path, "dropCanonicalManagerCache"),
        );
    if (record.throwException !== undefined)
        options.throwException = readBoolean(ctx, record.throwException, childPath(path, "throwException"));
    if (record.forceDependencies !== undefined)
        options.forceDependencies = readStringMap(ctx, record.forceDependencies, childPath(path, "forceDependencies"));
    return options;
};

/**
 * Validate raw config data and resolve its relative paths.
 *
 * `configPath` is the file the data came from; every relative `outputTo`, `localTgzPackages`
 * entry, and `localStructureDefinitions[].path` is resolved against its directory rather than
 * against the process working directory.
 *
 * Every problem found is reported, not just the first, so one run tells the caller everything
 * that has to be fixed.
 *
 * @throws {GenerateConfigError} when the config is not usable.
 */
export const parseGenerateConfig = (raw: unknown, configPath: string): GenerateConfig => {
    const ctx: Ctx = { issues: [], configDir: Path.dirname(Path.resolve(configPath)) };

    const root = readRecord(ctx, raw, "");
    if (!root) throw new GenerateConfigError(ctx.issues);
    checkKnownKeys(ctx, root, ROOT_KEYS, "");

    if (root.version === undefined) report(ctx, "version", `version is required; expected ${GENERATE_CONFIG_VERSION}`);
    else if (typeof root.version !== "number")
        report(ctx, "version", `expected the number ${GENERATE_CONFIG_VERSION}, got ${describeType(root.version)}`);
    else if (root.version !== GENERATE_CONFIG_VERSION)
        report(
            ctx,
            "version",
            `unsupported config version ${root.version}; this build understands ${GENERATE_CONFIG_VERSION}`,
        );

    const options = root.options === undefined ? undefined : readOptions(ctx, root.options, "options");

    const builders: GenerateConfigBuilder[] = [];
    if (root.builders === undefined) {
        report(ctx, "builders", "builders is required and must list at least one builder");
    } else {
        const items = readArray(ctx, root.builders, "builders");
        if (items && items.length === 0) report(ctx, "builders", "must list at least one builder");
        items?.forEach((item, index) => {
            const builder = readBuilder(ctx, item, `builders[${index}]`);
            if (builder) builders.push(builder);
        });
    }

    const seen = new Set<string>();
    builders.forEach((builder, index) => {
        if (seen.has(builder.name))
            report(ctx, `builders[${index}].name`, `duplicate builder name "${builder.name}"; names must be unique`);
        seen.add(builder.name);
    });

    // outputTo values are absolute by now; overlapping directories would let a
    // later builder's cleanOutput remove an earlier builder's freshly written files.
    builders.forEach((builder, index) => {
        for (const other of builders.slice(0, index)) {
            const relation = outputOverlap(other.outputTo, builder.outputTo);
            if (!relation) continue;
            report(
                ctx,
                `builders[${index}].outputTo`,
                `${relation} the output directory of builder "${other.name}"; output directories must not overlap`,
            );
        }
    });

    if (ctx.issues.length > 0) throw new GenerateConfigError(ctx.issues);
    return { version: GENERATE_CONFIG_VERSION, options, builders };
};

/**
 * Build the `preprocessPackage` callback that `forceDependencies` stands for.
 *
 * Only dependencies a package already declares are rewritten; the map never adds a dependency to
 * a package that does not ask for it, so the closure keeps its shape and only its versions are
 * pinned.
 */
export const mkForceDependenciesPreprocessor =
    (forced: Record<string, string>) =>
    (context: PreprocessContext): PreprocessContext => {
        if (context.kind !== "package") return context;
        const declared = context.packageJson.dependencies;
        if (!isRecord(declared)) return context;

        let changed = false;
        const dependencies: Record<string, unknown> = { ...declared };
        for (const [name, version] of Object.entries(forced)) {
            if (!(name in dependencies)) continue;
            if (dependencies[name] === version) continue;
            dependencies[name] = version;
            changed = true;
        }
        if (!changed) return context;
        return { ...context, packageJson: { ...context.packageJson, dependencies } };
    };

/** The subset of `APIBuilder` a config-driven run uses. Lets callers and tests substitute it. */
export type GenerationBuilder = {
    fromPackage(packageName: string, version?: string): GenerationBuilder;
    fromPackageRef(packageRef: string): GenerationBuilder;
    localTgzPackage(archivePath: string): GenerationBuilder;
    localStructureDefinitions(config: LocalStructureDefinitionConfig): GenerationBuilder;
    typeSchema(config: IrConf): GenerationBuilder;
    introspection(options: Partial<IntrospectionWriterOptions>): GenerationBuilder;
    typescript(options: Partial<TypeScriptOptions>): GenerationBuilder;
    python(options: Partial<PythonGeneratorOptions>): GenerationBuilder;
    csharp(options: Partial<CSharpGeneratorOptions>): GenerationBuilder;
    outputTo(directory: string): GenerationBuilder;
    cleanOutput(enabled: boolean): GenerationBuilder;
    throwException(enabled: boolean): GenerationBuilder;
    generate(): Promise<GenerationReport>;
};

export type BuilderFactoryOptions = {
    registry?: string;
    dropCanonicalManagerCache?: boolean;
    ignorePackageIndex?: boolean;
    preprocessPackage?: (context: PreprocessContext) => PreprocessContext;
    logger?: CodegenLogManager;
};

export type BuilderFactory = (options: BuilderFactoryOptions) => GenerationBuilder;

export type BuilderRunResult = {
    name: string;
    success: boolean;
    outputDir: string;
    errors: string[];
    report?: GenerationReport;
};

export type GenerateRunResult = {
    success: boolean;
    builders: BuilderRunResult[];
};

const defaultBuilderFactory: BuilderFactory = (options) => new APIBuilder(options);

const runBuilder = async (
    config: GenerateConfigBuilder,
    options: GenerateConfigOptions,
    createBuilder: BuilderFactory,
    logger: CodegenLogManager | undefined,
): Promise<BuilderRunResult> => {
    const preprocessPackage = options.forceDependencies
        ? mkForceDependenciesPreprocessor(options.forceDependencies)
        : undefined;

    try {
        const builder = createBuilder({
            registry: options.registry,
            dropCanonicalManagerCache: options.dropCanonicalManagerCache,
            ignorePackageIndex: options.ignorePackageIndex,
            preprocessPackage,
            logger,
        });

        for (const pkg of config.fromPackages ?? []) builder.fromPackage(pkg.name, pkg.version);
        for (const ref of config.fromPackageRefs ?? []) builder.fromPackageRef(ref);
        for (const archive of config.localTgzPackages ?? []) builder.localTgzPackage(archive);
        for (const local of config.localStructureDefinitions ?? []) builder.localStructureDefinitions(local);

        if (config.typeSchema) builder.typeSchema(config.typeSchema);
        if (config.introspection) builder.introspection(config.introspection);
        if (config.typescript) builder.typescript(config.typescript);
        if (config.python) builder.python(config.python);
        if (config.csharp) builder.csharp(config.csharp);

        // Applied after the generators on purpose: `outputTo` rewrites the output directory of
        // every generator already configured, so each one writes straight into it instead of a
        // generator-specific subdirectory. This is the order the repository's examples use.
        builder.outputTo(config.outputTo);

        if (config.cleanOutput !== undefined) builder.cleanOutput(config.cleanOutput);
        const throwException = config.throwException ?? options.throwException;
        if (throwException !== undefined) builder.throwException(throwException);

        const generationReport = await builder.generate();
        return {
            name: config.name,
            success: generationReport.success,
            outputDir: config.outputTo,
            errors: generationReport.errors,
            report: generationReport,
        };
    } catch (error) {
        return {
            name: config.name,
            success: false,
            outputDir: config.outputTo,
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
};

/**
 * Run every builder in the config, in order.
 *
 * A failing builder does not stop the ones after it: the caller gets one report covering all of
 * them, so a broken pipeline is fixed in one pass instead of one builder per run.
 */
export const runGenerateConfig = async (
    config: GenerateConfig,
    deps: { createBuilder?: BuilderFactory; logger?: CodegenLogManager } = {},
): Promise<GenerateRunResult> => {
    const createBuilder = deps.createBuilder ?? defaultBuilderFactory;
    const options = config.options ?? {};

    const builders: BuilderRunResult[] = [];
    for (const builderConfig of config.builders) {
        builders.push(await runBuilder(builderConfig, options, createBuilder, deps.logger));
    }
    return { success: builders.every((builder) => builder.success), builders };
};

const describeInputs = (builder: GenerateConfigBuilder): string[] => {
    const lines: string[] = [];
    for (const pkg of builder.fromPackages ?? []) lines.push(`package ${pkg.name}@${pkg.version}`);
    for (const ref of builder.fromPackageRefs ?? []) lines.push(`package ref ${ref}`);
    for (const archive of builder.localTgzPackages ?? []) lines.push(`local tgz ${archive}`);
    for (const local of builder.localStructureDefinitions ?? [])
        lines.push(`local StructureDefinitions ${local.package.name}@${local.package.version} from ${local.path}`);
    return lines;
};

/** Render the validated config as a human-readable plan, with every path already resolved. */
export const describeGenerateConfig = (config: GenerateConfig): string => {
    const options = config.options ?? {};
    const lines: string[] = [`Generate plan (${config.builders.length} builder(s)):`];

    const optionLines: string[] = [];
    if (options.registry) optionLines.push(`registry: ${options.registry}`);
    if (options.ignorePackageIndex !== undefined) optionLines.push(`ignorePackageIndex: ${options.ignorePackageIndex}`);
    if (options.dropCanonicalManagerCache !== undefined)
        optionLines.push(`dropCanonicalManagerCache: ${options.dropCanonicalManagerCache}`);
    if (options.throwException !== undefined) optionLines.push(`throwException: ${options.throwException}`);
    for (const [name, version] of Object.entries(options.forceDependencies ?? {}))
        optionLines.push(`forceDependencies: ${name} -> ${version}`);
    if (optionLines.length > 0) lines.push("  options:", ...optionLines.map((line) => `    ${line}`));

    config.builders.forEach((builder, index) => {
        const generators = GENERATOR_KEYS.filter((key) => builder[key] !== undefined);
        lines.push(`  ${index + 1}. ${builder.name}`);
        for (const input of describeInputs(builder)) lines.push(`     input: ${input}`);
        lines.push(`     generators: ${generators.length > 0 ? generators.join(", ") : "none"}`);
        if (builder.typeSchema) lines.push(`     typeSchema: ${Object.keys(builder.typeSchema).join(", ")}`);
        lines.push(`     outputTo: ${builder.outputTo}`);
        if (builder.cleanOutput !== undefined) lines.push(`     cleanOutput: ${builder.cleanOutput}`);
    });
    return lines.join("\n");
};
