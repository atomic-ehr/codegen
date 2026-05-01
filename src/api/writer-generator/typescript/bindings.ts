import {
    type BindingTypeSchema,
    isBindingSchema,
    isChoiceDeclarationField,
    isProfileTypeSchema,
    type SpecializationTypeSchema,
    type TypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { tsBindingName } from "./name";
import type { TypeScript } from "./writer";

const collectBindingUrls = (schemas: TypeSchema[]): Set<string> => {
    const urls = new Set<string>();
    const visit = (schema: { fields?: Record<string, unknown> } | undefined) => {
        if (!schema?.fields) return;
        for (const field of Object.values(schema.fields)) {
            if (!field || typeof field !== "object") continue;
            if (isChoiceDeclarationField(field as never)) continue;
            const f = field as { binding?: { url: string } };
            if (f.binding) urls.add(f.binding.url);
        }
    };
    for (const schema of schemas) {
        if (isProfileTypeSchema(schema)) {
            visit(schema);
        } else {
            const s = schema as SpecializationTypeSchema;
            visit(s);
            if (s.nested) for (const n of s.nested) visit(n);
        }
    }
    return urls;
};

/** Bindings used by the given package's schemas, with concepts available. */
export const collectBindingsForPackage = (
    tsIndex: TypeSchemaIndex,
    packageSchemas: TypeSchema[],
): BindingTypeSchema[] => {
    const usedUrls = collectBindingUrls(packageSchemas);
    const allBindings = tsIndex.schemas.filter(isBindingSchema);
    return allBindings
        .filter((b) => usedUrls.has(b.identifier.url) && b.concepts && b.concepts.length > 0)
        .sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
};

const emitConceptsLookup = (
    w: TypeScript,
    name: string,
    type: string,
    concepts: NonNullable<BindingTypeSchema["concepts"]>,
) => {
    const seen = new Set<string>();
    w.curlyBlock([
        "export",
        "const",
        `${name}Concepts:`,
        `Readonly<Record<${type}, { system?: string; code: ${type}; display?: string }>>`,
        "=",
    ], () => {
        for (const concept of concepts) {
            if (seen.has(concept.code)) continue;
            seen.add(concept.code);
            const parts: string[] = [];
            if (concept.system) parts.push(`system: ${JSON.stringify(concept.system)}`);
            parts.push(`code: ${JSON.stringify(concept.code)}`);
            if (concept.display) parts.push(`display: ${JSON.stringify(concept.display)}`);
            const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(concept.code) ? concept.code : JSON.stringify(concept.code);
            w.line(`${key}: { ${parts.join(", ")} },`);
        }
    }, [" as const;"]);
};

const emitBinding = (w: TypeScript, binding: BindingTypeSchema) => {
    const name = tsBindingName(binding.identifier);
    const concepts = binding.concepts;
    if (!concepts || concepts.length === 0) return;

    // Deduplicate codes preserving first occurrence.
    const seen = new Set<string>();
    const codes: string[] = [];
    for (const c of concepts) {
        if (seen.has(c.code)) continue;
        seen.add(c.code);
        codes.push(c.code);
    }
    const valueSetUrl = binding.valueset?.url;
    const strength = binding.strength;
    const headerParts = [strength, valueSetUrl].filter(Boolean).join(" — ");
    if (headerParts) w.comment(`${name}${headerParts ? ` (${headerParts})` : ""}`);

    // Codes array + literal type
    w.lineSM(`export const ${name}Codes = [${codes.map((c) => JSON.stringify(c)).join(", ")}] as const`);
    w.lineSM(`export type ${name} = (typeof ${name}Codes)[number]`);

    // Concepts lookup table
    emitConceptsLookup(w, name, name, concepts);

    // Parse helpers
    w.curlyBlock(["export", "const", `parse${name}`, "=", `(input: unknown, fieldName?: string): ${name} =>`], () => {
        w.lineSM(`return parseLiteral(input, ${name}Codes, fieldName)`);
    });

    w.curlyBlock(["export", "const", `parse${name}Coding`, "=", "(input: unknown, fieldName?: string) =>"], () => {
        w.lineSM(`return parseCoding(input, ${name}Concepts, fieldName)`);
    });
    w.line();
};

export const generateBindingsModule = (w: TypeScript, bindings: BindingTypeSchema[], helpersImportPath: string) => {
    w.cat("bindings.ts", () => {
        w.generateDisclaimer();
        w.tsImport(helpersImportPath, "parseLiteral", "parseCoding");
        w.line();
        for (const binding of bindings) {
            emitBinding(w, binding);
        }
    });
};
