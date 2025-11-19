/**
 * Extension Accessor Generation
 *
 * Generates TypeScript property accessors for FHIR extensions in profile adapters.
 * Dedicated methods for each extension with internal URL handling.
 *
 * Two patterns:
 * 1. Singleton (max=1): get/set properties returning Extension | undefined
 * 2. Collection (max=*): get property returning Extension[], add/remove methods
 */

import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileExtension } from "@root/typeschema/types";
import { tsFieldName } from "./utils";

/**
 * Capitalize first letter of string
 */
function capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Get extension URL (handles both string and array)
 */
function getExtensionUrl(extension: ProfileExtension): string {
    if (Array.isArray(extension.profile)) {
        return extension.profile[0] || "";
    }
    return extension.profile;
}

/**
 * Generate extension accessor (getter + setter/methods)
 *
 * Two patterns:
 * 1. Singleton (max=1): get/set Extension | undefined
 * 2. Collection (max=*): get Extension[], add/remove methods
 */
export function generateExtensionAccessor(writer: Writer, extension: ProfileExtension): void {
    const isSingleton = extension.max === "1";

    if (isSingleton) {
        generateSingletonExtensionAccessor(writer, extension);
    } else {
        generateCollectionExtensionAccessor(writer, extension);
    }
}

/**
 * Generate singleton extension accessor (max=1)
 */
function generateSingletonExtensionAccessor(writer: Writer, extension: ProfileExtension): void {
    const fieldName = tsFieldName(extension.path);
    const url = getExtensionUrl(extension);
    const required = (extension.min ?? 0) > 0;

    writer.comment("Extension: " + extension.path);
    writer.comment("URL: " + url);
    writer.comment("Cardinality: " + (extension.min ?? 0) + ".." + (extension.max ?? "*"));
    writer.line();

    // Getter
    generateSingletonGetter(writer, fieldName, url);
    writer.line();

    // Setter
    generateSingletonSetter(writer, fieldName, url, required);
}

/**
 * Generate property getter for singleton extension
 */
function generateSingletonGetter(writer: Writer, fieldName: string, url: string): void {
    const propName = tsFieldName(fieldName);

    writer.curlyBlock(["get " + propName + "():", "Extension | undefined"], () => {
        writer.lineSM("return this._resource.extension?.find(ext => ext.url === '" + url + "')");
    });
}

/**
 * Generate property setter for singleton extension
 */
function generateSingletonSetter(writer: Writer, fieldName: string, url: string, required: boolean): void {
    const propName = tsFieldName(fieldName);

    writer.curlyBlock(["set " + propName + "(value:", "Extension | undefined)"], () => {
        // Validate if required
        if (required) {
            writer.curlyBlock(["if (value === undefined)"], () => {
                writer.lineSM('throw new Error("Extension ' + fieldName + ' is required in this profile")');
            });
        }

        // Ensure extension array exists
        writer.curlyBlock(["if (!this._resource.extension)"], () => {
            writer.lineSM("this._resource.extension = []");
        });
        writer.line();

        // Find existing extension
        writer.lineSM("const index = this._resource.extension.findIndex(ext => ext.url === '" + url + "')");
        writer.line();

        // Update or remove
        writer.curlyBlock(["if (value === undefined)"], () => {
            writer.comment("Remove extension");
            writer.curlyBlock(["if (index >= 0)"], () => {
                writer.lineSM("this._resource.extension.splice(index, 1)");
            });
        });
        writer.curlyBlock(["else"], () => {
            writer.comment("Update or add extension");
            writer.lineSM("value.url = '" + url + "'");
            writer.curlyBlock(["if (index >= 0)"], () => {
                writer.lineSM("this._resource.extension[index] = value");
            });
            writer.curlyBlock(["else"], () => {
                writer.lineSM("this._resource.extension.push(value)");
            });
        });
    });
}

/**
 * Generate collection extension accessor (max=*)
 */
function generateCollectionExtensionAccessor(writer: Writer, extension: ProfileExtension): void {
    const fieldName = tsFieldName(extension.path);
    const url = getExtensionUrl(extension);

    writer.comment("Extension Collection: " + extension.path);
    writer.comment("URL: " + url);
    writer.comment("Cardinality: " + (extension.min ?? 0) + ".." + (extension.max ?? "*"));
    writer.line();

    // Getter (returns array)
    generateCollectionGetter(writer, fieldName, url);
    writer.line();

    // Add method
    generateCollectionAdd(writer, fieldName, url, extension.max);
    writer.line();

    // Remove method
    generateCollectionRemove(writer, fieldName, url);
}

/**
 * Generate property getter for collection extension
 */
function generateCollectionGetter(writer: Writer, fieldName: string, url: string): void {
    const propName = tsFieldName(fieldName);

    writer.curlyBlock(["get " + propName + "():", "Extension[]"], () => {
        writer.lineSM("return this._resource.extension?.filter(ext => ext.url === '" + url + "') ?? []");
    });
}

/**
 * Generate add method for collection extension
 */
function generateCollectionAdd(writer: Writer, fieldName: string, url: string, max: string | undefined): void {
    const methodName = "add" + capitalize(fieldName);
    const propName = tsFieldName(fieldName);

    writer.curlyBlock([methodName, "(extension: Extension): void"], () => {
        // Check max cardinality if specified
        if (max && max !== "*") {
            writer.curlyBlock(["if (this." + propName + ".length >= " + max + ")"], () => {
                writer.lineSM('throw new Error("Extension ' + fieldName + " allows at most " + max + ' instances")');
            });
            writer.line();
        }

        writer.comment("Ensure URL is set correctly");
        writer.lineSM("extension.url = '" + url + "'");
        writer.line();

        writer.curlyBlock(["if (!this._resource.extension)"], () => {
            writer.lineSM("this._resource.extension = []");
        });
        writer.line();

        writer.lineSM("this._resource.extension.push(extension)");
    });
}

/**
 * Generate remove method for collection extension
 */
function generateCollectionRemove(writer: Writer, fieldName: string, url: string): void {
    const methodName = "remove" + capitalize(fieldName);

    writer.curlyBlock([methodName, "(predicate: (ext: Extension) => boolean): boolean"], () => {
        writer.curlyBlock(["if (!this._resource.extension)"], () => {
            writer.lineSM("return false");
        });
        writer.line();

        writer.lineSM(
            "const index = this._resource.extension.findIndex(ext => ext.url === '" + url + "' && predicate(ext))",
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
