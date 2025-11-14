// import path from "node:path";

// import * as Mustache from "mustache";
// import { Generator, type GeneratorOptions } from "../../generator";
// import { ViewModelCache, ViewModelFactory } from "@mustache/generator/ViewModelFactory";
// import { Rendering } from "@mustache/types/Rendering";
// import * as util from "node:util";
// import { TemplateFileCache } from "@mustache/generator/TemplateFileCache";
// import { NamedViewModel } from "@mustache/types/NamedViewModel";
// import { DistinctNameConfigurationType, NameGenerator, NameTransformation } from "@mustache/generator/NameGenerator";
// import { SchemaLoaderFacade } from "@mustache/generator/SchemaLoaderFacade";
// import { View } from "@mustache/types/View";
// import { LambdaMixinProvider } from "@mustache/generator/LambdaMixinProvider";
// import { PrimitiveType } from "@mustache/types/PrimitiveType";
// import { DebugMixinProvider } from "@mustache/generator/DebugMixinProvider";
// import { spawn } from "child_process";
// import { TypeViewModel } from "@mustache/types/TypeViewModel";
// import { HookType } from "@mustache/types/HookType";
// import { ViewModel } from "@mustache/types/ViewModel";
// import { FilterType } from "@mustache/types/FilterType";

// export interface MustacheGeneratorOptions extends GeneratorOptions {
//     debug: "OFF" | "FORMATTED" | "COMPACT";
//     hooks: {
//         afterGenerate?: HookType[];
//     };
//     meta: {
//         timestamp?: string;
//         generator?: string;
//     };
//     filters: {
//         resource?: FilterType;
//         complexType?: FilterType;
//     };
//     sources: {
//         templateSource: string;
//         staticSource: string;
//     };
//     typeMap: Partial<Record<PrimitiveType, string>>;
//     unsaveCharacterPattern: string | RegExp;
//     nameTransformations: DistinctNameConfigurationType<NameTransformation[]>;
//     renderings: {
//         utility: Rendering[];
//         resource: Rendering[];
//         complexType: Rendering[];
//     };
// }

// export class MustacheGenerator extends Generator {
//     private static runCommand(cmd, args: string[] = [], options = {}) {
//         return new Promise((resolve, reject) => {
//             const child = spawn(cmd, args, {
//                 stdio: "inherit",
//                 ...options,
//             });
//             child.on("error", reject);
//             child.on("close", (code) => {
//                 if (code === 0) resolve(code);
//                 else reject(new Error(`Prozess beendet mit Fehlercode ${code}`));
//             });
//         });
//     }

//     private readonly templateFileCache: TemplateFileCache;
//     private readonly mustacheGeneratorOptions: MustacheGeneratorOptions;
//     private readonly nameGenerator: NameGenerator;
//     private readonly lambdaMixinProvider: LambdaMixinProvider;
//     private readonly debugMixinProvider?: DebugMixinProvider;

//     constructor(opts: MustacheGeneratorOptions) {
//         super({
//             ...opts,
//             typeMap: opts.typeMap,
//             staticDir: path.resolve(opts.sources.staticSource),
//         });
//         this.mustacheGeneratorOptions = opts;
//         this.nameGenerator = new NameGenerator(
//             opts.keywords ?? new Set<string>(),
//             opts.typeMap,
//             opts.nameTransformations,
//             opts.unsaveCharacterPattern,
//         );
//         this.templateFileCache = new TemplateFileCache(opts.sources.templateSource);
//         this.lambdaMixinProvider = new LambdaMixinProvider(this.nameGenerator);
//         this.debugMixinProvider = opts.debug != "OFF" ? new DebugMixinProvider(opts.debug) : undefined;
//     }
//     public async generate() {
//         this.clear();
//         const schemaLoaderFacade = new SchemaLoaderFacade(this.loader, this.mustacheGeneratorOptions.filters);
//         const modelFactory = new ViewModelFactory(schemaLoaderFacade, this.nameGenerator);

//         const cache: ViewModelCache = {
//             resourcesByUri: {},
//             complexTypesByUri: {},
//         };
//         schemaLoaderFacade
//             .getComplexTypes()
//             .map((typeRef) => modelFactory.createComplexType(typeRef, cache))
//             .forEach(this._renderComplexType.bind(this));

//         schemaLoaderFacade
//             .getResources()
//             .map((typeRef) => modelFactory.createResource(typeRef, cache))
//             .forEach(this._renderResource.bind(this));

//         this._renderUtility(modelFactory.createUtility());

//         this.copyStaticFiles();

//         await this._runHooks(this.mustacheGeneratorOptions.hooks.afterGenerate);
//     }

//     private async _runHooks(hooks?: HookType[]) {
//         for (const hook of hooks ?? []) {
//             console.info(`Running hook: ${hook.cmd} ${hook.args?.join(" ")}`);
//             await MustacheGenerator.runCommand(hook.cmd, hook.args ?? [], {
//                 cwd: this.mustacheGeneratorOptions.outputDir,
//             });
//             console.info(`Completed hook: ${hook.cmd} ${hook.args?.join(" ")}`);
//         }
//     }

//     private _checkRenderingFilter(model: TypeViewModel, rendering: Rendering): boolean {
//         if (!rendering.filter?.whitelist?.length && !rendering.filter?.blacklist?.length) {
//             return true;
//         }
//         if ((rendering.filter?.blacklist ?? []).find((v) => model.name.match(v))) {
//             return false;
//         }
//         if ((rendering.filter?.whitelist ?? []).find((v) => model.name.match(v))) {
//             return true;
//         }
//         return !rendering.filter.whitelist?.length;
//     }

//     private _renderUtility(model: ViewModel) {
//         this.mustacheGeneratorOptions.renderings.utility.forEach((rendering) => {
//             this.dir(rendering.path, () => {
//                 this.file(rendering.fileNameFormat, () => {
//                     this.write(this._render(model, rendering));
//                 });
//             });
//         });
//     }

//     private _renderResource(model: TypeViewModel) {
//         this.mustacheGeneratorOptions.renderings.resource
//             .filter((rendering) => this._checkRenderingFilter(model, rendering))
//             .forEach((rendering) => {
//                 this.dir(rendering.path, () => {
//                     this.file(this._calculateFilename(model, rendering), () => {
//                         this.write(this._render(model, rendering));
//                     });
//                 });
//             });
//     }

//     private _renderComplexType(model: TypeViewModel) {
//         this.mustacheGeneratorOptions.renderings.complexType
//             .filter((rendering) => this._checkRenderingFilter(model, rendering))
//             .forEach((rendering) => {
//                 this.dir(rendering.path, () => {
//                     this.file(this._calculateFilename(model, rendering), () => {
//                         this.write(this._render(model, rendering));
//                     });
//                 });
//             });
//     }

//     private _calculateFilename(model: NamedViewModel, rendering: Rendering): string {
//         return util.format(rendering.fileNameFormat, model.saveName);
//     }

//     private _render<T extends ViewModel>(model: T, rendering: Rendering): string {
//         let view: View<T> = this.lambdaMixinProvider.apply({
//             meta: {
//                 timestamp: this.mustacheGeneratorOptions.meta.timestamp ?? new Date().toISOString(),
//                 generator: this.mustacheGeneratorOptions.meta.generator ?? "FHIR-Schema Mustache Generator",
//             },
//             model: model,
//             properties: rendering.properties ?? {},
//         });
//         if (this.debugMixinProvider) {
//             view = this.debugMixinProvider.apply(view);
//         }
//         return Mustache.render(this.templateFileCache.read(rendering), view, (partialName) =>
//             this.templateFileCache.readTemplate(partialName),
//         );
//     }
// }
