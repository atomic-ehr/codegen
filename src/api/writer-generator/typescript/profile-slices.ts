import {
    type ConstrainedChoiceInfo,
    type FieldSlicing,
    type Identifier,
    isChoiceDeclarationField,
    isNotChoiceDeclarationField,
    isPrimitiveIdentifier,
    isResourceIdentifier,
    isTypeDiscriminated,
    type NameCandidates,
    type RegularField,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { ProfileImports } from "./imports";
import {
    type ProfileMethodBaseNames,
    tsFieldName,
    tsProfileClassName,
    tsResourceName,
    tsSliceFlatAllTypeName,
    tsSliceFlatTypeName,
    tsSliceStaticName,
} from "./name";
import { tsGet, tsTypeFromIdentifier } from "./utils";
import type { TypeScript } from "./writer";

export type SliceDef = {
    fieldName: string;
    sliceName: string;
    /** Pre-computed name candidates from TypeSchema (recommended is PascalCase). */
    nameCandidates: NameCandidates;
    /** Discriminator values that identify an element of the slice. */
    match: Record<string, unknown>;
    /** Required fields, already filtered (match keys and polymorphic base names removed) */
    required: string[];
    array: boolean;
    /** 0 = unbounded ("*"), positive = exact limit. */
    max: number;
    constrainedChoice: ConstrainedChoiceInfo | undefined;
    /** True when the slice uses a type discriminator (match by resourceType) */
    typeDiscriminated: boolean;
    /**
     * Element type, parameterized with the matched resource type when the slice is type-discriminated
     * (e.g. "BundleEntry<Patient>").
     */
    typedBaseType: string;
    excluded: string[];
};

/**
 * Returns names of required slices that can be auto-populated with just the discriminator match.
 * Slices are excluded (need user-provided data) when:
 * - They have required fields beyond the match keys (e.g. BP component.valueQuantity)
 * - The field uses a type discriminator (e.g. Bundle entry.resource) — the stub only sets
 *   resourceType, the user must provide the actual typed resource
 */
export const collectRequiredSliceNames = (
    field: RegularField,
    fieldSlicing: FieldSlicing | undefined,
): string[] | undefined => {
    if (!field.array || !fieldSlicing?.slices) return undefined;
    if (isTypeDiscriminated(fieldSlicing)) return undefined;
    const names = Object.entries(fieldSlicing.slices)
        .filter(([_, s]) => {
            if (s.min === undefined || s.min < 1 || !s.match || Object.keys(s.match).length === 0) return false;
            const matchKeys = new Set(Object.keys(s.match));
            const requiredBeyondMatch = (s.required ?? []).filter((name) => !matchKeys.has(name));
            return requiredBeyondMatch.length === 0;
        })
        .map(([name]) => name);
    return names.length > 0 ? names : undefined;
};

/** Collect choice declaration field names from a base type schema */
const collectChoiceBaseNames = (tsIndex: TypeSchemaIndex, typeId: Identifier): Set<string> => {
    const names = new Set<string>();
    const schema = tsIndex.resolveType(typeId);
    if (schema && "fields" in schema && schema.fields) {
        for (const [name, f] of Object.entries(schema.fields)) {
            if (isChoiceDeclarationField(f)) names.add(name);
        }
    }
    return names;
};

/** Extract resource type name from a type-discriminator match (e.g. {"resource":{"resourceType":"Patient"}} → "Patient") */
const extractResourceTypeFromMatch = (match: Record<string, unknown>): string | undefined => {
    for (const value of Object.values(match)) {
        if (typeof value !== "object" || value === null) continue;
        const obj = value as Record<string, unknown>;
        if (typeof obj.resourceType === "string") return obj.resourceType;
        const nested = extractResourceTypeFromMatch(obj);
        if (nested) return nested;
    }
    return undefined;
};

export const collectSliceDefs = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): SliceDef[] => {
    return Object.entries(snapshot.slicing ?? {}).flatMap(([fieldName, fieldSlicing]) => {
        const field = snapshot.fields[fieldName];
        if (!isNotChoiceDeclarationField(field) || !fieldSlicing.slices || !field.type) return [];
        const baseType = tsTypeFromIdentifier(imports.types, field.type);
        const pkgName = snapshot.identifier.package;
        const choiceBaseNames = collectChoiceBaseNames(tsIndex, field.type);
        const typeDiscriminated = isTypeDiscriminated(fieldSlicing);
        return Object.entries(fieldSlicing.slices)
            .filter(([_, slice]) => Object.keys(slice.match ?? {}).length > 0)
            .map(([sliceName, slice]) => {
                const matchFields = Object.keys(slice.match ?? {});
                const required = (slice.required ?? []).filter(
                    (name) => !matchFields.includes(name) && !choiceBaseNames.has(name),
                );
                const cc = slice.elements ? tsIndex.constrainedChoice(pkgName, field.type, slice.elements) : undefined;
                // Skip flattening for primitive types — can't intersect object with boolean/string/etc.
                const constrainedChoice = cc && !isPrimitiveIdentifier(cc.variantType) ? cc : undefined;
                const resourceType = typeDiscriminated ? extractResourceTypeFromMatch(slice.match ?? {}) : undefined;
                let typedBaseType = baseType;
                if (resourceType) {
                    const resourceSchema = tsIndex.schemas.find(
                        (s) => s.identifier.name === resourceType && isResourceIdentifier(s.identifier),
                    );
                    if (!resourceSchema) throw new Error(`Resource type '${resourceType}' not found for ${pkgName}.`);
                    typedBaseType = `${baseType}<${imports.types.use(resourceSchema.identifier)}>`;
                }
                return {
                    fieldName,
                    sliceName,
                    nameCandidates: slice.nameCandidates,
                    match: slice.match ?? {},
                    required,
                    array: Boolean(field.array),
                    max: slice.max ?? 0,
                    constrainedChoice,
                    typeDiscriminated,
                    typedBaseType,
                    excluded: slice.excluded ?? [],
                };
            });
    });
};

export const generateStaticSliceFields = (w: TypeScript, sliceDefs: SliceDef[]) => {
    for (const sliceDef of sliceDefs) {
        const staticName = tsSliceStaticName(sliceDef.sliceName);
        const json = JSON.stringify(sliceDef.match);
        const prefix = `private static readonly ${staticName}: Record<string, unknown> = `;
        if (prefix.length + json.length <= (w.opts.lineWidth ?? 120)) {
            w.lineSM(`${prefix}${json}`);
        } else {
            w.curlyBlock([prefix.trimEnd()], () => {
                for (const [key, value] of Object.entries(sliceDef.match)) {
                    w.line(`${JSON.stringify(key)}: ${JSON.stringify(value)},`);
                }
            });
        }
    }
    if (sliceDefs.length > 0) w.line();
};

/** Convert a JS value to a TypeScript type literal string (e.g. `{ code: "vital-signs"; system: "http://..." }`). */
const valueToTypeLiteral = (value: unknown): string => {
    if (value === null || value === undefined) return "undefined";
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return `[${value.map(valueToTypeLiteral).join(", ")}]`;
    if (typeof value === "object") {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${valueToTypeLiteral(v)}`)
            .join("; ");
        return `{ ${entries} }`;
    }
    return "unknown";
};

export const generateSliceInputTypes = (
    w: TypeScript,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
) => {
    if (sliceDefs.length === 0) return;
    const tsProfileName = tsResourceName(snapshot.identifier);
    for (const sliceDef of sliceDefs) {
        const inputTypeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const flatTypeName = tsSliceFlatAllTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchFields = sliceDef.typeDiscriminated ? [] : Object.keys(sliceDef.match);
        const allExcluded = [...new Set([...sliceDef.excluded, ...matchFields])];
        if (sliceDef.constrainedChoice) {
            const cc = sliceDef.constrainedChoice;
            allExcluded.push(cc.choiceBase);
            for (const name of cc.allChoiceNames) {
                if (!allExcluded.includes(name)) allExcluded.push(name);
            }
        }
        const excludedNames = allExcluded.map((name) => JSON.stringify(name));
        const requiredNames = sliceDef.required.map((name) => JSON.stringify(name));
        const baseType = sliceDef.typedBaseType;
        let inputTypeExpr = baseType;
        if (excludedNames.length > 0) {
            inputTypeExpr = `Omit<${inputTypeExpr}, ${excludedNames.join(" | ")}>`;
        }
        if (requiredNames.length > 0) {
            inputTypeExpr = `${inputTypeExpr} & Required<Pick<${baseType}, ${requiredNames.join(" | ")}>>`;
        }
        if (sliceDef.constrainedChoice) {
            inputTypeExpr = `${inputTypeExpr} & ${tsTypeFromIdentifier(imports.types, sliceDef.constrainedChoice.variantType)}`;
        }
        // Input type — setter parameter, no discriminator fields
        w.lineSM(`export type ${inputTypeName} = ${inputTypeExpr}`);
        // Flat type — getter return, includes readonly discriminator values as literal types
        const safeMatchEntries =
            matchFields.length > 0 && !sliceDef.constrainedChoice
                ? matchFields
                      .filter((key) => {
                          const v = sliceDef.match[key];
                          return Array.isArray(v) || typeof v !== "object" || v === null;
                      })
                      .map((key) => ({ key, typeLiteral: valueToTypeLiteral(sliceDef.match[key]) }))
                : [];
        if (safeMatchEntries.length > 0) {
            w.curlyBlock([`export type ${flatTypeName} = ${inputTypeName} &`], () => {
                for (const entry of safeMatchEntries) {
                    w.lineSM(`readonly ${entry.key}: ${entry.typeLiteral}`);
                }
            });
        } else {
            w.lineSM(`export type ${flatTypeName} = ${inputTypeName}`);
        }
        w.line();
    }
};

const generateSliceGetters = (
    w: TypeScript,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    methodNames: ProfileMethodBaseNames,
) => {
    const className = tsProfileClassName(snapshot);
    const tsProfileName = tsResourceName(snapshot.identifier);
    const defaultMode = w.opts.sliceGetterDefault ?? "flat";
    for (const sliceDef of sliceDefs) {
        const baseName = methodNames.slice(sliceDef);
        const getMethodName = `get${baseName}`;
        const flatTypeName = tsSliceFlatAllTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchRef = `${className}.${tsSliceStaticName(sliceDef.sliceName)}`;
        const matchKeys = JSON.stringify(Object.keys(sliceDef.match));
        const tsField = tsFieldName(sliceDef.fieldName);
        const fieldAccess = tsGet("this.resource", tsField);
        const baseType = sliceDef.typedBaseType;
        const isUnbounded = sliceDef.array && sliceDef.max === 0;

        if (isUnbounded) {
            // Unbounded slice: return an array or undefined
            const defaultReturn = defaultMode === "raw" ? `${baseType}[]` : `${flatTypeName}[]`;

            // Overload signatures
            w.lineSM(`public ${getMethodName}(mode: 'flat'): ${flatTypeName}[] | undefined`);
            w.lineSM(`public ${getMethodName}(mode: 'raw'): ${baseType}[] | undefined`);
            w.lineSM(`public ${getMethodName}(): ${defaultReturn} | undefined`);

            // Implementation
            w.curlyBlock(
                [
                    "public",
                    getMethodName,
                    `(mode: 'flat' | 'raw' = '${defaultMode}'): (${flatTypeName} | ${baseType})[] | undefined`,
                ],
                () => {
                    w.line(`const match = ${matchRef}`);
                    w.line(`const items = ${imports.helpers.use("getArraySliceAll")}(${fieldAccess}, match)`);
                    w.line("if (items.length === 0) return undefined");
                    if (sliceDef.typeDiscriminated) {
                        w.line(`if (mode === 'raw') return items as ${baseType}[]`);
                    } else {
                        w.line("if (mode === 'raw') return items");
                    }
                    if (sliceDef.constrainedChoice) {
                        const cc = sliceDef.constrainedChoice;
                        w.line(
                            `return items.map(item => ${imports.helpers.use("unwrapSliceChoice")}<${flatTypeName}>(item, ${matchKeys}, ${JSON.stringify(cc.variant)}))`,
                        );
                    } else {
                        w.line(`return items as unknown as ${flatTypeName}[]`);
                    }
                },
            );
        } else {
            // Single-element slice: return single item or undefined
            const defaultReturn = defaultMode === "raw" ? baseType : flatTypeName;

            // Overload signatures
            w.lineSM(`public ${getMethodName}(mode: 'flat'): ${flatTypeName} | undefined`);
            w.lineSM(`public ${getMethodName}(mode: 'raw'): ${baseType} | undefined`);
            w.lineSM(`public ${getMethodName}(): ${defaultReturn} | undefined`);

            // Implementation
            w.curlyBlock(
                [
                    "public",
                    getMethodName,
                    `(mode: 'flat' | 'raw' = '${defaultMode}'): ${flatTypeName} | ${baseType} | undefined`,
                ],
                () => {
                    w.line(`const match = ${matchRef}`);
                    if (sliceDef.array) {
                        w.line(`const item = ${imports.helpers.use("getArraySlice")}(${fieldAccess}, match)`);
                        w.line("if (!item) return undefined");
                    } else {
                        w.line(`const item = ${fieldAccess}`);
                        w.line(`if (!item || !${imports.helpers.use("matchesValue")}(item, match)) return undefined`);
                    }
                    if (sliceDef.typeDiscriminated) {
                        w.line(`if (mode === 'raw') return item as ${baseType}`);
                    } else {
                        w.line("if (mode === 'raw') return item");
                    }
                    if (sliceDef.constrainedChoice) {
                        const cc = sliceDef.constrainedChoice;
                        w.line(
                            `return ${imports.helpers.use("unwrapSliceChoice")}<${flatTypeName}>(item, ${matchKeys}, ${JSON.stringify(cc.variant)})`,
                        );
                    } else {
                        w.line(`return item as unknown as ${flatTypeName}`);
                    }
                },
            );
        }
        w.line();
    }
};

const generateSliceSetters = (
    w: TypeScript,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    methodNames: ProfileMethodBaseNames,
) => {
    const className = tsProfileClassName(snapshot);
    const tsProfileName = tsResourceName(snapshot.identifier);
    for (const sliceDef of sliceDefs) {
        const baseName = methodNames.slice(sliceDef);
        const methodName = `set${baseName}`;
        const inputTypeName = tsSliceFlatTypeName(tsProfileName, sliceDef.fieldName, sliceDef.sliceName);
        const matchRef = `${className}.${tsSliceStaticName(sliceDef.sliceName)}`;
        const tsField = tsFieldName(sliceDef.fieldName);
        const fieldAccess = tsGet("this.resource", tsField);
        const baseType = sliceDef.typedBaseType;
        const isUnbounded = sliceDef.array && sliceDef.max === 0;

        if (isUnbounded) {
            // Unbounded slice: accept an array of items
            const unionType = `(${inputTypeName} | ${baseType})[]`;
            const paramSignature = `(input: ${unionType}): this`;
            w.curlyBlock(["public", methodName, paramSignature], () => {
                w.line(`const match = ${matchRef}`);
                w.line(`const arr = ${fieldAccess} ??= []`);
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(
                        `const values = input.map(item => ${imports.helpers.use("matchesValue")}(item, match) ? item as ${baseType} : ${imports.helpers.use("applySliceMatch")}<${baseType}>(${imports.helpers.use("wrapSliceChoice")}<${baseType}>(item, ${JSON.stringify(cc.variant)}), match))`,
                    );
                } else {
                    w.line(
                        `const values = input.map(item => ${imports.helpers.use("matchesValue")}(item, match) ? item as ${baseType} : ${imports.helpers.use("applySliceMatch")}<${baseType}>(item, match))`,
                    );
                }
                w.line(`${imports.helpers.use("setArraySliceAll")}(arr, match, values)`);
                w.line("return this");
            });
        } else {
            // Single-element slice (max: 1): keep existing behavior
            const inputOptional = sliceDef.required.length === 0;
            const unionType = `${inputTypeName} | ${baseType}`;
            const paramSignature = inputOptional ? `(input?: ${unionType}): this` : `(input: ${unionType}): this`;
            w.curlyBlock(["public", methodName, paramSignature], () => {
                w.line(`const match = ${matchRef}`);
                w.curlyBlock(["if", `(input && ${imports.helpers.use("matchesValue")}(input, match))`], () => {
                    if (sliceDef.array) {
                        w.line(
                            `${imports.helpers.use("setArraySlice")}(${fieldAccess} ??= [], match, input as ${baseType})`,
                        );
                    } else {
                        w.line(`${fieldAccess} = input as ${baseType}`);
                    }
                    w.line("return this");
                });
                const inputExpr = inputOptional ? "input ?? {}" : "input";
                if (sliceDef.constrainedChoice) {
                    const cc = sliceDef.constrainedChoice;
                    w.line(
                        `const wrapped = ${imports.helpers.use("wrapSliceChoice")}<${baseType}>(${inputExpr}, ${JSON.stringify(cc.variant)})`,
                    );
                    w.line(`const value = ${imports.helpers.use("applySliceMatch")}<${baseType}>(wrapped, match)`);
                } else {
                    w.line(`const value = ${imports.helpers.use("applySliceMatch")}<${baseType}>(${inputExpr}, match)`);
                }
                if (sliceDef.array) {
                    w.line(`${imports.helpers.use("setArraySlice")}(${fieldAccess} ??= [], match, value)`);
                } else {
                    w.line(`${fieldAccess} = value`);
                }
                w.line("return this");
            });
        }
        w.line();
    }
};

export const generateSliceMethods = (
    w: TypeScript,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    sliceDefs: SliceDef[],
    methodNames: ProfileMethodBaseNames,
) => {
    // All slice setters first, then all slice getters.
    generateSliceSetters(w, imports, snapshot, sliceDefs, methodNames);
    generateSliceGetters(w, imports, snapshot, sliceDefs, methodNames);
};
