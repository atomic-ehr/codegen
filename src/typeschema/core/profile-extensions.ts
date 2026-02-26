/**
 * Profile Extension Extraction
 *
 * Extracts ProfileExtension data from FHIR schemas with derivation === "constraint".
 * Handles both legacy sub-extension format (extension:name) and modern slicing format.
 */

import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@root/typeschema/register";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import {
    type CanonicalUrl,
    concatIdentifiers,
    type ExtensionSubField,
    type Identifier,
    type Name,
    type ProfileExtension,
    type RichFHIRSchema,
} from "@typeschema/types";

import { buildFieldType } from "./field-builder";

const extractExtensionValueTypes = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    extensionUrl: CanonicalUrl,
    logger?: CodegenLogger,
): Identifier[] | undefined => {
    const extensionSchema = register.resolveFs(fhirSchema.package_meta, extensionUrl);
    if (!extensionSchema?.elements) return undefined;

    const valueTypes: Identifier[] = [];
    for (const [key, element] of Object.entries(extensionSchema.elements)) {
        if (element.choiceOf !== "value" && !key.startsWith("value")) continue;
        const fieldType = buildFieldType(register, extensionSchema, [key], element, logger);
        if (fieldType) valueTypes.push(fieldType);
    }

    return concatIdentifiers(valueTypes);
};

const extractLegacySubExtensions = (
    register: Register,
    extensionSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): ExtensionSubField[] => {
    const subExtensions: ExtensionSubField[] = [];
    if (!extensionSchema.elements) return subExtensions;

    for (const [key, element] of Object.entries(extensionSchema.elements)) {
        if (!key.startsWith("extension:")) continue;

        const sliceName = key.split(":")[1];
        if (!sliceName) continue;

        let valueType: Identifier | undefined;
        for (const [elemKey, elemValue] of Object.entries(element.elements ?? {})) {
            if (elemValue.choiceOf !== "value" && !elemKey.startsWith("value")) continue;
            valueType = buildFieldType(register, extensionSchema, [key, elemKey], elemValue, logger);
            if (valueType) break;
        }

        subExtensions.push({
            name: sliceName,
            url: element.url ?? sliceName,
            valueType,
            min: element.min,
            max: element.max !== undefined ? String(element.max) : undefined,
        });
    }
    return subExtensions;
};

const extractSlicingSubExtensions = (extensionSchema: RichFHIRSchema): ExtensionSubField[] => {
    const subExtensions: ExtensionSubField[] = [];
    const extensionElement = extensionSchema.elements?.extension as any;
    const slices = extensionElement?.slicing?.slices;
    if (!slices || typeof slices !== "object") return subExtensions;

    for (const [sliceName, sliceData] of Object.entries(slices)) {
        const slice = sliceData as any;
        const schema = slice.schema;
        if (!schema) continue;

        let valueType: Identifier | undefined;
        for (const [elemKey, elemValue] of Object.entries(schema.elements ?? {})) {
            const elem = elemValue as any;
            if (elem.choiceOf !== "value" && !elemKey.startsWith("value")) continue;
            if (elem.type) {
                valueType = {
                    kind: "complex-type" as const,
                    package: extensionSchema.package_meta.name,
                    version: extensionSchema.package_meta.version,
                    name: elem.type as any,
                    url: `http://hl7.org/fhir/StructureDefinition/${elem.type}` as CanonicalUrl,
                };
                break;
            }
        }

        subExtensions.push({
            name: sliceName,
            url: slice.match?.url ?? sliceName,
            valueType,
            min: schema._required ? 1 : (schema.min ?? 0),
            // biome-ignore lint/style/noNestedTernary : okay here
            max: schema.max !== undefined ? String(schema.max) : schema.array ? "*" : "1",
        });
    }
    return subExtensions;
};

const extractSubExtensions = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    extensionUrl: CanonicalUrl,
    logger?: CodegenLogger,
): ExtensionSubField[] | undefined => {
    const extensionSchema = register.resolveFs(fhirSchema.package_meta, extensionUrl);
    if (!extensionSchema?.elements) return undefined;

    const legacySubs = extractLegacySubExtensions(register, extensionSchema, logger);
    const slicingSubs = extractSlicingSubExtensions(extensionSchema);
    const subExtensions = [...legacySubs, ...slicingSubs];

    return subExtensions.length > 0 ? subExtensions : undefined;
};

export const extractProfileExtensions = (
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): ProfileExtension[] | undefined => {
    const extensions: ProfileExtension[] = [];

    const addExtensionEntry = (path: string[], name: string, schema: FHIRSchemaElement) => {
        let url = schema.url as CanonicalUrl | undefined;
        let valueTypes = url ? extractExtensionValueTypes(register, fhirSchema, url, logger) : undefined;
        const subExtensions = url ? extractSubExtensions(register, fhirSchema, url, logger) : undefined;

        // For extension profiles, sub-extension entries may lack a url.
        // Fall back to slicing data to extract the url and value type.
        if (!url) {
            const sliceSchema = (fhirSchema.elements?.extension as any)?.slicing?.slices?.[name]?.schema;
            if (sliceSchema) {
                url = (sliceSchema.elements?.url?.fixed?.value ?? name) as CanonicalUrl;
                for (const [_elemKey, elemValue] of Object.entries(sliceSchema.elements ?? {})) {
                    const elem = elemValue as { choiceOf?: string; type?: string };
                    if (elem.choiceOf === "value" && elem.type) {
                        valueTypes = [
                            {
                                kind: "complex-type" as const,
                                package: fhirSchema.package_meta.name,
                                version: fhirSchema.package_meta.version,
                                name: elem.type as Name,
                                url: `http://hl7.org/fhir/StructureDefinition/${elem.type}` as CanonicalUrl,
                            },
                        ];
                        break;
                    }
                }
            }
        }

        const isComplex = subExtensions && subExtensions.length > 0;
        extensions.push({
            name,
            path: [...path, "extension"].join("."),
            url,
            min: schema.min,
            max: schema.max !== undefined ? String(schema.max) : undefined,
            mustSupport: schema.mustSupport,
            valueTypes,
            subExtensions,
            isComplex,
        });
    };

    const walkElement = (path: string[], element: Pick<FHIRSchemaElement, "extensions" | "elements">) => {
        if (element.extensions) {
            for (const [name, schema] of Object.entries(element.extensions)) {
                addExtensionEntry(path, name, schema);
            }
        }
        if (element.elements) {
            for (const [key, child] of Object.entries(element.elements)) {
                walkElement([...path, key], child);
            }
        }
    };

    walkElement([], fhirSchema);

    return extensions.length === 0 ? undefined : extensions;
};
