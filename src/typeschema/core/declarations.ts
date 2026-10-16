import type { CodegenLog } from "../../utils/log";
import type { Register } from "../register";
import {
    type CanonicalUrl,
    type Field,
    isChoiceDeclarationField,
    isNestedIdentifier,
    isNestedTypeSchema,
    isProfileTypeSchema,
    isSpecializationTypeSchema,
    type NestedIdentifier,
    type NestedTypeSchema,
    type RichFHIRSchema,
    type TypeSchema,
} from "../types";
import { extractDependencies } from "./dependencies";
import { mkIdentifier } from "./identifier";
import { mkNestedIdentifier, mkNestedTypes } from "./nested-types";

const directDependencies = (schema: TypeSchema) =>
    extractDependencies(
        schema.identifier,
        "base" in schema ? schema.base : undefined,
        "fields" in schema ? schema.fields : undefined,
        "extensions" in schema ? schema.extensions : undefined,
    );
export const finalizeDeclarations = (
    register: Register,
    fs: RichFHIRSchema,
    declarations: TypeSchema[],
    logger?: CodegenLog,
): TypeSchema[] => {
    const nestedCache = new WeakMap<RichFHIRSchema, NestedTypeSchema[]>();
    const nestedOf = (fs: RichFHIRSchema, logger?: CodegenLog): NestedTypeSchema[] => {
        let nested = nestedCache.get(fs);
        if (!nested) {
            nested = mkNestedTypes(register, fs, logger) ?? [];
            nestedCache.set(fs, nested);
        }
        return nested;
    };

    const constrainedIdentifier = (fs: RichFHIRSchema, path: string[]): NestedIdentifier => ({
        ...mkIdentifier(fs),
        kind: "nested",
        name: path.join(".") as NestedIdentifier["name"],
        url: `${fs.url}#${path.join(".")}` as CanonicalUrl,
    });

    const effectiveNestedIdentifier = (fs: RichFHIRSchema, path: string[], logger?: CodegenLog): NestedIdentifier => {
        for (const ancestor of register.resolveFsGenealogy(fs.package_meta, fs.url)) {
            if (ancestor.derivation !== "constraint") return mkNestedIdentifier(register, ancestor, path);
            if (nestedOf(ancestor, logger).some((node) => node.identifier.name === path.join("."))) {
                return constrainedIdentifier(ancestor, path);
            }
        }
        throw new Error(`No structural nested type for ${fs.url}#${path.join(".")}`);
    };

    const rewriteFields = (fields: Record<string, Field> | undefined): Record<string, Field> | undefined => {
        if (!fields) return undefined;
        return Object.fromEntries(
            Object.entries(fields).map(([name, field]) => {
                if (isChoiceDeclarationField(field) || !isNestedIdentifier(field.type)) return [name, field];
                return [name, { ...field, type: effectiveNestedIdentifier(fs, field.type.name.split("."), logger) }];
            }),
        );
    };

    const result: TypeSchema[] = [];
    for (const schema of declarations) {
        if (isNestedTypeSchema(schema)) {
            const path = schema.path;
            let base = schema.base;
            if (fs.derivation === "constraint") {
                const parent = register.resolveFsGenealogy(fs.package_meta, fs.url)[1];
                if (!parent) throw new Error(`Profile ${fs.url} has no parent`);
                base = effectiveNestedIdentifier(parent, path, logger);
            }
            const node: NestedTypeSchema = {
                ...schema,
                identifier: fs.derivation === "constraint" ? constrainedIdentifier(fs, path) : schema.identifier,
                origin: schema.identifier,
                base,
                fields: rewriteFields(schema.fields) ?? {},
            };
            node.dependencies = directDependencies(node);
            result.push(node);
        } else if (isSpecializationTypeSchema(schema) || isProfileTypeSchema(schema)) {
            const root = { ...schema, fields: rewriteFields(schema.fields) };
            root.dependencies = directDependencies(root);
            result.push(root);
        } else {
            result.push(schema);
        }
    }
    return result;
};
