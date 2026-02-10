import assert from "node:assert";
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
            if (Path.extname(this.opts.typeSchemas) === ".ndjson") {
                this.writeNdjson(tsIndex.schemas, this.opts.typeSchemas, typeSchemaToJson);
            } else {
                const items = tsIndex.schemas.map((ts) => typeSchemaToJson(ts, true));
                const seenFilenames = new Set<string>();
                const dedupedItems = items.filter((item) => {
                    if (seenFilenames.has(item.filename)) return false;
                    seenFilenames.add(item.filename);
                    return true;
                });

                this.cd(this.opts.typeSchemas, () => {
                    for (const { filename, genContent } of dedupedItems) {
                        const fileName = `${filename}.json`;
                        this.cd(Path.dirname(fileName), () => {
                            this.cat(Path.basename(fileName), () => {
                                this.write(genContent());
                            });
                        });
                    }

                    for (const [pkg, canonicals] of Object.entries(tsIndex.irReport().collisions ?? {})) {
                        this.cd(`${normalizeFileName(pkg)}`, () => {
                            for (const [canonical, entries] of Object.entries(canonicals)) {
                                if (entries.length <= 1) continue;
                                const firstEntry = entries[0];
                                assert(firstEntry);
                                const name = normalizeFileName(
                                    `${firstEntry.typeSchema.identifier.name}(${extractNameFromCanonical(canonical as CanonicalUrl)})`,
                                );
                                this.cd(Path.join("collisions", name), () => {
                                    for (let i = 0; i < entries.length; i++) {
                                        const entry = entries[i];
                                        this.cat(`${i + 1}.json`, () => {
                                            this.write(JSON.stringify(entry, null, 2));
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }
            this.logger()?.info(
                `IntrospectionWriter: ${tsIndex.schemas.length} TypeSchema written to ${this.opts.typeSchemas}`,
            );
        }

        if (this.opts.fhirSchemas && tsIndex.register) {
            const outputPath = this.opts.fhirSchemas;
            const allFs = tsIndex.register.allFs();
            // Deduplicate FHIR schemas by URL (same schema can appear from different packages)
            const seenUrls = new Set<string>();
            const fhirSchemas = allFs.filter((fs) => {
                if (seenUrls.has(fs.url)) return false;
                seenUrls.add(fs.url);
                return true;
            });

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
            const allSd = tsIndex.register.allSd();
            // Deduplicate SDs by URL (same SD can appear multiple times from different packages)
            const seenUrls = new Set<string>();
            const structureDefinitions = allSd.filter((sd) => {
                if (seenUrls.has(sd.url)) return false;
                seenUrls.add(sd.url);
                return true;
            });

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
