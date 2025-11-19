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
    const schemaPackage = schema.identifier.package;

    const imports = [];
    const skipped = [];

    // Track if Extension import is needed for extensions
    const needsExtensionForExtensions = isProfile && schema.extensions && schema.extensions.length > 0;

    // Add Extension to imports array if profile has extensions (for deduplication)
    if (needsExtensionForExtensions) {
        const isSamePackage = "hl7.fhir.r4.core" === schemaPackage;
        const extensionPath = isSamePackage
            ? "../Extension"
            : "../../hl7-fhir-r4-core/Extension";

        imports.push({
            tsPackage: extensionPath,
            name: "Extension",
            dep: { kind: "complex-type", package: "hl7.fhir.r4.core", name: "Extension", url: "" } as any,
        });
    }

    if (!schema.dependencies || schema.dependencies.length === 0) {
        // Write Extension import if needed, even if no other dependencies
        if (imports.length > 0) {
            for (const imp of imports) {
                writer.lineSM(`import type { ${imp.name}} from "${imp.tsPackage}"`);
            }
            writer.line();
        }
        return;
    }

    for (const dep of schema.dependencies) {
        const isSamePackage = dep.package === schemaPackage;

        if (["complex-type", "resource", "logical"].includes(dep.kind)) {
            let tsPackage: string;
            if (isSamePackage) {
                // Same package: profiles use ../, resources use ./
                tsPackage = isProfile
                    ? `../${pascalCase(dep.name)}`
                    : `./${pascalCase(dep.name)}`;
            } else {
                // Different package: profiles use ../../, resources use ../
                const pathPrefix = isProfile ? "../../" : "../";
                tsPackage = `${pathPrefix}${kebabCase(dep.package)}/${pascalCase(dep.name)}`;
            }

            imports.push({
                tsPackage,
                name: uppercaseFirstLetter(dep.name),
                dep: dep,
            });
        } else if (isNestedIdentifier(dep)) {
            let tsPackage: string;
            const depName = pascalCase(canonicalToName(dep.url) ?? "");

            if (isSamePackage) {
                tsPackage = isProfile ? `../${depName}` : `./${depName}`;
            } else {
                const pathPrefix = isProfile ? "../../" : "../";
                tsPackage = `${pathPrefix}${kebabCase(dep.package)}/${depName}`;
            }

            imports.push({
                tsPackage,
                name: tsResourceName(dep),
                dep: dep,
            });
        } else {
            skipped.push(dep);
        }
    }

    // Sort imports by name for consistent output
    imports.sort((a, b) => a.name.localeCompare(b.name));

    // Deduplicate imports by name and package to avoid duplicate imports
    const uniqueImports = new Map<string, typeof imports[0]>();
    for (const imp of imports) {
        const key = `${imp.name}::${imp.tsPackage}`;
        if (!uniqueImports.has(key)) {
            uniqueImports.set(key, imp);
        }
    }

    for (const imp of uniqueImports.values()) {
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
    const schemaPackage = schema.identifier.package;

    const complexTypeDeps = schema.dependencies
        ?.filter((dep) => dep.kind === "complex-type")
        .map((dep) => {
            const isSamePackage = dep.package === schemaPackage;
            const tsPackage = isSamePackage
                ? `./${pascalCase(dep.name)}`
                : `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`;

            return {
                tsPackage,
                name: uppercaseFirstLetter(dep.name),
            };
        });

    if (complexTypeDeps && complexTypeDeps.length > 0) {
        for (const dep of complexTypeDeps) {
            writer.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
        }
        writer.line();
    }
}
