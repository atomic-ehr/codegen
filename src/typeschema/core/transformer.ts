/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import { shouldSkipCanonical } from "@root/typeschema/skip-hack";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import {
    type CanonicalUrl,
    concatIdentifiers,
    type ExtensionSubField,
    type Field,
    type Identifier,
    isNestedIdentifier,
    isProfileIdentifier,
    type NestedType,
    type ProfileExtension,
    packageMetaToFhir,
    type RichFHIRSchema,
    type RichValueSet,
    type TypeSchema,
    type ValueSetTypeSchema,
} from "@typeschema/types";

import { collectBindingSchemas, extractValueSetConceptsByUrl } from "./binding";
import { buildFieldType, isNestedElement, mkField, mkNestedField } from "./field-builder";
import { mkIdentifier, mkValueSetIdentifierByUrl } from "./identifier";
import { extractNestedDependencies, mkNestedTypes } from "./nested-types";

export function mkFields(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement> | undefined,
    logger?: CodegenLogger,
): Record<string, Field> | undefined {
    if (!elements) return undefined;

    const fields: Record<string, Field> = {};
    for (const key of register.getAllElementKeys(elements)) {
        const path = [...parentPath, key];
        const elemSnapshot = register.resolveElementSnapshot(fhirSchema, path);
        const fcurl = elemSnapshot.type ? register.ensureSpecializationCanonicalUrl(elemSnapshot.type) : undefined;
        if (fcurl && shouldSkipCanonical(fhirSchema.package_meta, fcurl).shouldSkip) {
            logger?.warn(
                `Skipping field ${path} for ${fcurl} due to skip hack ${shouldSkipCanonical(fhirSchema.package_meta, fcurl).reason}`,
            );
            continue;
        }
        if (isNestedElement(elemSnapshot)) {
            fields[key] = mkNestedField(register, fhirSchema, path, elemSnapshot, logger);
        } else {
            fields[key] = mkField(register, fhirSchema, path, elemSnapshot, logger);
        }
    }

    return fields;
}

function extractFieldDependencies(fields: Record<string, Field>): Identifier[] {
    const deps: Identifier[] = [];

    for (const field of Object.values(fields)) {
        if ("type" in field && field.type) {
            deps.push(field.type);
        }
        if ("binding" in field && field.binding) {
            deps.push(field.binding);
        }
    }

    return deps;
}

export async function transformValueSet(
    register: Register,
    valueSet: RichValueSet,
    logger?: CodegenLogger,
): Promise<ValueSetTypeSchema> {
    if (!valueSet.url) throw new Error("ValueSet URL is required");

    const identifier = mkValueSetIdentifierByUrl(register, valueSet.package_meta, valueSet.url);
    const concept = extractValueSetConceptsByUrl(register, valueSet.package_meta, valueSet.url, logger);
    return {
        identifier: identifier,
        description: valueSet.description,
        concept: concept,
        compose: !concept ? valueSet.compose : undefined,
    };
}

export function extractDependencies(
    identifier: Identifier,
    base: Identifier | undefined,
    fields: Record<string, Field> | undefined,
    nestedTypes: NestedType[] | undefined,
): Identifier[] | undefined {
    const deps = [];
    if (base) deps.push(base);
    if (fields) deps.push(...extractFieldDependencies(fields));
    if (nestedTypes) deps.push(...extractNestedDependencies(nestedTypes));

    const localNestedTypeUrls = new Set(nestedTypes?.map((nt) => nt.identifier.url));

    const filtered = deps.filter((dep) => {
        if (dep.url === identifier.url) return false;
        if (isProfileIdentifier(identifier)) return true;
        if (!isNestedIdentifier(dep)) return true;
        return !localNestedTypeUrls.has(dep.url);
    });

    return concatIdentifiers(filtered);
}

function transformFhirSchemaResource(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): TypeSchema[] {
    const identifier = mkIdentifier(fhirSchema);

    let base: Identifier | undefined;
    if (fhirSchema.base) {
        const baseFs = register.resolveFs(
            fhirSchema.package_meta,
            register.ensureSpecializationCanonicalUrl(fhirSchema.base),
        );
        if (!baseFs)
            throw new Error(
                `Base resource not found '${fhirSchema.base}' for <${fhirSchema.url}> from ${packageMetaToFhir(fhirSchema.package_meta)}`,
            );
        base = mkIdentifier(baseFs);
    }

    const fields = mkFields(register, fhirSchema, [], fhirSchema.elements, logger);
    const nested = mkNestedTypes(register, fhirSchema, logger);

    const extensions =
        fhirSchema.derivation === "constraint" ? extractProfileExtensions(register, fhirSchema, logger) : undefined;
    const extensionDeps = extensions?.flatMap((ext) => ext.valueTypes ?? []) ?? [];
    const dependencies = extractDependencies(identifier, base, fields, nested);

    const typeSchema: TypeSchema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies: concatIdentifiers(dependencies, extensionDeps),
        extensions,
    };

    const bindingSchemas = collectBindingSchemas(register, fhirSchema, logger);
    return [typeSchema, ...bindingSchemas];
}

function extractExtensionValueTypes(
    register: Register,
    fhirSchema: RichFHIRSchema,
    extensionUrl: CanonicalUrl,
    logger?: CodegenLogger,
): Identifier[] | undefined {
    const extensionSchema = register.resolveFs(fhirSchema.package_meta, extensionUrl);
    if (!extensionSchema?.elements) return undefined;

    const valueTypes: Identifier[] = [];
    for (const [key, element] of Object.entries(extensionSchema.elements)) {
        if (element.choiceOf !== "value" && !key.startsWith("value")) continue;
        const fieldType = buildFieldType(register, extensionSchema, [key], element, logger);
        if (fieldType) valueTypes.push(fieldType);
    }

    return concatIdentifiers(valueTypes);
}

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

function extractProfileExtensions(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): ProfileExtension[] | undefined {
    const extensions: ProfileExtension[] = [];

    const addExtensionEntry = (path: string[], name: string, schema: FHIRSchemaElement) => {
        const url = schema.url as CanonicalUrl | undefined;
        const valueTypes = url ? extractExtensionValueTypes(register, fhirSchema, url, logger) : undefined;
        const subExtensions = url ? extractSubExtensions(register, fhirSchema, url, logger) : undefined;
        const isComplex = subExtensions !== undefined && subExtensions.length > 0;
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

    const walkElement = (path: string[], element: FHIRSchemaElement) => {
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

    if (fhirSchema.extensions) {
        for (const [name, schema] of Object.entries(fhirSchema.extensions)) {
            addExtensionEntry([], name, schema);
        }
    }

    if (fhirSchema.elements) {
        for (const [key, element] of Object.entries(fhirSchema.elements)) {
            walkElement([key], element);
        }
    }

    return extensions.length === 0 ? undefined : extensions;
}

export async function transformFhirSchema(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): Promise<TypeSchema[]> {
    return transformFhirSchemaResource(register, fhirSchema, logger);
}
