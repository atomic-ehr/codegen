import * as afs from "node:fs/promises";
import * as Path from "node:path";
import type { CodegenLog } from "@root/utils/log";
import * as YAML from "yaml";
import type { IrReport } from "./ir/types";
import type { Register } from "./register";
import {
    type BindingIdentifier,
    type BindingTypeSchema,
    type CanonicalUrl,
    type ChoiceFieldInstance,
    type ComplexTypeIdentifier,
    type ComplexTypeTypeSchema,
    type ConstrainedChoiceInfo,
    concatIdentifiers,
    type Field,
    type GenericParam,
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
    isSnapshotProfileIdentifier,
    isSnapshotProfileTypeSchema,
    isSpecializationTypeSchema,
    type LogicalIdentifier,
    type LogicalTypeSchema,
    type NestedIdentifier,
    type NestedTypeSchema,
    type PkgName,
    type PrimitiveIdentifier,
    type PrimitiveTypeSchema,
    type ProfileExtension,
    type ProfileIdentifier,
    type ProfileTypeSchema,
    type ResourceIdentifier,
    type ResourceTypeSchema,
    type SnapshotProfileIdentifier,
    type SnapshotProfileTypeSchema,
    type SpecializationTypeSchema,
    snapshotIdentifier,
    type TypeFamily,
    type TypeIdentifier,
    type TypeSchema,
    type ValueSetIdentifier,
    type ValueSetTypeSchema,
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
// Generic Params

type GenericContribution =
    | { kind: "introduce"; fieldName: string; constraint: TypeIdentifier }
    | { kind: "passthrough"; fieldName: string; params: GenericParam[] };

const collectGenericContributions = (
    schema: SpecializationTypeSchema | NestedTypeSchema,
    resolveType: (id: TypeIdentifier) => TypeSchema | NestedTypeSchema | undefined,
): GenericContribution[] => {
    const contributions: GenericContribution[] = [];
    for (const [fieldName, field] of Object.entries(schema.fields ?? {})) {
        if (isChoiceDeclarationField(field) || !field.type) continue;
        const target = resolveType(field.type);
        if (!target) continue;
        if (isNestedTypeSchema(target)) {
            const params = target.generic?.params;
            if (params?.length) contributions.push({ kind: "passthrough", fieldName, params });
        } else if (isSpecializationTypeSchema(target)) {
            const params = target.generic?.params;
            if (params?.length) {
                contributions.push({ kind: "passthrough", fieldName, params });
            } else if ((target.typeFamily?.resources?.length ?? 0) > 0) {
                contributions.push({ kind: "introduce", fieldName, constraint: field.type });
            }
        }
    }
    return contributions;
};

const samePath = (a: string[], b: string[]): boolean => a.length === b.length && a.every((s, i) => s === b[i]);
const leafOf = (path: string[]): string => path[path.length - 1] ?? "";

const renderGenericParams = (contributions: GenericContribution[]): GenericParam[] => {
    // Collect raw {path, constraint} pairs. Introduce contributions create single-segment paths
    // (the field name); passthrough contributions prepend the carrier field to each inherited
    // param's path. Dedup by leaf (last segment) — multiple fields with the same deepest origin
    // share one generic param, so callers narrow once and many fields update at once.
    type Raw = { path: string[]; constraint: TypeIdentifier };
    const raw: Raw[] = [];
    for (const c of contributions) {
        if (c.kind === "introduce") {
            const path = [c.fieldName];
            if (!raw.find((r) => leafOf(r.path) === leafOf(path))) {
                raw.push({ path, constraint: c.constraint });
            }
        } else {
            for (const np of c.params) {
                const path = [c.fieldName, ...np.path];
                if (!raw.find((r) => leafOf(r.path) === leafOf(path))) {
                    raw.push({ path, constraint: np.constraint });
                }
            }
        }
    }
    if (raw.length === 0) return [];
    // Single param → "T"; multiple → "T1", "T2", … positional names.
    return raw.map((r, i) => ({
        typeVar: raw.length === 1 ? "T" : `T${i + 1}`,
        constraint: r.constraint,
        path: r.path,
    }));
};

/** Populate `generic.params` on every specialization schema (top-level and nested).
 *  A schema becomes generic when one of its fields targets a type-family root
 *  (introduce) or a generic-bearing schema (passthrough). Param naming: single param
 *  → "T"; multiple → "T1", "T2", … positional. Each param keeps its `sourceField`
 *  (the deep field that originally introduced it) so passthrough args align across
 *  hops. Iterates to a fixpoint so order doesn't matter. */
const populateGeneric = (
    schemas: TypeSchema[],
    resolveType: (id: TypeIdentifier) => TypeSchema | NestedTypeSchema | undefined,
): void => {
    type Carrier = SpecializationTypeSchema | NestedTypeSchema;
    const carriers: Carrier[] = [];
    for (const schema of schemas) {
        if (isSpecializationTypeSchema(schema)) {
            carriers.push(schema);
            for (const nested of schema.nested ?? []) carriers.push(nested);
        } else if (isProfileTypeSchema(schema)) {
            // Profiles aren't generic-bearing themselves (deliberately out of scope), but their
            // nested types follow the same rules as specializations'.
            for (const nested of schema.nested ?? []) carriers.push(nested);
        }
    }

    // Clear stale data — schemas may be mutated by a previous index build (replaceSchemas).
    for (const c of carriers) c.generic = undefined;

    const sameParams = (a: GenericParam[], b: GenericParam[]): boolean => {
        if (a.length !== b.length) return false;
        for (const [i, x] of a.entries()) {
            const y = b[i];
            if (!y || x.typeVar !== y.typeVar || !samePath(x.path, y.path) || x.constraint.url !== y.constraint.url)
                return false;
        }
        return true;
    };

    // Fixpoint: passthrough between schemas means processing order doesn't fully resolve in one pass.
    // Iterate until no changes; bounded by the total number of carriers as a safety cap.
    let changed = true;
    let iter = 0;
    while (changed && iter++ <= carriers.length) {
        changed = false;
        for (const c of carriers) {
            const newParams = renderGenericParams(collectGenericContributions(c, resolveType));
            const oldParams = c.generic?.params ?? [];
            if (sameParams(oldParams, newParams)) continue;
            c.generic = newParams.length > 0 ? { params: newParams } : undefined;
            changed = true;
        }
    }

    // Ensure each schema's dependency list includes its generic constraint types so writers
    // emit the corresponding imports. Top-level specializations have a `dependencies` array;
    // nested types don't (their imports come via the parent schema's dependencies).
    for (const schema of schemas) {
        if (!isSpecializationTypeSchema(schema)) continue;
        const constraints: Identifier[] = [];
        const collect = (params: GenericParam[]) => {
            for (const p of params) {
                if (!isNestedIdentifier(p.constraint)) constraints.push(p.constraint);
            }
        };
        if (schema.generic) collect(schema.generic.params);
        for (const nested of schema.nested ?? []) {
            if (nested.generic) collect(nested.generic.params);
        }
        if (constraints.length === 0) continue;
        schema.dependencies = concatIdentifiers(schema.dependencies, constraints) ?? schema.dependencies;
    }
};

///////////////////////////////////////////////////////////
// Type Schema Index

/** Overloaded `resolve` — passing a specific identifier kind narrows the return type. */
type ResolveFn = {
    (id: PrimitiveIdentifier): PrimitiveTypeSchema | undefined;
    (id: ComplexTypeIdentifier): ComplexTypeTypeSchema | undefined;
    (id: ResourceIdentifier): ResourceTypeSchema | undefined;
    (id: LogicalIdentifier): LogicalTypeSchema | undefined;
    (id: ValueSetIdentifier): ValueSetTypeSchema | undefined;
    (id: BindingIdentifier): BindingTypeSchema | undefined;
    (id: ProfileIdentifier): ProfileTypeSchema | undefined;
    (id: SnapshotProfileIdentifier): SnapshotProfileTypeSchema | undefined;
    (id: Identifier): TypeSchema | undefined;
};

/** Overloaded `resolveType` — same as ResolveFn plus a NestedIdentifier overload. */
type ResolveTypeFn = {
    (id: NestedIdentifier): NestedTypeSchema | undefined;
    (id: PrimitiveIdentifier): PrimitiveTypeSchema | undefined;
    (id: ComplexTypeIdentifier): ComplexTypeTypeSchema | undefined;
    (id: ResourceIdentifier): ResourceTypeSchema | undefined;
    (id: LogicalIdentifier): LogicalTypeSchema | undefined;
    (id: ValueSetIdentifier): ValueSetTypeSchema | undefined;
    (id: BindingIdentifier): BindingTypeSchema | undefined;
    (id: ProfileIdentifier): ProfileTypeSchema | undefined;
    (id: SnapshotProfileIdentifier): SnapshotProfileTypeSchema | undefined;
    (id: TypeIdentifier): TypeSchema | NestedTypeSchema | undefined;
};

export type TypeSchemaIndex = {
    _schemaIndex: Record<CanonicalUrl, Record<PkgName, TypeSchema>>;
    schemas: TypeSchema[];
    schemasByPackage: Record<PkgName, TypeSchema[]>;
    register?: Register;
    collectComplexTypes: () => ComplexTypeTypeSchema[];
    collectResources: () => ResourceTypeSchema[];
    collectLogicalModels: () => LogicalTypeSchema[];
    collectProfiles: () => ProfileTypeSchema[];
    collectSnapshotProfiles: () => SnapshotProfileTypeSchema[];
    resolve: ResolveFn;
    resolveType: ResolveTypeFn;
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
    isWithMetaField: (profile: ProfileTypeSchema | SnapshotProfileTypeSchema) => boolean;
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
    const snapshotIndex: Record<CanonicalUrl, Record<PkgName, SnapshotProfileTypeSchema>> = {};
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

    const resolve = ((id: Identifier): TypeSchema | undefined => {
        if (isSnapshotProfileIdentifier(id)) return snapshotIndex[id.url]?.[id.package];
        return index[id.url]?.[id.package];
    }) as ResolveFn;
    const resolveType = ((id: TypeIdentifier): TypeSchema | NestedTypeSchema | undefined => {
        if (isNestedIdentifier(id)) return nestedIndex[id.url]?.[id.package];
        if (isSnapshotProfileIdentifier(id)) return snapshotIndex[id.url]?.[id.package];
        return index[id.url]?.[id.package];
    }) as ResolveTypeFn;

    populateGeneric(schemas, resolveType);
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
            const base: TypeIdentifier | undefined = (cur as SpecializationTypeSchema).base;
            if (base === undefined) break;
            if (isNestedIdentifier(base)) break;
            const resolved: TypeSchema | undefined = resolve(base);
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
        const nonConstraintSchema = hierarchy(schema).find(
            (s) => !isProfileTypeSchema(s) && !isSnapshotProfileTypeSchema(s),
        );
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
                const merged: Field = mergedFields[fieldName]
                    ? { ...mergedFields[fieldName], ...fieldConstraints }
                    : { ...fieldConstraints };
                // Profile-explicit relaxation: differential lowered min to 0
                // → the field is no longer required even if a base ancestor
                // (or earlier profile in the chain) declared it so. Without
                // this, validate() would emit validateRequired() for a field
                // the leaf profile intentionally relaxed.
                if ("min" in fieldConstraints && fieldConstraints.min === 0) {
                    (merged as { required?: boolean }).required = false;
                }
                mergedFields[fieldName] = merged;
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

    const buildProfileSnapshot = (schema: ProfileTypeSchema): SnapshotProfileTypeSchema => {
        const flat = flatProfile(schema);
        const flatFields = flat.fields ?? {};

        // Inherited-required collection: top-level required fields on the base
        // resource that the profile chain never re-states. Listed separately
        // from `fields` so this fix only adds validateRequired() calls without
        // pulling unrelated base metadata (e.g. unused value[x] variants) into
        // the snapshot — which would otherwise expand profile getters/setters.
        const hierarchySchemas = hierarchy(schema);
        const nonConstraintSchema = hierarchySchemas.find((s) => s.identifier.kind !== "profile") as
            | SpecializationTypeSchema
            | undefined;
        const inheritedRequiredFields: string[] = [];
        if (nonConstraintSchema?.fields) {
            for (const [name, baseField] of Object.entries(nonConstraintSchema.fields)) {
                if (!baseField.required) continue;
                // Choice declarations (e.g. `value[x]`) are required via the
                // declaration, not a real property — validateRequired() would
                // check a key that never exists in FHIR JSON. The correct
                // validateChoiceRequired() handling is deferred to the per-type
                // validator redesign (#169); until then, skip rather than emit
                // a check that can only misfire.
                if (isChoiceDeclarationField(baseField)) continue;
                const flat = flatFields[name] as { required?: boolean; min?: number } | undefined;
                // Profile explicitly relaxed the field via differential min:0 →
                // skip (regular validate emission also skips it because flatField
                // .required was reset to false in flatProfile).
                if (flat?.min === 0) continue;
                // Profile (or any ancestor in the chain) restated the field with
                // required:true → already emitted by the regular field loop.
                if (flat?.required) continue;
                // Either the profile leaves the field untouched, or the FHIRSchema
                // snapshot expansion inlined the inherited element with required
                // unset / false despite the base requiring it. Either way the
                // emitter needs an explicit validateRequired() call.
                inheritedRequiredFields.push(name);
            }
        }

        return {
            identifier: snapshotIdentifier(flat.identifier),
            base: flat.base,
            description: flat.description,
            fields: flatFields,
            inheritedRequiredFields: inheritedRequiredFields.length > 0 ? inheritedRequiredFields : undefined,
            extensions: flat.extensions,
            dependencies: flat.dependencies,
            nested: flat.nested,
        };
    };

    for (const schema of schemas) {
        if (!isProfileTypeSchema(schema)) continue;
        // Skip profiles whose hierarchy is incomplete — no resolvable base, or no
        // non-profile root (e.g. constraint-on-constraint with nothing underneath).
        // flatProfile would throw on these; direct callers still see the original exception.
        const hier = tryHierarchy(schema);
        if (!hier?.some((s) => !isProfileTypeSchema(s) && !isSnapshotProfileTypeSchema(s))) continue;
        const snap = buildProfileSnapshot(schema);
        const byPkg = (snapshotIndex[snap.identifier.url] ??= {});
        byPkg[snap.identifier.package] = snap;
    }

    const collectSnapshotProfiles = (): SnapshotProfileTypeSchema[] =>
        Object.values(snapshotIndex).flatMap((byPkg) => Object.values(byPkg));

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

    const isWithMetaField = (profile: ProfileTypeSchema | SnapshotProfileTypeSchema): boolean => {
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
                "profile-snapshot": {},
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
        collectSnapshotProfiles,
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
