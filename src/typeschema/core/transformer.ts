/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import {
    type CanonicalUrl,
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

/**
 * Check if a FHIR schema represents an extension
 */
function isExtensionSchema(fhirSchema: FHIRSchema, _identifier: Identifier): boolean {
    // Check if this is based on Extension
    if (fhirSchema.base === "Extension" || fhirSchema.base === "http://hl7.org/fhir/StructureDefinition/Extension") {
        return true;
    }

    // Check if the URL indicates this is an extension
    if (fhirSchema.url?.includes("/extension/") || fhirSchema.url?.includes("-extension")) {
        return true;
    }

    // Check if the name indicates this is an extension
    if (fhirSchema.name?.toLowerCase().includes("extension")) {
        return true;
    }

    // Check if the type is Extension
    if (fhirSchema.type === "Extension") {
        return true;
    }

    return false;
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

    const uniqDeps: Record<string, Identifier> = {};
    for (const dep of deps) {
        if (dep.url === identifier.url) continue;
        uniqDeps[dep.url] = dep;
    }

    const localNestedTypeUrls = new Set(nestedTypes?.map((nt) => nt.identifier.url));

    const result = Object.values(uniqDeps)
        .filter((e) => {
            if (isProfileIdentifier(identifier)) return true;
            if (!isNestedIdentifier(e)) return true;
            return !localNestedTypeUrls.has(e.url);
        })
        .sort((a, b) => a.url.localeCompare(b.url));

    return result.length > 0 ? result : undefined;
}

function transformFhirSchemaResource(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): TypeSchema[] {
    const identifier = mkIdentifier(fhirSchema);

    let base: Identifier | undefined;
    if (fhirSchema.base && fhirSchema.type !== "Element") {
        const baseFs = register.resolveFs(
            fhirSchema.package_meta,
            register.ensureSpecializationCanonicalUrl(fhirSchema.base),
        );
        if (!baseFs) {
            throw new Error(
                `Base resource not found '${fhirSchema.base}' for <${fhirSchema.url}> from ${packageMetaToFhir(fhirSchema.package_meta)}`,
            );
        }
        base = mkIdentifier(baseFs);
    }
    const fields = mkFields(register, fhirSchema, [], fhirSchema.elements, logger);
    const nested = mkNestedTypes(register, fhirSchema, logger);
    const extensions =
        fhirSchema.derivation === "constraint" ? extractProfileExtensions(register, fhirSchema, logger) : undefined;
    const dependencies = extractDependencies(identifier, base, fields, nested);
    const extensionDeps = extensions?.flatMap((ext) => ext.valueTypes ?? []) ?? [];
    const mergedDeps = (() => {
        if (!dependencies && extensionDeps.length === 0) return dependencies;
        const depMap: Record<string, Identifier> = {};
        for (const dep of dependencies ?? []) depMap[dep.url] = dep;
        for (const dep of extensionDeps) depMap[dep.url] = dep;
        return Object.values(depMap);
    })();

    const typeSchema: TypeSchema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies: mergedDeps,
        ...(extensions && extensions.length > 0 ? { extensions } : {}),
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

    if (valueTypes.length === 0) return undefined;
    const uniq = new Map(valueTypes.map((type) => [type.url, type]));
    return Array.from(uniq.values());
}

function extractSubExtensions(
    register: Register,
    fhirSchema: RichFHIRSchema,
    extensionUrl: CanonicalUrl,
    logger?: CodegenLogger,
): ExtensionSubField[] | undefined {
    const extensionSchema = register.resolveFs(fhirSchema.package_meta, extensionUrl);
    if (!extensionSchema?.elements) return undefined;

    const subExtensions: ExtensionSubField[] = [];

    // Check for extension:sliceName pattern in elements (legacy format)
    for (const [key, element] of Object.entries(extensionSchema.elements)) {
        if (!key.startsWith("extension:")) continue;

        const sliceName = key.split(":")[1];
        if (!sliceName) continue;

        const sliceUrl = element.url ?? sliceName;

        let valueType: Identifier | undefined;
        for (const [elemKey, elemValue] of Object.entries(element.elements ?? {})) {
            if (elemValue.choiceOf !== "value" && !elemKey.startsWith("value")) continue;
            valueType = buildFieldType(register, extensionSchema, [key, elemKey], elemValue, logger);
            if (valueType) break;
        }

        subExtensions.push({
            name: sliceName,
            url: sliceUrl,
            valueType,
            min: element.min,
            max: element.max !== undefined ? String(element.max) : undefined,
        });
    }

    // Check for slices in extension.slicing.slices (new format)
    const extensionElement = extensionSchema.elements["extension"] as any;
    const slices = extensionElement?.slicing?.slices;
    if (slices && typeof slices === "object") {
        for (const [sliceName, sliceData] of Object.entries(slices)) {
            const slice = sliceData as any;
            const schema = slice.schema;
            if (!schema) continue;

            const sliceUrl = slice.match?.url ?? sliceName;

            let valueType: Identifier | undefined;
            const schemaElements = schema.elements ?? {};
            for (const [elemKey, elemValue] of Object.entries(schemaElements)) {
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
                url: sliceUrl,
                valueType,
                min: schema._required ? 1 : (schema.min ?? 0),
                // biome-ignore lint/style/noNestedTernary : okay here
                max: schema.max !== undefined ? String(schema.max) : schema.array ? "*" : "1",
            });
        }
    }

    return subExtensions.length > 0 ? subExtensions : undefined;
}

function extractProfileExtensions(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): ProfileExtension[] {
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

    return extensions;
}

export async function transformFhirSchema(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): Promise<TypeSchema[]> {
    const schemas = transformFhirSchemaResource(register, fhirSchema, logger);
    if (isExtensionSchema(fhirSchema, mkIdentifier(fhirSchema))) {
        const schema = schemas[0];
        if (!schema) throw new Error(`Expected schema to be defined`);
        (schema as any).metadata = {
            isExtension: true, // Mark as extension for file organization
        };
    }
    return schemas;
}
