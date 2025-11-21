import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema, RegularTypeSchema, TypeSchema } from "@root/typeschema/types";
import { isProfileTypeSchema } from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";
import { generateComplexTypeReexports, generateDependenciesImports } from "./imports";
import { generateProfileAdapter } from "./profile-adapter";
import { generateProfileFactory } from "./profile-factory";
import { generateNestedTypes, generateType } from "./resource";
import { tsFhirPackageDir, tsModuleFileName, tsModuleName, tsResourceName } from "./utils";

export type TypeScriptOptions = {
    /** openResourceTypeSet -- for resource families (Resource, DomainResource) use open set for resourceType field.
     *
     * - when openResourceTypeSet is false: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" }`
     * - when openResourceTypeSet is true: `type Resource = { resourceType: "Resource" | "DomainResource" | "Patient" | string }`
     */
    openResourceTypeSet?: boolean;
} & WriterOptions;

/**
 * TypeScript code generator
 * Extends Writer base class for file system operations
 */
export class TypeScript extends Writer {
    /**
     * Generate package index file (exports all types)
     */
    generateFhirPackageIndexFile(schemas: TypeSchema[]): void {
        this.cat("index.ts", () => {
            let exports = schemas
                .flatMap((schema) => {
                    // Determine if this schema has nested types
                    const nestedTypes: string[] = [];
                    if ("nested" in schema && schema.nested) {
                        nestedTypes.push(...schema.nested.map((n) => tsResourceName(n.identifier)));
                    }

                    // Determine if this schema has helpers (type predicates)
                    const helpers: string[] = [];
                    if (schema.identifier.kind === "resource" || schema.identifier.kind === "logical") {
                        helpers.push(`is${tsResourceName(schema.identifier)}`);
                    }

                    return [
                        {
                            identifier: schema.identifier,
                            tsPackageName: tsModuleName(schema.identifier),
                            resourceName: tsResourceName(schema.identifier),
                            nestedTypes,
                            helpers,
                        },
                    ];
                })
                .sort((a, b) => a.resourceName.localeCompare(b.resourceName));

            // FIXME: actually, duplication may mean internal error...
            exports = Array.from(new Map(exports.map((exp) => [exp.resourceName.toLowerCase(), exp])).values()).sort(
                (a, b) => a.resourceName.localeCompare(b.resourceName),
            );

            for (const exp of exports) {
                this.debugComment(exp.identifier);

                // Export types (main type + nested types)
                const allTypes = [exp.resourceName, ...exp.nestedTypes];
                this.lineSM(`export type { ${allTypes.join(", ")} } from "./${exp.tsPackageName}"`);

                // Export helpers (type predicates)
                if (exp.helpers.length > 0) {
                    this.lineSM(`export { ${exp.helpers.join(", ")} } from "./${exp.tsPackageName}"`);
                }
            }
        });
    }

    /**
     * Generate a single resource/profile module file
     */
    generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema): void {
        const fileName = tsModuleFileName(schema.identifier);

        // If it's a profile, generate it in a 'profiles' subfolder
        if (isProfileTypeSchema(schema)) {
            this.cd("profiles", () => {
                this.cat(fileName, () => {
                    this.generateDisclaimer();
                    this.generateProfileFile(tsIndex, schema);
                });
            });
        } else {
            this.cat(fileName, () => {
                this.generateDisclaimer();

                if (["complex-type", "resource", "logical"].includes(schema.identifier.kind)) {
                    this.generateResourceFile(tsIndex, schema as RegularTypeSchema);
                } else {
                    throw new Error(`Generation not implemented for kind: ${schema.identifier.kind}`);
                }
            });
        }
    }

    /**
     * Generate resource/complex type file
     */
    private generateResourceFile(tsIndex: TypeSchemaIndex, schema: RegularTypeSchema): void {
        // Generate imports
        generateDependenciesImports(this, schema);

        // Re-export complex types
        generateComplexTypeReexports(this, schema);

        // Generate nested types
        generateNestedTypes(this, tsIndex, schema);

        // Add canonical URL comment
        this.comment("CanonicalURL:", schema.identifier.url);

        // Generate main interface
        generateType(this, tsIndex, schema);
    }

    /**
     * Generate profile file using adapter pattern
     */
    private generateProfileFile(tsIndex: TypeSchemaIndex, schema: ProfileTypeSchema): void {
        // Generate imports for base resource and dependencies
        generateDependenciesImports(this, schema);

        // Add canonical URL comment
        this.comment("CanonicalURL:", schema.identifier.url || "");
        this.line();

        // Generate adapter class
        generateProfileAdapter(this, tsIndex, schema);
        this.line();

        // Generate factory function
        generateProfileFactory(this, schema);
    }

    /**
     * Main generation entry point
     */
    override generate(tsIndex: TypeSchemaIndex): void {
        // Collect all types to generate
        const typesToGenerate = [
            ...tsIndex.collectComplexTypes(),
            ...tsIndex.collectResources(),
            ...tsIndex.collectLogicalModels(),
        ];

        // Only add profiles if generateProfile option is enabled
        if (this.opts.generateProfile) {
            typesToGenerate.push(
                ...tsIndex
                    .collectProfiles()
                    // NOTE: because non Resource don't have `meta` field
                    .filter((p) => tsIndex.isWithMetaField(p)),
            );
        }

        // Group by package
        const grouped = groupByPackages(typesToGenerate);

        // Generate files
        this.cd("/", () => {
            for (const [packageName, packageSchemas] of Object.entries(grouped)) {
                const tsPackageDir = tsFhirPackageDir(packageName);
                this.cd(tsPackageDir, () => {
                    for (const schema of packageSchemas) {
                        this.generateResourceModule(tsIndex, schema);
                    }
                    this.generateFhirPackageIndexFile(packageSchemas);
                });
            }
        });
    }
}
