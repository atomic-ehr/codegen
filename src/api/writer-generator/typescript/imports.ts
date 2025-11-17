import { kebabCase, pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema, RegularTypeSchema, TypeSchema } from "@root/typeschema/types";
import { isNestedIdentifier, isProfileTypeSchema } from "@root/typeschema/types";
import { canonicalToName, tsResourceName } from "./utils";

/**
 * Generate import statements for dependencies
 */
export function generateDependenciesImports(writer: Writer, schema: RegularTypeSchema | ProfileTypeSchema): void {
    // Profiles are in a subdirectory, so need extra ../ for imports
    const isProfile = isProfileTypeSchema(schema);
    const pathPrefix = isProfile ? "../../" : "../";

    // Add Extension type if profile has extensions
    if (isProfile && schema.extensions && schema.extensions.length > 0) {
        writer.lineSM(`import type { Extension } from "${pathPrefix}hl7-fhir-r4-core/Extension"`);
    }

    if (!schema.dependencies || schema.dependencies.length === 0) {
        if (isProfile && schema.extensions && schema.extensions.length > 0) {
            writer.line();
        }
        return;
    }

    const imports = [];
    const skipped = [];

    for (const dep of schema.dependencies) {
        if (["complex-type", "resource", "logical"].includes(dep.kind)) {
            imports.push({
                tsPackage: `${pathPrefix}${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
                name: uppercaseFirstLetter(dep.name),
                dep: dep,
            });
        } else if (isNestedIdentifier(dep)) {
            imports.push({
                tsPackage: `${pathPrefix}${kebabCase(dep.package)}/${pascalCase(canonicalToName(dep.url) ?? "")}`,
                name: tsResourceName(dep),
                dep: dep,
            });
        } else {
            skipped.push(dep);
        }
    }

    // Sort imports by name for consistent output
    imports.sort((a, b) => a.name.localeCompare(b.name));

    for (const imp of imports) {
        writer.debugComment(imp.dep);
        writer.lineSM(`import type { ${imp.name} } from "${imp.tsPackage}"`);
    }

    for (const dep of skipped) {
        writer.debugComment("skip:", dep);
    }

    writer.line();
}

/**
 * Generate re-exports for complex types
 */
export function generateComplexTypeReexports(writer: Writer, schema: RegularTypeSchema): void {
    // Regular types (not profiles) are in package root, use ../
    const pathPrefix = "../";

    const complexTypeDeps = schema.dependencies
        ?.filter((dep) => dep.kind === "complex-type")
        .map((dep) => ({
            tsPackage: `${pathPrefix}${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
            name: uppercaseFirstLetter(dep.name),
        }));

    if (complexTypeDeps && complexTypeDeps.length > 0) {
        for (const dep of complexTypeDeps) {
            writer.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
        }
        writer.line();
    }
}
