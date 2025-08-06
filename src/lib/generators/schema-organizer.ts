/**
 * Schema Organization Utilities
 *
 * Shared utilities for organizing TypeSchema objects by type across all generators.
 */

import type { AnyTypeSchema, TypeSchema } from "../typeschema";
import { isTypeSchema } from "../typeschema";

/**
 * Organized schemas grouped by type
 */
export interface OrganizedSchemas {
	primitiveTypes: TypeSchema[];
	complexTypes: TypeSchema[];
	resources: TypeSchema[];
	profiles: TypeSchema[];
	valueSets: TypeSchema[];
	bindings: TypeSchema[];
}

/**
 * Organize schemas by type for generators
 *
 * This function filters and categorizes TypeSchema objects based on their kind,
 * ensuring only valid schemas with proper field definitions are included.
 */
export function organizeSchemas(schemas: AnyTypeSchema[]): OrganizedSchemas {
	const primitiveTypes: TypeSchema[] = [];
	const complexTypes: TypeSchema[] = [];
	const resources: TypeSchema[] = [];
	const profiles: TypeSchema[] = [];
	const valueSets: TypeSchema[] = [];
	const bindings: TypeSchema[] = [];

	for (const schema of schemas) {
		const kind = schema.identifier?.kind;
		const name = schema.identifier?.name;
		const url = schema.identifier?.url;

		// Skip SearchParameters for now
		if (
			name === "SearchParameter" ||
			(url && url.includes("/SearchParameter/"))
		) {
			continue;
		}

		// Only include schemas with fields (actual type definitions)
		// or bindings/valuesets/profiles which don't need fields
		const hasFields =
			isTypeSchema(schema) &&
			schema.fields &&
			Object.keys(schema.fields).length > 0;
		const isBinding = kind === "binding";
		const isValueSet = kind === "value-set";
		const isProfile = kind === "profile";

		if (!hasFields && !isBinding && !isValueSet && !isProfile) {
			continue;
		}

		switch (kind) {
			case "primitive-type":
				primitiveTypes.push(schema);
				break;
			case "complex-type":
				complexTypes.push(schema);
				break;
			case "resource":
				resources.push(schema);
				break;
			case "profile":
				profiles.push(schema);
				break;
			case "value-set":
				valueSets.push(schema);
				break;
			case "binding":
				bindings.push(schema);
				break;
			// Skip other kinds for now
		}
	}

	return {
		primitiveTypes,
		complexTypes,
		resources,
		profiles,
		valueSets,
		bindings,
	};
}
