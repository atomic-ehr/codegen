/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { Register } from "@typeschema/register";
import type {
    Identifier,
    NestedType,
    RichFHIRSchema,
    TypeSchema,
    TypeSchemaField,
    TypeSchemaForValueSet,
    ValueSetIdentifier,
} from "@typeschema/types";
import { transformProfile } from "../profile/processor";
import type { PackageMeta } from "../types";
import { collectBindingSchemas } from "./binding";
import {
    buildField,
    getElementHierarchy,
    isNestedElement,
    mergeElementHierarchy,
    mkNestedField,
} from "./field-builder";
import { mkIdentifier } from "./identifier";
import { buildNestedTypes, extractNestedDependencies } from "./nested-types";

export async function transformElements(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement> | undefined,
): Promise<Record<string, TypeSchemaField> | undefined> {
    if (!elements) return undefined;

    const fields: Record<string, TypeSchemaField> = {};
    for (const [key, element] of Object.entries(elements)) {
        const path = [...parentPath, key];

        const hierarchy = getElementHierarchy(fhirSchema, path, register);
        const snapshot = hierarchy.length > 0 ? mergeElementHierarchy(hierarchy) : element;

        if (isNestedElement(snapshot)) {
            fields[key] = mkNestedField(fhirSchema, path, snapshot, register, fhirSchema.package_meta);
        } else {
            fields[key] = buildField(fhirSchema, path, snapshot, register, fhirSchema.package_meta);
        }
    }

    return fields;
}

function extractFieldDependencies(fields: Record<string, TypeSchemaField>): Identifier[] {
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

function deduplicateDependencies(deps: Identifier[]): Identifier[] {
    const seen = new Set<string>();
    const unique: Identifier[] = [];

    for (const dep of deps) {
        const key = dep.url;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(dep);
        }
    }

    // Sort by name for consistent output (matching Clojure implementation)
    unique.sort((a, b) => a.name.localeCompare(b.name));

    return unique;
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

/**
 * Transform a ValueSet FHIRSchema to TypeSchemaValueSet
 */
async function transformValueSet(
    fhirSchema: RichFHIRSchema,
    _register: Register,
    _packageInfo?: PackageMeta,
): Promise<TypeSchemaForValueSet | null> {
    try {
        const identifier = mkIdentifier(fhirSchema);
        identifier.kind = "value-set";

        const valueSetSchema: TypeSchemaForValueSet = {
            identifier: identifier as ValueSetIdentifier,
            description: fhirSchema.description,
        };

        // If there are elements that represent concepts
        if (fhirSchema.elements) {
            const concepts: Array<{
                code: string;
                display?: string;
                system?: string;
            }> = [];

            // Extract concepts from elements (simplified approach)
            for (const [_key, element] of Object.entries(fhirSchema.elements)) {
                if ("code" in element && element.code) {
                    concepts.push({
                        code: element.code as string,
                        // @ts-ignore
                        display: element.short || (element.definition as string),
                        // @ts-ignore
                        system: element.system,
                    });
                }
            }

            if (concepts.length > 0) {
                valueSetSchema.concept = concepts;
            }
        }

        return valueSetSchema;
    } catch (error) {
        console.warn(`Failed to transform value set ${fhirSchema.name}: ${error}`);
        return null;
    }
}

/**
 * Transform an Extension FHIRSchema to TypeSchema with extension metadata
 */
async function transformExtension(
    fhirSchema: RichFHIRSchema,
    register: Register,
    packageInfo?: PackageMeta,
): Promise<any | null> {
    try {
        const identifier = mkIdentifier(fhirSchema);

        // Build base identifier if present
        let base: Identifier | undefined;
        if (fhirSchema.base && fhirSchema.base !== "Extension") {
            const baseUrl = fhirSchema.base.includes("/")
                ? fhirSchema.base
                : `http://hl7.org/fhir/StructureDefinition/${fhirSchema.base}`;
            const baseName = fhirSchema.base.split("/").pop() || fhirSchema.base;

            base = {
                kind: "complex-type",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                name: baseName,
                url: baseUrl,
            };
        } else {
            // Default to Extension base
            base = {
                kind: "complex-type",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                name: "Extension",
                url: "http://hl7.org/fhir/StructureDefinition/Extension",
            };
        }

        const extensionSchema: any = {
            identifier,
            base,
            description: fhirSchema.description,
            dependencies: [],
            metadata: {
                isExtension: true, // Mark as extension for file organization
            },
        };

        // Add base to dependencies
        if (base) {
            extensionSchema.dependencies.push(base);
        }

        // Transform elements into fields if present
        if (fhirSchema.elements) {
            const fields = await transformElements(register, fhirSchema, [], fhirSchema.elements);

            if (fields && Object.keys(fields).length > 0) {
                extensionSchema.fields = fields;
                extensionSchema.dependencies.push(...extractFieldDependencies(fields));
            }
        }

        // Build nested types
        const nestedTypes = await buildNestedTypes(fhirSchema, register, packageInfo);
        if (nestedTypes && nestedTypes.length > 0) {
            extensionSchema.nested = nestedTypes;
            extensionSchema.dependencies.push(...extractNestedDependencies(nestedTypes));
        }

        // Deduplicate and sort dependencies
        extensionSchema.dependencies = deduplicateDependencies(extensionSchema.dependencies);

        // Remove self-reference from dependencies
        extensionSchema.dependencies = extensionSchema.dependencies.filter((dep: any) => dep.url !== identifier.url);

        return extensionSchema;
    } catch (error) {
        console.warn(`Failed to transform extension ${fhirSchema.name}: ${error}`);
        return null;
    }
}

function extractDependencies(
    identifier: Identifier,
    base: Identifier | undefined,
    fields: Record<string, TypeSchemaField> | undefined,
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

    const result = Object.values(uniqDeps).sort((a, b) => a.name.localeCompare(b.name));
    return result.length > 0 ? result : undefined;
}

async function transformResource(register: Register, fhirSchema: RichFHIRSchema): Promise<TypeSchema[]> {
    const identifier = mkIdentifier(fhirSchema);

    let base: Identifier | undefined;
    if (fhirSchema.base && fhirSchema.type !== "Element") {
        const baseFs = register.resolveFS(register.ensureCanonicalUrl(fhirSchema.base));
        base = mkIdentifier(baseFs!);
    }

    const fields = await transformElements(register, fhirSchema, [], fhirSchema.elements);
    const nested = await buildNestedTypes(fhirSchema, register, fhirSchema.package_meta);
    const dependencies = extractDependencies(identifier, base, fields, nested);

    const typeSchema: TypeSchema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies,
    };

    const bindingSchemas = await collectBindingSchemas(fhirSchema, register);

    return [typeSchema, ...bindingSchemas];
}

export async function transformFHIRSchema(register: Register, fhirSchema: RichFHIRSchema): Promise<TypeSchema[]> {
    const results: TypeSchema[] = [];
    const identifier = mkIdentifier(fhirSchema);

    // Handle profiles with specialized processor
    if (identifier.kind === "profile") {
        const profileSchema = await transformProfile(register, fhirSchema);
        results.push(profileSchema);

        // Collect binding schemas for profiles too
        const bindingSchemas = await collectBindingSchemas(fhirSchema, register);
        results.push(...bindingSchemas);

        return results;
    }

    // Handle value sets specially
    if (identifier.kind === "value-set" || fhirSchema.kind === "value-set") {
        const valueSetSchema = await transformValueSet(fhirSchema, register, fhirSchema.package_meta);
        if (valueSetSchema) {
            results.push(valueSetSchema);
        }
        return results;
    }

    // Handle extensions specially
    if (isExtensionSchema(fhirSchema, identifier)) {
        const extensionSchema = await transformExtension(fhirSchema, register, fhirSchema.package_meta);
        if (extensionSchema) {
            results.push(extensionSchema);
        }
        return results;
    }

    return await transformResource(register, fhirSchema);
}
