import { kebabCase, pascalCase, uppercaseFirstLetter } from "@root/api/writer-generator/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import type { RegularTypeSchema, TypeSchema } from "@root/typeschema/types";
import { isNestedIdentifier } from "@root/typeschema/types";
import { canonicalToName, tsResourceName } from "./utils";

/**
 * Generate import statements for dependencies
 */
export function generateDependenciesImports(
	writer: Writer,
	schema: RegularTypeSchema,
): void {
	if (!schema.dependencies || schema.dependencies.length === 0) {
		return;
	}

	const imports = [];
	const skipped = [];

	for (const dep of schema.dependencies) {
		if (["complex-type", "resource", "logical"].includes(dep.kind)) {
			imports.push({
				tsPackage: `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
				name: uppercaseFirstLetter(dep.name),
				dep: dep,
			});
		} else if (isNestedIdentifier(dep)) {
			imports.push({
				tsPackage: `../${kebabCase(dep.package)}/${pascalCase(canonicalToName(dep.url) ?? "")}`,
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
		writer.lineSM(
			`import type { ${imp.name} } from "${imp.tsPackage}"`,
		);
	}

	for (const dep of skipped) {
		writer.debugComment("skip:", dep);
	}

	writer.line();
}

/**
 * Generate re-exports for complex types
 */
export function generateComplexTypeReexports(
	writer: Writer,
	schema: RegularTypeSchema,
): void {
	const complexTypeDeps = schema.dependencies
		?.filter((dep) => dep.kind === "complex-type")
		.map((dep) => ({
			tsPackage: `../${kebabCase(dep.package)}/${pascalCase(dep.name)}`,
			name: uppercaseFirstLetter(dep.name),
		}));

	if (complexTypeDeps && complexTypeDeps.length > 0) {
		for (const dep of complexTypeDeps) {
			writer.lineSM(`export type { ${dep.name} } from "${dep.tsPackage}"`);
		}
		writer.line();
	}
}
