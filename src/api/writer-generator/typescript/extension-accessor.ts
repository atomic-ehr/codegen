import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileExtension } from "@root/typeschema/types";
import { tsFieldName } from "./utils";

function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getExtensionUrl(extension: ProfileExtension): string {
    if (Array.isArray(extension.profile)) {
        return extension.profile[0] || "";
    }
    return extension.profile;
}

export function generateExtensionAccessor(writer: Writer, extension: ProfileExtension): void {
    const isSingleton = extension.max === "1";

    if (isSingleton) {
        generateSingletonExtensionAccessor(writer, extension);
    } else {
        generateCollectionExtensionAccessor(writer, extension);
    }
}

function generateSingletonExtensionAccessor(writer: Writer, extension: ProfileExtension): void {
    const fieldName = tsFieldName(extension.path);
    const url = getExtensionUrl(extension);
    const required = (extension.min ?? 0) > 0;

    writer.comment(`Extension: ${extension.path}`);
    writer.comment(`URL: ${url}`);
    writer.comment(`Cardinality: ${extension.min ?? 0}..${extension.max ?? "*"}`);
    writer.line();

    generateSingletonGetter(writer, fieldName, url);
    writer.line();

    generateSingletonSetter(writer, fieldName, url, required);
}

function generateSingletonGetter(writer: Writer, fieldName: string, url: string): void {
    const propName = tsFieldName(fieldName);

    writer.curlyBlock([`get ${propName}():`, "Extension | undefined"], () => {
        writer.lineSM(`return this._resource.extension?.find(ext => ext.url === '${url}')`);
    });
}

function generateSingletonSetter(writer: Writer, fieldName: string, url: string, required: boolean): void {
    const propName = tsFieldName(fieldName);

    writer.curlyBlock([`set ${propName}(value:`, "Extension | undefined)"], () => {
        if (required) {
            writer.curlyBlock(["if (value === undefined)"], () => {
                writer.lineSM(`throw new Error("Extension ${fieldName} is required in this profile")`);
            });
        }

        writer.curlyBlock(["if (!this._resource.extension)"], () => {
            writer.lineSM("this._resource.extension = []");
        });
        writer.line();

        writer.lineSM(`const index = this._resource.extension.findIndex(ext => ext.url === '${url}')`);
        writer.line();

        writer.curlyBlock(["if (value === undefined)"], () => {
            writer.curlyBlock(["if (index >= 0)"], () => {
                writer.lineSM("this._resource.extension.splice(index, 1)");
            });
        });
        writer.curlyBlock(["else"], () => {
            writer.lineSM(`value.url = '${url}'`);
            writer.curlyBlock(["if (index >= 0)"], () => {
                writer.lineSM("this._resource.extension[index] = value");
            });
            writer.curlyBlock(["else"], () => {
                writer.lineSM("this._resource.extension.push(value)");
            });
        });
    });
}

function generateCollectionExtensionAccessor(writer: Writer, extension: ProfileExtension): void {
    const fieldName = tsFieldName(extension.path);
    const url = getExtensionUrl(extension);

    writer.comment(`Extension Collection: ${extension.path}`);
    writer.comment(`URL: ${url}`);
    writer.comment(`Cardinality: ${extension.min ?? 0}..${extension.max ?? "*"}`);
    writer.line();

    generateCollectionGetter(writer, fieldName, url);
    writer.line();

    generateCollectionAdd(writer, fieldName, url, extension.max);
    writer.line();

    generateCollectionRemove(writer, fieldName, url);
}

function generateCollectionGetter(writer: Writer, fieldName: string, url: string): void {
    const propName = tsFieldName(fieldName);

    writer.curlyBlock([`get ${propName}():`, "Extension[]"], () => {
        writer.lineSM(`return this._resource.extension?.filter(ext => ext.url === '${url}') ?? []`);
    });
}

function generateCollectionAdd(writer: Writer, fieldName: string, url: string, max: string | undefined): void {
    const methodName = `add${capitalize(fieldName)}`;
    const propName = tsFieldName(fieldName);

    writer.curlyBlock([methodName, "(extension: Extension): void"], () => {
        if (max && max !== "*") {
            writer.curlyBlock([`if (this.${propName}.length >= ${max})`], () => {
                writer.lineSM(`throw new Error("Extension ${fieldName} allows at most ${max} instances")`);
            });
            writer.line();
        }

        writer.lineSM(`extension.url = '${url}'`);
        writer.line();

        writer.curlyBlock(["if (!this._resource.extension)"], () => {
            writer.lineSM("this._resource.extension = []");
        });
        writer.line();

        writer.lineSM("this._resource.extension.push(extension)");
    });
}

function generateCollectionRemove(writer: Writer, fieldName: string, url: string): void {
    const methodName = `remove${capitalize(fieldName)}`;

    writer.curlyBlock([methodName, "(predicate: (ext: Extension) => boolean): boolean"], () => {
        writer.curlyBlock(["if (!this._resource.extension)"], () => {
            writer.lineSM("return false");
        });
        writer.line();

        writer.lineSM(
            `const index = this._resource.extension.findIndex(ext => ext.url === '${url}' && predicate(ext))`,
        );
        writer.line();

        writer.curlyBlock(["if (index >= 0)"], () => {
            writer.lineSM("this._resource.extension.splice(index, 1)");
            writer.lineSM("return true");
        });
        writer.line();

        writer.lineSM("return false");
    });
}
