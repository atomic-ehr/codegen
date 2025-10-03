/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import { fsElementSnapshot, type Register, resolveFsElementGenealogy } from "@typeschema/register";
import type {
    Field,
    Identifier,
    NestedType,
    RichFHIRSchema,
    RichValueSet,
    TypeSchema,
    ValueSetTypeSchema,
} from "@typeschema/types";
import { transformProfile } from "../profile/processor";
import type { CanonicalUrl, Name, PackageMeta } from "../types";
import { collectBindingSchemas, extractValueSetConceptsByUrl } from "./binding";
import { isNestedElement, mkField, mkNestedField } from "./field-builder";
import { mkIdentifier, mkValueSetIdentifierByUrl } from "./identifier";
import { extractNestedDependencies, mkNestedTypes } from "./nested-types";

export async function mkFields(
    register: Register,
    fhirSchema: RichFHIRSchema,
    parentPath: string[],
    elements: Record<string, FHIRSchemaElement> | undefined,
): Promise<Record<string, Field> | undefined> {
    if (!elements) return undefined;
    const geneology = register.resolveFsGenealogy(fhirSchema.url);

    const elems = {} as Record<
        string,
        {
            elem: FHIRSchemaElement | undefined;
            elemSnapshot: FHIRSchemaElement;
            path: string[];
        }
    >;
    for (const [key, elem] of Object.entries(elements)) {
        const path = [...parentPath, key];
        const elemGeneology = resolveFsElementGenealogy(geneology, path);
        const elemSnapshot = fsElementSnapshot(elemGeneology);
        elems[key] = { elem, elemSnapshot, path };
    }

    for (const [_key, { elem, elemSnapshot, path }] of Object.entries(elems)) {
        for (const choiceKey of elem?.choices || []) {
            if (!elems[choiceKey]) {
                const path = [...parentPath, choiceKey];
                const elemGeneology = resolveFsElementGenealogy(geneology, path);
                const elemSnapshot = fsElementSnapshot(elemGeneology);
                elems[choiceKey] = { elem: undefined, elemSnapshot, path };
            }
        }
    }

    const fields: Record<string, Field> = {};
    for (const [key, { elem, elemSnapshot, path }] of Object.entries(elems)) {
        if (isNestedElement(elemSnapshot)) {
            fields[key] = mkNestedField(register, fhirSchema, path, elemSnapshot);
        } else {
            fields[key] = mkField(register, fhirSchema, path, elemSnapshot);
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

export async function transformValueSet(register: Register, valueSet: RichValueSet): Promise<ValueSetTypeSchema> {
    if (!valueSet.url) throw new Error("ValueSet URL is required");

    const identifier = mkValueSetIdentifierByUrl(register, valueSet.url);
    const concept = extractValueSetConceptsByUrl(register, valueSet.url);
    return {
        identifier: identifier,
        description: valueSet.description,
        concept: concept,
        compose: !concept ? valueSet.compose : undefined,
    };
}

/**
 * Transform an Extension FHIRSchema to TypeSchema with extension metadata
 */
async function transformExtension(
    fhirSchema: RichFHIRSchema,
    register: Register,
    _packageInfo?: PackageMeta,
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
                name: baseName as Name,
                url: baseUrl as CanonicalUrl,
            };
        } else {
            // Default to Extension base
            base = {
                kind: "complex-type",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                name: "Extension" as Name,
                url: "http://hl7.org/fhir/StructureDefinition/Extension" as CanonicalUrl,
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
            const fields = await mkFields(register, fhirSchema, [], fhirSchema.elements);

            if (fields && Object.keys(fields).length > 0) {
                extensionSchema.fields = fields;
                extensionSchema.dependencies.push(...extractFieldDependencies(fields));
            }
        }

        // Build nested types
        const nestedTypes = await mkNestedTypes(register, fhirSchema);
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
        .filter((e) => !(e.kind === "nested" && localNestedTypeUrls.has(e.url)))
        .sort((a, b) => a.url.localeCompare(b.url));

    return result.length > 0 ? result : undefined;
}

async function transformResource(register: Register, fhirSchema: RichFHIRSchema): Promise<TypeSchema[]> {
    const identifier = mkIdentifier(fhirSchema);

    let base: Identifier | undefined;
    if (fhirSchema.base && fhirSchema.type !== "Element") {
        const baseFs = register.resolveFs(register.ensureCanonicalUrl(fhirSchema.base));
        if (!baseFs) {
            throw new Error(`Base resource not found '${fhirSchema.base}' for '${fhirSchema.url}'`);
        }
        base = mkIdentifier(baseFs);
    }

    const fields = await mkFields(register, fhirSchema, [], fhirSchema.elements);
    const nested = await mkNestedTypes(register, fhirSchema);
    const dependencies = extractDependencies(identifier, base, fields, nested);

    const typeSchema: TypeSchema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies,
    };

    const bindingSchemas = await collectBindingSchemas(register, fhirSchema);

    return [typeSchema, ...bindingSchemas];
}

export async function transformFHIRSchema(register: Register, fhirSchema: RichFHIRSchema): Promise<TypeSchema[]> {
    const results: TypeSchema[] = [];
    const identifier = mkIdentifier(fhirSchema);
    if (identifier.kind === "profile") {
        const profileSchema = await transformProfile(register, fhirSchema);
        results.push(profileSchema);

        const bindingSchemas = await collectBindingSchemas(register, fhirSchema);
        results.push(...bindingSchemas);

        return results;
    }

    if (isExtensionSchema(fhirSchema, identifier)) {
        const extensionSchema = await transformExtension(fhirSchema, register, fhirSchema.package_meta);
        if (extensionSchema) {
            results.push(extensionSchema);
        }
        return results;
    }

    return await transformResource(register, fhirSchema);
}
