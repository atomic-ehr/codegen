import { kebabCase, pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema, RegularTypeSchema } from "@root/typeschema/types";
import { isNestedIdentifier, isProfileTypeSchema } from "@root/typeschema/types";
import { canonicalToName, tsResourceName } from "./utils";

export function generateDependenciesImports(writer: Writer, schema: RegularTypeSchema | ProfileTypeSchema): void {
    const isProfile = isProfileTypeSchema(schema);
    const schemaPackage = schema.identifier.package;

    const imports = [];
    const skipped = [];

    const needsExtensionForExtensions = isProfile && schema.extensions && schema.extensions.length > 0;

    if (needsExtensionForExtensions) {
        const isSamePackage = "hl7.fhir.r4.core" === schemaPackage;
        const extensionPath = isSamePackage ? "../Extension" : "../../hl7-fhir-r4-core/Extension";

        imports.push({
            tsPackage: extensionPath,
            name: "Extension",
            dep: { kind: "complex-type", package: "hl7.fhir.r4.core", name: "Extension", url: "" } as any,
        });
    }

    if (!schema.dependencies || schema.dependencies.length === 0) {
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
                tsPackage = isProfile ? `../${pascalCase(dep.name)}` : `./${pascalCase(dep.name)}`;
            } else {
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

    imports.sort((a, b) => a.name.localeCompare(b.name));

    const uniqueImports = new Map<string, (typeof imports)[0]>();
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
