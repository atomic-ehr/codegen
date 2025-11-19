import { pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type {
	Identifier,
	ProfileTypeSchema,
	RegularTypeSchema,
	TypeSchema,
} from "@root/typeschema/types";
import { isProfileTypeSchema } from "@root/typeschema/types";
import { groupByPackages, type TypeSchemaIndex } from "@root/typeschema/utils";
import {
	generateComplexTypeReexports,
	generateDependenciesImports,
} from "./imports";
import {
	generateAttachProfile,
	generateExtractProfile,
	generateProfileType,
} from "./profile";
import { generateProfileAdapter } from "./profile-adapter";
import { generateProfileFactory } from "./profile-factory";
import { generateNestedTypes, generateType } from "./resource";
import {
	tsFhirPackageDir,
	tsModuleFileName,
	tsModuleName,
	tsResourceName,
} from "./utils";

export type TypeScriptOptions = WriterOptions;

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
				.map((schema) => ({
					identifier: schema.identifier,
					tsPackageName: tsModuleName(schema.identifier),
					resourceName: tsResourceName(schema.identifier),
				}))
				.sort((a, b) => a.resourceName.localeCompare(b.resourceName));

			// FIXME: actually, duplication may mean internal error...
			exports = Array.from(
				new Map(
					exports.map((exp) => [exp.resourceName.toLowerCase(), exp]),
				).values(),
			).sort((a, b) => a.resourceName.localeCompare(b.resourceName));

			for (const exp of exports) {
				this.debugComment(exp.identifier);
				this.lineSM(
					`export type { ${exp.resourceName} } from "./${exp.tsPackageName}"`,
				);
			}
		});
	}

	/**
	 * Generate a single resource/profile module file
	 */
	generateResourceModule(tsIndex: TypeSchemaIndex, schema: TypeSchema): void {
		this.cat(tsModuleFileName(schema.identifier), () => {
			this.generateDisclaimer();

			if (["complex-type", "resource", "logical"].includes(schema.identifier.kind)) {
				this.generateResourceFile(tsIndex, schema as RegularTypeSchema);
			} else if (isProfileTypeSchema(schema)) {
				this.generateProfileFile(tsIndex, schema);
			} else {
				throw new Error(
					`Profile generation not implemented for kind: ${schema.identifier.kind}`,
				);
			}
		});
	}

	/**
	 * Generate resource/complex type file
	 */
	private generateResourceFile(
		tsIndex: TypeSchemaIndex,
		schema: RegularTypeSchema,
	): void {
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
	private generateProfileFile(
		tsIndex: TypeSchemaIndex,
		schema: ProfileTypeSchema,
	): void {
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
			// ...tsIndex.collectLogicalModels(),
			...tsIndex
				.collectProfiles()
				// NOTE: because non Resource don't have `meta` field
				.filter((p) => tsIndex.isWithMetaField(p)),
		];

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
