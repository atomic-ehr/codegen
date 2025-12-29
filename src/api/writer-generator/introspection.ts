import * as Path from "node:path";
import { extractNameFromCanonical, type TypeSchema } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import YAML from "yaml";
import { FileSystemWriter, type FileSystemWriterOptions } from "./writer";

export interface IntrospectionWriterOptions extends FileSystemWriterOptions {
    typeSchemas?: string /** if .ndjson -- put in one file, else -- split into separated files*/;
    typeTree?: string /** .json or .yaml file */;
}

const normalizeFileName = (str: string): string => {
    const res = str.replace(/[^a-zA-Z0-9\-_.@#()]/g, "");
    if (res.length === 0) return "unknown";
    return res;
};

export class IntrospectionWriter extends FileSystemWriter<IntrospectionWriterOptions> {
    async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        if (this.opts.typeSchemas) {
            const outputPath = this.opts.typeSchemas;
            const typeSchemas = tsIndex.schemas;

            this.logger()?.debug(`IntrospectionWriter: Generating ${typeSchemas.length} schemas to ${outputPath}`);

            if (Path.extname(outputPath) === ".ndjson") {
                this.writeToSingleFile(typeSchemas, outputPath);
            } else {
                this.writeToSeparateFiles(typeSchemas, outputPath);
            }

            this.logger()?.info(`Introspection generation completed: ${typeSchemas.length} schemas written`);
        }

        if (this.opts.typeTree) {
            await this.writeTypeTree(tsIndex);
            this.logger()?.info(`IntrospectionWriter: Type tree exported to ${this.opts.typeTree}`);
        }
    }

    private async writeToSingleFile(typeSchemas: TypeSchema[], outputFile: string): Promise<void> {
        this.logger()?.info(`Writing introspection data to single file: ${outputFile}`);

        const dir = Path.dirname(outputFile);
        const file = Path.basename(outputFile);

        this.cd(dir, () => {
            this.cat(file, () => {
                for (const ts of typeSchemas) {
                    const json = JSON.stringify(ts);
                    this.write(`${json}\n`);
                }
            });
        });

        this.logger()?.info(`Single file output: ${typeSchemas.length} introspection entries written to ${outputFile}`);
    }

    private async writeToSeparateFiles(typeSchemas: TypeSchema[], outputDir: string): Promise<void> {
        this.logger()?.info(`Writing introspection data to separate files in ${outputDir}`);

        // Group introspection data by package and name
        const files: Record<string, TypeSchema[]> = {};

        for (const ts of typeSchemas) {
            const pkgPath = normalizeFileName(ts.identifier.package);
            const name = normalizeFileName(`${ts.identifier.name}(${extractNameFromCanonical(ts.identifier.url)})`);
            const baseName = Path.join(pkgPath, name);

            if (!files[baseName]) {
                files[baseName] = [];
            }

            if (!files[baseName].some((e) => JSON.stringify(e) === JSON.stringify(ts))) {
                files[baseName].push(ts);
            }
        }

        this.cd(outputDir, () => {
            for (const [baseName, schemas] of Object.entries(files)) {
                schemas.forEach((schema, index) => {
                    const fileName =
                        index === 0 ? `${baseName}.introspection.json` : `${baseName}-${index}.introspection.json`;
                    const dir = Path.dirname(fileName);
                    const file = Path.basename(fileName);

                    this.cd(dir, () => {
                        this.cat(file, () => {
                            const json = JSON.stringify(schema, null, 2);
                            this.write(json);
                        });
                    });
                });
            }
        });

        this.logger()?.info(
            `Separate files output: ${typeSchemas.length} introspection entries written to ${outputDir} in ${Object.keys(files).length} groups`,
        );
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
