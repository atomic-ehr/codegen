/**
 * Main FHIRSchema to TypeSchema Transformer
 *
 * Core transformation logic for converting FHIRSchema to TypeSchema format
 */

import type { FHIRSchema, FHIRSchemaElement } from "@atomic-ehr/fhirschema";
import type { CodegenLogger } from "@root/utils/codegen-logger";
import type { Register } from "@typeschema/register";
import {
    type Field,
    type Identifier,
    isNestedIdentifier,
    isProfileIdentifier,
    type NestedType,
    type ProfileConstraint,
    type ProfileExtension,
    type ProfileTypeSchema,
    packageMetaToFhir,
    type RichFHIRSchema,
    type RichValueSet,
    type TypeSchema,
    type ValueSetTypeSchema,
} from "@typeschema/types";
import { collectBindingSchemas, extractValueSetConceptsByUrl } from "./binding";
import { isNestedElement, mkField, mkNestedField } from "./field-builder";
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
 * Check if FHIRSchema represents a profile (constraint derivation)
 */
function isProfileSchema(fhirSchema: FHIRSchema): boolean {
    return fhirSchema.derivation === "constraint";
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

/**
 * Extract constraint metadata from FHIRSchema elements
 */
function extractConstraints(
    fhirSchema: RichFHIRSchema,
    fields: Record<string, Field> | undefined,
): Record<string, ProfileConstraint> | undefined {
    if (!fhirSchema.elements || !fields) return undefined;

    const constraints: Record<string, ProfileConstraint> = {};

    for (const [path, element] of Object.entries(fhirSchema.elements)) {
        const constraint: ProfileConstraint = {};

        // Cardinality
        if (element.min !== undefined) {
            constraint.min = element.min;
        }
        if (element.max !== undefined) {
            constraint.max = String(element.max);
        }

        // MustSupport
        if (element.mustSupport) {
            constraint.mustSupport = true;
        }

        // Pattern values
        if (element.pattern) {
            constraint.patternValue = element.pattern;
        }

        // Binding constraints
        if (element.binding) {
            constraint.binding = {
                strength: element.binding.strength as any,
                valueSet: element.binding.valueSet || "",
            };
        }

        // Type constraints (narrowing)
        if (element.type && Array.isArray(element.type)) {
            constraint.types = element.type.map((t: any) => ({
                code: t.code || t,
                profile: t.profile,
                targetProfile: t.targetProfile,
            }));
        }

        // Slicing information
        if (element.slicing) {
            constraint.slicing = {
                discriminator: element.slicing.discriminator || [],
                rules: element.slicing.rules || "",
                ordered: element.slicing.ordered,
            };
        }

        // Only add if constraint has any properties
        if (Object.keys(constraint).length > 0) {
            constraints[path] = constraint;
        }
    }

    return Object.keys(constraints).length > 0 ? constraints : undefined;
}

/**
 * Extract extension declarations from profile
 */
function extractExtensions(fhirSchema: RichFHIRSchema, logger?: CodegenLogger): ProfileExtension[] | undefined {
    if (!fhirSchema.elements) return undefined;

    const extensions: ProfileExtension[] = [];

    // Extensions are elements with path containing "extension:" or "modifierExtension:"
    for (const [path, element] of Object.entries(fhirSchema.elements)) {
        if (path.includes("extension:") || path.includes("modifierExtension:")) {
            // Extract extension slice name
            const sliceName = path.split(":")[1];
            if (!sliceName) continue;

            // Get extension URL from type profile
            let extensionUrl: string | string[] | undefined;
            if (element.type) {
                const types = Array.isArray(element.type) ? element.type : [element.type];
                for (const t of types) {
                    const typeObj = typeof t === "string" ? { code: t } : t;
                    if (typeObj.code === "Extension" && typeObj.profile) {
                        extensionUrl = typeObj.profile;
                        break;
                    }
                }
            }

            if (!extensionUrl) {
                logger?.warn(`Cannot determine URL for extension ${sliceName} in ${fhirSchema.url}`);
                continue;
            }

            extensions.push({
                path: sliceName,
                profile: extensionUrl,
                min: element.min,
                max: element.max !== undefined ? String(element.max) : undefined,
                mustSupport: element.mustSupport,
            });
        }
    }

    return extensions.length > 0 ? extensions : undefined;
}

/**
 * Transform a profile (constraint derivation) to ProfileTypeSchema
 */
function transformProfile(register: Register, fhirSchema: RichFHIRSchema, logger?: CodegenLogger): ProfileTypeSchema {
    const identifier = mkIdentifier(fhirSchema);

    if (!isProfileIdentifier(identifier)) {
        throw new Error(`Expected profile identifier for ${fhirSchema.url}, got kind: ${identifier.kind}`);
    }

    logger?.debug(`Transforming profile: ${identifier.name}`);

    // Get genealogy: [profile, ...parent profiles, base resource]
    const genealogy = register.resolveFsGenealogy(fhirSchema.package_meta, fhirSchema.url);

    if (genealogy.length === 0) {
        throw new Error(`Cannot resolve genealogy for profile ${fhirSchema.url}`);
    }

    // Last in genealogy is the base resource
    const baseResourceSchema = genealogy[genealogy.length - 1];
    if (!baseResourceSchema) {
        throw new Error(`Base resource not found for profile ${fhirSchema.url}`);
    }
    const baseIdentifier = mkIdentifier(baseResourceSchema);

    logger?.debug(`  Base resource: ${baseIdentifier.name}`);

    // Build constrained fields (Task 2 makes this work)
    const fields = mkFields(register, fhirSchema, [], fhirSchema.elements, logger);

    // Extract constraints
    const constraints = extractConstraints(fhirSchema, fields);

    // Extract extensions
    const extensions = extractExtensions(fhirSchema, logger);

    // Debug extension extraction for us-core-patient
    if (logger && fhirSchema.url?.includes("us-core-patient")) {
        const extPaths = Object.keys(fhirSchema.elements || {}).filter(p => p.toLowerCase().includes("extension"));
        logger.debug(`  [DEBUG] Extension-related paths in elements: ${extPaths.slice(0, 10).join(", ")}`);
        logger.debug(`  [DEBUG] Total extension paths: ${extPaths.length}`);
    }

    // Build nested types
    const nested = mkNestedTypes(register, fhirSchema, logger);

    // Collect dependencies
    const dependencies = extractDependencies(identifier, baseIdentifier, fields, nested);

    const profileSchema: ProfileTypeSchema = {
        identifier,
        base: baseIdentifier,
        description: fhirSchema.description,
        fields,
        constraints,
        extensions,
        nested,
        dependencies,
    };

    logger?.debug(`  Fields: ${Object.keys(fields || {}).length}`);
    logger?.debug(`  Constraints: ${Object.keys(constraints || {}).length}`);
    logger?.debug(`  Extensions: ${extensions?.length ?? 0}`);

    return profileSchema;
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
    const dependencies = extractDependencies(identifier, base, fields, nested);

    const typeSchema: TypeSchema = {
        identifier,
        base,
        fields,
        nested,
        description: fhirSchema.description,
        dependencies,
    };

    const bindingSchemas = collectBindingSchemas(register, fhirSchema, logger);

    return [typeSchema, ...bindingSchemas];
}

export async function transformFhirSchema(
    register: Register,
    fhirSchema: RichFHIRSchema,
    logger?: CodegenLogger,
): Promise<TypeSchema[]> {
    // Check if this is a profile (constraint derivation)
    if (isProfileSchema(fhirSchema)) {
        logger?.debug(`Detected profile schema: ${fhirSchema.url}`);
        const profileSchema = transformProfile(register, fhirSchema, logger);
        return [profileSchema];
    }

    // Regular resource or complex type transformation
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
