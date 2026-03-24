import * as afs from "node:fs/promises";
import * as Path from "node:path";
import type { CodegenLog } from "@root/utils/log";
import * as YAML from "yaml";
import type { IrReport } from "./ir/types";
import type { Register } from "./register";
import {
    type CanonicalUrl,
    type ChoiceFieldInstance,
    type ComplexTypeTypeSchema,
    type ConstrainedChoiceInfo,
    type Field,
    type Identifier,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isComplexTypeIdentifier,
    isComplexTypeTypeSchema,
    isLogicalTypeSchema,
    isNestedIdentifier,
    isNestedTypeSchema,
    isProfileTypeSchema,
    isResourceIdentifier,
    isResourceTypeSchema,
    isSpecializationTypeSchema,
    type LogicalTypeSchema,
    type NestedTypeSchema,
    type PkgName,
    type ProfileExtension,
    type ProfileTypeSchema,
    type ResourceTypeSchema,
    type SpecializationTypeSchema,
    type TypeFamily,
    type TypeIdentifier,
    type TypeSchema,
} from "./types";

///////////////////////////////////////////////////////////
// TypeSchema processing

export const groupByPackages = <T extends { identifier: TypeIdentifier }>(typeSchemas: T[]): Record<PkgName, T[]> => {
    const grouped = {} as Record<PkgName, T[]>;
    for (const ts of typeSchemas) {
        const pkgName = ts.identifier.package;
        if (!grouped[pkgName]) grouped[pkgName] = [];
        grouped[pkgName].push(ts);
    }
    for (const [packageName, typeSchemas] of Object.entries(grouped)) {
        const dict: Record<string, T> = {};
        for (const ts of typeSchemas) {
            dict[JSON.stringify(ts.identifier)] = ts;
        }
        const tmp = Object.values(dict);
        tmp.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
        grouped[packageName] = tmp;
    }
    return grouped;
};

const buildDependencyGraph = (schemas: SpecializationTypeSchema[]): Record<string, string[]> => {
    const nameToMap: Record<string, SpecializationTypeSchema> = {};
    for (const schema of schemas) {
        nameToMap[schema.identifier.name] = schema;
    }

    const graph: Record<string, string[]> = {};
    for (const schema of schemas) {
        const name = schema.identifier.name;
        const base = schema.base?.name;
        if (!graph[name]) {
            graph[name] = [];
        }
        if (base && nameToMap[base]) {
            graph[name].push(base);
        }
    }
    return graph;
};

const topologicalSort = (graph: Record<string, string[]>): string[] => {
    const sorted: string[] = [];
    const visited: Record<string, boolean> = {};
    const temp: Record<string, boolean> = {};

    const visit = (node: string) => {
        if (temp[node]) {
            throw new Error(`Graph has cycles ${node}`);
        }
        if (!visited[node]) {
            temp[node] = true;
            for (const neighbor of graph[node] ?? []) {
                visit(neighbor);
            }
            temp[node] = false;
            visited[node] = true;
            sorted.push(node);
        }
    };

    for (const node in graph) {
        if (!visited[node]) {
            visit(node);
        }
    }
    return sorted;
};

export const sortAsDeclarationSequence = (schemas: SpecializationTypeSchema[]): SpecializationTypeSchema[] => {
    const graph = buildDependencyGraph(schemas);
    const sorted = topologicalSort(graph);
    return sorted
        .map((name) => schemas.find((schema) => schema.identifier.name === name))
        .filter(Boolean) as SpecializationTypeSchema[];
};

///////////////////////////////////////////////////////////
// Type Family

/** Populate `typeFamily` on specialization schemas with transitive children grouped by kind. */
const populateTypeFamily = (schemas: TypeSchema[]): void => {
    const directChildrenByParent: Record<string, TypeIdentifier[]> = {};
    for (const schema of schemas) {
        if (!isSpecializationTypeSchema(schema) || !schema.base) continue;
        const parentUrl = schema.base.url;
        if (!directChildrenByParent[parentUrl]) directChildrenByParent[parentUrl] = [];
        directChildrenByParent[parentUrl].push(schema.identifier);
    }

    const transitiveCache: Record<string, TypeIdentifier[]> = {};
    const getTransitiveChildren = (parentUrl: string): TypeIdentifier[] => {
        if (transitiveCache[parentUrl]) return transitiveCache[parentUrl];
        const direct = directChildrenByParent[parentUrl] ?? [];
        const result: TypeIdentifier[] = [...direct];
        for (const child of direct) {
            result.push(...getTransitiveChildren(child.url));
        }
        transitiveCache[parentUrl] = result;
        return result;
    };

    for (const schema of schemas) {
        if (!isSpecializationTypeSchema(schema)) continue;
        const allChildren = getTransitiveChildren(schema.identifier.url);
        if (allChildren.length === 0) continue;
        const resources = allChildren.filter(isResourceIdentifier);
        const complexTypes = allChildren.filter(isComplexTypeIdentifier);
        const family: TypeFamily = {};
        if (resources.length > 0) family.resources = resources;
        if (complexTypes.length > 0) family.complexTypes = complexTypes;
        if (Object.keys(family).length > 0) schema.typeFamily = family;
    }
};

///////////////////////////////////////////////////////////
// Type Schema Index

export type TypeSchemaIndex = {
    _schemaIndex: Record<CanonicalUrl, Record<PkgName, TypeSchema>>;
    schemas: TypeSchema[];
    schemasByPackage: Record<PkgName, TypeSchema[]>;
    register?: Register;
    collectComplexTypes: () => ComplexTypeTypeSchema[];
    collectResources: () => ResourceTypeSchema[];
    collectLogicalModels: () => LogicalTypeSchema[];
    collectProfiles: () => ProfileTypeSchema[];
    resolve: (id: Identifier) => TypeSchema | undefined;
    resolveType: (id: TypeIdentifier) => TypeSchema | NestedTypeSchema | undefined;
    resolveByUrl: (pkgName: PkgName, url: CanonicalUrl) => TypeSchema | NestedTypeSchema | undefined;
    tryHierarchy: (schema: TypeSchema) => TypeSchema[] | undefined;
    hierarchy: (schema: TypeSchema) => TypeSchema[];
    findLastSpecialization: (schema: TypeSchema) => TypeSchema;
    findLastSpecializationByIdentifier: (id: TypeIdentifier) => TypeIdentifier;
    flatProfile: (schema: ProfileTypeSchema) => ProfileTypeSchema;
    constrainedChoice: (
        pkgName: PkgName,
        baseTypeId: TypeIdentifier,
        sliceElements: string[],
    ) => ConstrainedChoiceInfo | undefined;
    isWithMetaField: (profile: ProfileTypeSchema) => boolean;
    entityTree: () => EntityTree;
    exportTree: (filename: string) => Promise<void>;
    irReport: () => IrReport;
    replaceSchemas: (schemas: TypeSchema[]) => TypeSchemaIndex;
};

type EntityTree = Record<PkgName, Record<TypeIdentifier["kind"], Record<CanonicalUrl, object>>>;

export const mkTypeSchemaIndex = (
    schemas: TypeSchema[],
    {
        register,
        logger,
        irReport = {},
    }: {
        register?: Register;
        logger?: CodegenLog;
        irReport?: IrReport;
    },
): TypeSchemaIndex => {
    const index: Record<CanonicalUrl, Record<PkgName, TypeSchema>> = {};
    const nestedIndex: Record<CanonicalUrl, Record<PkgName, NestedTypeSchema>> = {};
    const append = (schema: TypeSchema) => {
        const url = schema.identifier.url;
        const pkg = schema.identifier.package;
        if (!index[url]) index[url] = {};

        if (index[url][pkg] && pkg !== "shared") {
            const r1 = JSON.stringify(schema.identifier, undefined, 2);
            const r2 = JSON.stringify(index[url][pkg]?.identifier, undefined, 2);
            if (r1 !== r2) throw new Error(`Duplicate schema: ${r1} and ${r2}`);
            return;
        }
        index[url][pkg] = schema;

        if (isSpecializationTypeSchema(schema) || isProfileTypeSchema(schema)) {
            if (schema.nested) {
                schema.nested.forEach((nschema) => {
                    const nurl = nschema.identifier.url;
                    const npkg = nschema.identifier.package;
                    nestedIndex[nurl] ??= {};
                    nestedIndex[nurl][npkg] = nschema;
                });
            }
        }
    };
    for (const schema of schemas) {
        append(schema);
    }
    populateTypeFamily(schemas);

    const resolve = (id: Identifier): TypeSchema | undefined => {
        return index[id.url]?.[id.package];
    };
    const resolveType = (id: TypeIdentifier): TypeSchema | NestedTypeSchema | undefined => {
        if (isNestedIdentifier(id)) return nestedIndex[id.url]?.[id.package];
        return index[id.url]?.[id.package];
    };
    const resolveByUrl = (pkgName: PkgName, url: CanonicalUrl): TypeSchema | NestedTypeSchema | undefined => {
        if (register) {
            const resolutionTree = register.resolutionTree();
            const resolution = resolutionTree[pkgName]?.[url]?.[0];
            if (resolution) {
                return index[url]?.[resolution.pkg.name];
            }
        }
        if (index[url]?.[pkgName]) return index[url]?.[pkgName];
        if (nestedIndex[url]?.[pkgName]) return nestedIndex[url]?.[pkgName];
        logger?.dryWarn(`Type '${url}' not found in '${pkgName}'`);

        // Fallback: search across all packages when type exists elsewhere
        if (index[url]) {
            const anyPkg = Object.keys(index[url])[0];
            if (anyPkg) {
                logger?.dryWarn(`Type '${url}' fallback to package ${anyPkg}`);
                return index[url]?.[anyPkg];
            }
        }
        if (nestedIndex[url]) {
            const anyPkg = Object.keys(nestedIndex[url])[0];
            if (anyPkg) {
                logger?.dryWarn(`Type '${url}' fallback to package ${anyPkg}`);
                return nestedIndex[url]?.[anyPkg];
            }
        }
        return undefined;
    };

    const tryHierarchy = (schema: TypeSchema): TypeSchema[] | undefined => {
        const res: TypeSchema[] = [];
        let cur: TypeSchema | undefined = schema;
        while (cur) {
            res.push(cur);
            const base = (cur as SpecializationTypeSchema).base;
            if (base === undefined) break;
            if (isNestedIdentifier(base)) break;
            const resolved = resolve(base);
            if (!resolved) {
                logger?.warn(
                    "#resolveBase",
                    `Failed to resolve base type: ${res.map((e) => `${e.identifier.url} (${e.identifier.kind})`).join(", ")}`,
                );
                return undefined;
            }
            cur = resolved;
        }
        return res;
    };

    const hierarchy = (schema: TypeSchema): TypeSchema[] => {
        const genealogy = tryHierarchy(schema);
        if (genealogy === undefined) {
            throw new Error(`Failed to resolve base type: ${schema.identifier.url} (${schema.identifier.kind})`);
        }
        return genealogy;
    };

    const findLastSpecialization = (schema: TypeSchema): TypeSchema => {
        const nonConstraintSchema = hierarchy(schema).find((s) => s.identifier.kind !== "profile");
        if (!nonConstraintSchema) {
            throw new Error(`No non-constraint schema found in hierarchy for: ${schema.identifier.name}`);
        }
        return nonConstraintSchema;
    };

    const findLastSpecializationByIdentifier = (id: TypeIdentifier): TypeIdentifier => {
        const resolved = resolveType(id);
        if (!resolved) return id;
        if (isNestedTypeSchema(resolved)) return findLastSpecializationByIdentifier(resolved.base);
        return findLastSpecialization(resolved).identifier;
    };

    /** Narrow choice declarations by finding the most derived schema that constrains each choice group.
     *  When a child profile declares only specific choice instances without re-declaring the declaration,
     *  restrict the declaration's choices array to only the allowed instances. */
    const narrowMergedChoiceDeclarations = (
        mergedFields: Record<string, Field>,
        constraintSchemas: TypeSchema[],
    ): Record<string, Field> => {
        const result = { ...mergedFields };
        for (const [declName, declField] of Object.entries(result)) {
            if (!isChoiceDeclarationField(declField) || declField.excluded) continue;

            for (const cSchema of constraintSchemas) {
                const sFields = (cSchema as SpecializationTypeSchema).fields;
                if (!sFields) continue;
                if (sFields[declName] && isChoiceDeclarationField(sFields[declName])) continue;

                const instancesInSchema = Object.entries(sFields)
                    .filter(([_, f]) => isChoiceInstanceField(f) && (f as ChoiceFieldInstance).choiceOf === declName)
                    .map(([name]) => name);
                if (instancesInSchema.length === 0) continue;

                const allowed = new Set(instancesInSchema);
                result[declName] = { ...declField, choices: declField.choices.filter((c) => allowed.has(c)) };
                break;
            }
        }

        // Compute prohibited for all choice declarations
        for (const [declName, declField] of Object.entries(result)) {
            if (!isChoiceDeclarationField(declField)) continue;
            const permitted = new Set(declField.excluded ? [] : declField.choices);
            const prohibited = Object.entries(result)
                .filter(
                    (e): e is [string, ChoiceFieldInstance] =>
                        isChoiceInstanceField(e[1]) && e[1].choiceOf === declName,
                )
                .filter(([name]) => !permitted.has(name))
                .map(([name]) => name);
            if (prohibited.length > 0) result[declName] = { ...declField, prohibited };
        }

        return result;
    };

    const flatProfile = (schema: ProfileTypeSchema): ProfileTypeSchema => {
        const hierarchySchemas = hierarchy(schema);
        const constraintSchemas = hierarchySchemas.filter((s) => s.identifier.kind === "profile");
        const nonConstraintSchema = hierarchySchemas.find((s) => s.identifier.kind !== "profile");

        if (!nonConstraintSchema)
            throw new Error(`No non-constraint schema found in hierarchy for ${schema.identifier.name}`);

        const mergedFields = {} as Record<string, Field>;
        for (const anySchema of constraintSchemas.slice().reverse()) {
            const schema = anySchema as SpecializationTypeSchema;
            if (!schema.fields) continue;

            for (const [fieldName, fieldConstraints] of Object.entries(schema.fields)) {
                if (mergedFields[fieldName]) {
                    mergedFields[fieldName] = {
                        ...mergedFields[fieldName],
                        ...fieldConstraints,
                    };
                } else {
                    mergedFields[fieldName] = { ...fieldConstraints };
                }
            }
        }

        const narrowedFields = narrowMergedChoiceDeclarations(mergedFields, constraintSchemas);

        const dependencies = Object.values(
            Object.fromEntries(
                constraintSchemas
                    .flatMap((s) => (s as SpecializationTypeSchema).dependencies ?? [])
                    .map((dep) => [dep.url, dep]),
            ),
        );

        const mergedExtensions = Object.values(
            [...constraintSchemas.filter(isProfileTypeSchema)]
                .reverse()
                .flatMap((s) => s.extensions ?? [])
                .reduce<Record<string, ProfileExtension>>((acc, ext) => {
                    const key = `${ext.path}|${ext.name}`;
                    // Prefer entries with a full canonical URL over short names
                    if (!acc[key] || ext.url?.includes("/")) acc[key] = ext;
                    return acc;
                }, {}),
        );

        return {
            ...schema,
            base: nonConstraintSchema.identifier,
            fields: narrowedFields,
            dependencies: dependencies,
            extensions: mergedExtensions.length > 0 ? mergedExtensions : undefined,
        };
    };

    const constrainedChoice = (
        pkgName: PkgName,
        baseTypeId: TypeIdentifier,
        sliceElements: string[],
    ): ConstrainedChoiceInfo | undefined => {
        const baseSchema = resolveByUrl(pkgName, baseTypeId.url as CanonicalUrl);
        if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return undefined;
        for (const [fieldName, field] of Object.entries(baseSchema.fields)) {
            if (!isChoiceDeclarationField(field)) continue;
            const matchingVariants = field.choices.filter((c) => sliceElements.includes(c));
            if (matchingVariants.length !== 1) continue;
            const variantName = matchingVariants[0] as string;
            const variantField = baseSchema.fields[variantName];
            if (!variantField || !isChoiceInstanceField(variantField)) continue;
            return {
                choiceBase: fieldName,
                variant: variantName,
                variantType: variantField.type,
                allChoiceNames: field.choices,
            };
        }
        return undefined;
    };

    const isWithMetaField = (profile: ProfileTypeSchema): boolean => {
        const genealogy = tryHierarchy(profile);
        if (!genealogy) return false;
        return genealogy.filter(isSpecializationTypeSchema).some((schema) => {
            return schema.fields?.meta !== undefined;
        });
    };

    const entityTree = () => {
        const tree: EntityTree = {};
        for (const [pkgId, shemas] of Object.entries(groupByPackages(schemas))) {
            tree[pkgId] = {
                "primitive-type": {},
                "complex-type": {},
                resource: {},
                "value-set": {},
                nested: {},
                binding: {},
                profile: {},
                logical: {},
            };
            for (const schema of shemas) {
                tree[pkgId][schema.identifier.kind][schema.identifier.url] = {};
            }
        }
        return tree;
    };

    const exportTree = async (filename: string) => {
        const tree = entityTree();
        const raw = filename.endsWith(".yaml") ? YAML.stringify(tree) : JSON.stringify(tree, undefined, 2);
        await afs.mkdir(Path.dirname(filename), { recursive: true });
        await afs.writeFile(filename, raw);
    };

    return {
        _schemaIndex: index,
        schemas,
        schemasByPackage: groupByPackages(schemas),
        register,
        collectComplexTypes: () => schemas.filter(isComplexTypeTypeSchema),
        collectResources: () => schemas.filter(isResourceTypeSchema),
        collectLogicalModels: () => schemas.filter(isLogicalTypeSchema),
        collectProfiles: () => schemas.filter(isProfileTypeSchema),
        resolve,
        resolveType,
        resolveByUrl,
        tryHierarchy,
        hierarchy,
        findLastSpecialization,
        findLastSpecializationByIdentifier,
        flatProfile,
        constrainedChoice,
        isWithMetaField,
        entityTree,
        exportTree,
        irReport: () => irReport,
        replaceSchemas: (newSchemas) => mkTypeSchemaIndex(newSchemas, { register, logger, irReport: { ...irReport } }),
    };
};
