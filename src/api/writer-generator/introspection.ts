import * as Path from "node:path";
import type { RichFHIRSchema, RichStructureDefinition } from "@root/typeschema/types";
import { type CanonicalUrl, extractNameFromCanonical, type TypeSchema } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import YAML from "yaml";
import { FileSystemWriter, type FileSystemWriterOptions } from "./writer";

export interface IntrospectionWriterOptions extends FileSystemWriterOptions {
    typeSchemas?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
    typeTree?: string /** .json or .yaml file */;
    fhirSchemas?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
    structureDefinitions?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
}

const normalizeFileName = (str: string): string => {
    const res = str.replace(/[^a-zA-Z0-9\-_.@#()]/g, "");
    if (res.length === 0) return "unknown";
    return res;
};

const typeSchemaToJson = (ts: TypeSchema, pretty: boolean): { filename: string; genContent: () => string } => {
    const pkgPath = normalizeFileName(ts.identifier.package);
    const name = normalizeFileName(`${ts.identifier.name}(${extractNameFromCanonical(ts.identifier.url)})`);
    const baseName = Path.join(pkgPath, name);

    return {
        filename: baseName,
        genContent: () => JSON.stringify(ts, null, pretty ? 2 : undefined),
    };
};

const fhirSchemaToJson = (fs: RichFHIRSchema, pretty: boolean): { filename: string; genContent: () => string } => {
    const pkgPath = normalizeFileName(fs.package_meta.name);
    const name = normalizeFileName(`${fs.name}(${extractNameFromCanonical(fs.url)})`);
    const baseName = Path.join(pkgPath, name);

    return {
        filename: baseName,
        genContent: () => JSON.stringify(fs, null, pretty ? 2 : undefined),
    };
};

const structureDefinitionToJson = (
    sd: RichStructureDefinition,
    pretty: boolean,
): { filename: string; genContent: () => string } => {
    const pkgPath = normalizeFileName(sd.package_name ?? "unknown");
    const name = normalizeFileName(`${sd.name}(${extractNameFromCanonical(sd.url as CanonicalUrl)})`);
    const baseName = Path.join(pkgPath, name);

    return {
        filename: baseName,
        // HACK: for some reason ID may change between CI and local install
        genContent: () => JSON.stringify({ ...sd, id: undefined }, null, pretty ? 2 : undefined),
    };
};

export class IntrospectionWriter extends FileSystemWriter<IntrospectionWriterOptions> {
    async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        this.logger()?.info(`IntrospectionWriter: Begin`);
        if (this.opts.typeTree) {
            await this.writeTypeTree(tsIndex);
            this.logger()?.info(`IntrospectionWriter: Type tree written to ${this.opts.typeTree}`);
        }

        if (this.opts.typeSchemas) {
            const outputPath = this.opts.typeSchemas;
            const typeSchemas = tsIndex.schemas;
            if (Path.extname(outputPath) === ".ndjson") {
                this.writeNdjson(typeSchemas, outputPath, typeSchemaToJson);
            } else {
                this.writeJsonFiles(
                    typeSchemas.map((ts) => typeSchemaToJson(ts, true)),
                    outputPath,
                );
            }
            this.logger()?.info(
                `IntrospectionWriter: ${typeSchemas.length} TypeSchema written to ${this.opts.typeSchemas}`,
            );
        }

        if (this.opts.fhirSchemas && tsIndex.register) {
            const outputPath = this.opts.fhirSchemas;
            const fhirSchemas = tsIndex.register.allFs();

            if (Path.extname(outputPath) === ".ndjson") {
                this.writeNdjson(fhirSchemas, outputPath, fhirSchemaToJson);
            } else {
                this.writeJsonFiles(
                    fhirSchemas.map((fs) => fhirSchemaToJson(fs, true)),
                    outputPath,
                );
            }

            this.logger()?.info(`IntrospectionWriter: ${fhirSchemas.length} FHIR schema written to ${outputPath}`);
        }

        if (this.opts.structureDefinitions && tsIndex.register) {
            const outputPath = this.opts.structureDefinitions;
            const structureDefinitions = tsIndex.register.allSd();

            if (Path.extname(outputPath) === ".ndjson") {
                this.writeNdjson(structureDefinitions, outputPath, structureDefinitionToJson);
            } else {
                this.writeJsonFiles(
                    structureDefinitions.map((sd) => structureDefinitionToJson(sd, true)),
                    outputPath,
                );
            }

            this.logger()?.info(
                `IntrospectionWriter: ${structureDefinitions.length} StructureDefinitions written to ${outputPath}`,
            );
        }
    }

    private async writeNdjson<T>(
        items: T[],
        outputFile: string,
        toJson: (item: T, pretty: boolean) => { filename: string; genContent: () => string },
    ): Promise<void> {
        this.cd(Path.dirname(outputFile), () => {
            this.cat(Path.basename(outputFile), () => {
                for (const item of items) {
                    const { genContent } = toJson(item, false);
                    this.write(`${genContent()}\n`);
                }
            });
        });
    }

    private async writeJsonFiles(
        items: { filename: string; genContent: () => string }[],
        outputDir: string,
    ): Promise<void> {
        this.cd(outputDir, () => {
            for (const { filename, genContent } of items) {
                const fileName = `${filename}.json`;
                this.cd(Path.dirname(fileName), () => {
                    this.cat(Path.basename(fileName), () => {
                        this.write(genContent());
                    });
                });
            }
        });
    }

    private async writeTypeTree(tsIndex: TypeSchemaIndex): Promise<void> {
        const filename = this.opts.typeTree;
        if (!filename) return;

        const tree = tsIndex.entityTree();
        const raw = filename.endsWith(".yaml") ? YAML.stringify(tree) : JSON.stringify(tree, undefined, 2);

        const dir = Path.dirname(filename);
        const file = Path.basename(filename);

        this.cd(dir, () => {
            this.cat(file, () => {
                this.write(raw);
            });
        });
    }
}
