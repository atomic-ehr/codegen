import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as Path from "node:path";
import * as util from "node:util";
import { DebugMixinProvider } from "@mustache/generator/DebugMixinProvider";
import { LambdaMixinProvider } from "@mustache/generator/LambdaMixinProvider";
import {
    type DistinctNameConfigurationType,
    NameGenerator,
    type NameTransformation,
} from "@mustache/generator/NameGenerator";
import { TemplateFileCache } from "@mustache/generator/TemplateFileCache";
import type { ViewModelCache } from "@mustache/generator/ViewModelFactory";
import { ViewModelFactory } from "@mustache/generator/ViewModelFactory";
import type {
    HookType,
    MustacheFilter,
    NamedViewModel,
    PrimitiveType,
    Rendering,
    TypeViewModel,
    View,
    ViewModel,
} from "@mustache/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Identifier } from "@typeschema/types";
import { default as Mustache } from "mustache";
import { FileSystemWriter, type FileSystemWriterOptions } from "./writer";

export type FileBasedMustacheGeneratorOptions = {
    debug: "OFF" | "FORMATTED" | "COMPACT";
    renderings: {
        utility: Rendering[];
        resource: Rendering[];
        complexType: Rendering[];
    };
    keywords: string[];
    typeMap: Partial<Record<PrimitiveType, string>>;
    filters: MustacheFilter;
    meta: {
        timestamp?: string;
        generator?: string;
    };
    hooks: {
        afterGenerate?: HookType[];
    };
    nameTransformations: DistinctNameConfigurationType<NameTransformation[]>;
    unsaveCharacterPattern: string | RegExp;
};

export type MustacheGeneratorOptions = FileSystemWriterOptions &
    FileBasedMustacheGeneratorOptions & {
        sources: {
            templateSource: string;
            staticSource: string;
        };
    };

export function loadMustacheGeneratorConfig(
    templatePath: string,
    logger?: CodegenLogger,
): Partial<FileBasedMustacheGeneratorOptions> {
    const filePath = Path.resolve(templatePath, "config.json");
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
            return parsed as Partial<FileBasedMustacheGeneratorOptions>;
        }
    } catch (_e) {}
    logger?.warn(`Failed to load JSON file with mustache generator config: ${filePath}`);
    return {};
}

export const createGenerator = (
    templatePath: string,
    apiOpts: FileSystemWriterOptions & Partial<FileBasedMustacheGeneratorOptions>,
): MustacheGenerator => {
    const defaultFileOpts: FileBasedMustacheGeneratorOptions = {
        debug: "OFF",
        hooks: {},
        meta: {},
        filters: {},
        keywords: [],
        unsaveCharacterPattern: /[^a-zA-Z0-9]/g,
        nameTransformations: {
            common: [],
            enumValue: [],
            type: [],
            field: [],
        },
        renderings: {
            utility: [],
            resource: [],
            complexType: [],
        },
        typeMap: {},
    };
    const actualFileOpts = loadMustacheGeneratorConfig(templatePath);

    const mustacheOptions: MustacheGeneratorOptions = {
        ...defaultFileOpts,
        ...apiOpts,
        ...actualFileOpts,
        sources: {
            staticSource: Path.resolve(templatePath, "static"),
            templateSource: Path.resolve(templatePath, "templates"),
        },
    };
    return new MustacheGenerator(mustacheOptions);
};

function runCommand(cmd: string, args: string[] = [], options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            stdio: "inherit",
            ...options,
        });
        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) resolve(code);
            else reject(new Error(`Prozess beendet mit Fehlercode ${code}`));
        });
    });
}

const mkFilterPredicate = (filters: MustacheFilter) => {
    return (type: Identifier) => {
        if (type.kind !== "complex-type" && type.kind !== "resource") {
            return true;
        }
        if (!filters[type.kind as "resource" | "complexType"]) {
            return true;
        }
        const whitelist = filters[type.kind as "resource" | "complexType"]?.whitelist ?? [];
        const blacklist = filters[type.kind as "resource" | "complexType"]?.blacklist ?? [];
        if (!whitelist.length && !blacklist.length) {
            return true;
        }
        if (blacklist.find((pattern: any) => type.name.match(pattern as any))) {
            return false;
        }
        if (whitelist.find((pattern: any) => type.name.match(pattern as any))) {
            return true;
        }
        return whitelist.length === 0;
    };
};

export class MustacheGenerator extends FileSystemWriter<MustacheGeneratorOptions> {
    private readonly templateFileCache: TemplateFileCache;
    private readonly nameGenerator: NameGenerator;
    private readonly lambdaMixinProvider: LambdaMixinProvider;
    private readonly debugMixinProvider?: DebugMixinProvider;

    constructor(opts: MustacheGeneratorOptions) {
        super(opts);
        this.nameGenerator = new NameGenerator(
            new Set<string>(opts.keywords),
            opts.typeMap,
            opts.nameTransformations,
            opts.unsaveCharacterPattern,
        );
        this.templateFileCache = new TemplateFileCache(opts.sources.templateSource);
        this.lambdaMixinProvider = new LambdaMixinProvider(this.nameGenerator);
        this.debugMixinProvider = opts.debug !== "OFF" ? new DebugMixinProvider(opts.debug) : undefined;
    }

    override async generate(tsIndex: TypeSchemaIndex) {
        const filterPred = mkFilterPredicate(this.opts.filters);
        const modelFactory = new ViewModelFactory(tsIndex, this.nameGenerator, filterPred);
        const cache: ViewModelCache = {
            resourcesByUri: {},
            complexTypesByUri: {},
        };
        tsIndex
            .collectComplexTypes()
            .map((i) => i.identifier)
            .filter((i) => filterPred(i))
            .sort((a, b) => a.url.localeCompare(b.url))
            .map((typeRef) => modelFactory.createComplexType(typeRef, cache))
            .forEach(this._renderComplexType.bind(this));

        tsIndex
            .collectResources()
            .map((i) => i.identifier)
            .filter((i) => filterPred(i))
            .sort((a, b) => a.url.localeCompare(b.url))
            .map((typeRef) => modelFactory.createResource(typeRef, cache))
            .forEach(this._renderResource.bind(this));

        this._renderUtility(modelFactory.createUtility());
        this.copyStaticFiles();

        await this._runHooks(this.opts.hooks.afterGenerate);
        return;
    }

    copyStaticFiles() {
        const staticDir = Path.resolve(this.opts.sources.staticSource);
        if (!staticDir) {
            throw new Error("staticDir must be set in subclass.");
        }
        fs.cpSync(staticDir, this.opts.outputDir, { recursive: true });
    }

    private async _runHooks(hooks?: HookType[]) {
        for (const hook of hooks ?? []) {
            console.info(`Running hook (${this.opts.outputDir}): ${hook.cmd} ${hook.args?.join(" ")}`);
            await runCommand(hook.cmd, hook.args ?? [], {
                cwd: this.opts.outputDir,
            });
            console.info(`Completed hook: ${hook.cmd} ${hook.args?.join(" ")}`);
        }
    }

    private _checkRenderingFilter(model: TypeViewModel, rendering: Rendering): boolean {
        if (!rendering.filter?.whitelist?.length && !rendering.filter?.blacklist?.length) {
            return true;
        }
        if ((rendering.filter?.blacklist ?? []).find((v) => model.name.match(v))) {
            return false;
        }
        if ((rendering.filter?.whitelist ?? []).find((v) => model.name.match(v))) {
            return true;
        }
        return !rendering.filter.whitelist?.length;
    }

    private _renderUtility(model: ViewModel) {
        this.opts.renderings.utility.forEach((rendering) => {
            this.cd(rendering.path, () => {
                this.cat(rendering.fileNameFormat, () => {
                    this.write(this._render(model, rendering));
                });
            });
        });
    }

    private _renderResource(model: TypeViewModel) {
        this.opts.renderings.resource
            .filter((rendering) => this._checkRenderingFilter(model, rendering))
            .forEach((rendering) => {
                this.cd(rendering.path, () => {
                    this.cat(this._calculateFilename(model, rendering), () => {
                        this.write(this._render(model, rendering));
                    });
                });
            });
    }

    private _renderComplexType(model: TypeViewModel) {
        this.opts.renderings.complexType
            .filter((rendering) => this._checkRenderingFilter(model, rendering))
            .forEach((rendering) => {
                this.cd(rendering.path, () => {
                    this.cat(this._calculateFilename(model, rendering), () => {
                        this.write(this._render(model, rendering));
                    });
                });
            });
    }

    private _calculateFilename(model: NamedViewModel, rendering: Rendering): string {
        return util.format(rendering.fileNameFormat, model.saveName);
    }

    private _render<T extends ViewModel>(model: T, rendering: Rendering): string {
        let view: View<T> = this.lambdaMixinProvider.apply({
            meta: {
                timestamp: this.opts.meta.timestamp ?? new Date().toISOString(),
                generator: this.opts.meta.generator ?? "FHIR-Schema Mustache Generator",
            },
            model: model,
            properties: rendering.properties ?? {},
        });
        if (this.debugMixinProvider) {
            view = this.debugMixinProvider.apply(view);
        }
        return Mustache.render(this.templateFileCache.read(rendering), view, (partialName: string) =>
            this.templateFileCache.readTemplate(partialName),
        );
    }
}
