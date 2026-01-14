import * as Path from "node:path";
import type { StructureDefinition } from "@atomic-ehr/fhirschema";
import type { RichFHIRSchema } from "@root/typeschema/types";
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

const typeSchemaToJson = (ts: TypeSchema, pretty: boolean): { filename: string; content: string } => {
    const pkgPath = normalizeFileName(ts.identifier.package);
    const name = normalizeFileName(`${ts.identifier.name}(${extractNameFromCanonical(ts.identifier.url)})`);
    const baseName = Path.join(pkgPath, name);

    return {
        filename: baseName,
        content: JSON.stringify(ts, null, pretty ? 2 : undefined),
    };
};

const fhirSchemaToJson = (fs: RichFHIRSchema, pretty: boolean): { filename: string; content: string } => {
    const pkgPath = normalizeFileName(fs.package_meta.name);
    const name = normalizeFileName(`${fs.name}(${extractNameFromCanonical(fs.url)})`);
    const baseName = Path.join(pkgPath, name);

    return {
        filename: baseName,
        content: JSON.stringify(fs, null, pretty ? 2 : undefined),
    };
};

const structureDefinitionToJson = (sd: StructureDefinition, pretty: boolean): { filename: string; content: string } => {
    const pkgPath = normalizeFileName(sd.package_name ?? "unknown");
    const name = normalizeFileName(`${sd.name}(${extractNameFromCanonical(sd.url as CanonicalUrl)})`);
    const baseName = Path.join(pkgPath, name);

    return {
        filename: baseName,
        content: JSON.stringify(sd, null, pretty ? 2 : undefined),
    };
};

export class IntrospectionWriter extends FileSystemWriter<IntrospectionWriterOptions> {
    async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        if (this.opts.typeSchemas) {
            const outputPath = this.opts.typeSchemas;
            const typeSchemas = tsIndex.schemas;

            this.logger()?.debug(`IntrospectionWriter: Generating ${typeSchemas.length} schemas to ${outputPath}`);

            if (Path.extname(outputPath) === ".ndjson") {
                this.writeNdjson(typeSchemas, outputPath, typeSchemaToJson);
            } else {
                this.writeJsonFiles(
                    typeSchemas.map((ts) => typeSchemaToJson(ts, true)),
                    outputPath,
                );
            }

            this.logger()?.info(`Introspection generation completed: ${typeSchemas.length} schemas written`);
        }

        if (this.opts.typeTree) {
            await this.writeTypeTree(tsIndex);
            this.logger()?.info(`IntrospectionWriter: Type tree exported to ${this.opts.typeTree}`);
        }

        if (this.opts.fhirSchemas && tsIndex.register) {
            const outputPath = this.opts.fhirSchemas;
            const fhirSchemas = tsIndex.register.allFs();

            this.logger()?.debug(`IntrospectionWriter: Generating ${fhirSchemas.length} FHIR schemas to ${outputPath}`);

            if (Path.extname(outputPath) === ".ndjson") {
                this.writeNdjson(fhirSchemas, outputPath, fhirSchemaToJson);
            } else {
                this.writeJsonFiles(
                    fhirSchemas.map((fs) => fhirSchemaToJson(fs, true)),
                    outputPath,
                );
            }

            this.logger()?.info(`FHIR schema generation completed: ${fhirSchemas.length} schemas written`);
        }

        if (this.opts.structureDefinitions && tsIndex.register) {
            const outputPath = this.opts.structureDefinitions;
            const structureDefinitions = tsIndex.register.allSd();

            this.logger()?.debug(
                `IntrospectionWriter: Generating ${structureDefinitions.length} StructureDefinitions to ${outputPath}`,
            );

            if (Path.extname(outputPath) === ".ndjson") {
                this.writeNdjson(structureDefinitions, outputPath, structureDefinitionToJson);
            } else {
                this.writeJsonFiles(
                    structureDefinitions.map((sd) => structureDefinitionToJson(sd, true)),
                    outputPath,
                );
            }

            this.logger()?.info(
                `StructureDefinition generation completed: ${structureDefinitions.length} schemas written`,
            );
        }
    }

    private async writeNdjson<T>(
        items: T[],
        outputFile: string,
        toJson: (item: T, pretty: boolean) => { filename: string; content: string },
    ): Promise<void> {
        this.cd(Path.dirname(outputFile), () => {
            this.cat(Path.basename(outputFile), () => {
                for (const item of items) {
                    const { content } = toJson(item, false);
                    this.write(`${content}\n`);
                }
            });
        });
    }

    private async writeJsonFiles(items: { filename: string; content: string }[], outputDir: string): Promise<void> {
        this.cd(outputDir, () => {
            for (const { filename, content } of items) {
                const fileName = `${filename}.json`;
                this.cd(Path.dirname(fileName), () => {
                    this.cat(Path.basename(fileName), () => {
                        this.write(content);
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
