/**
 * Python type mapper implementation (basic version)
 */

import type { TypeSchemaIdentifier } from "../../../typeschema";
import { type LanguageType, TypeMapper } from "./TypeMapper";

export class PythonTypeMapper extends TypeMapper {
	getLanguageName(): string {
		return "Python";
	}

	mapPrimitive(fhirType: string): LanguageType {
		const primitiveMap: Record<string, string> = {
			string: "str",
			integer: "int",
			decimal: "float",
			boolean: "bool",
			dateTime: "datetime",
			date: "date",
			time: "time",
		};

		return {
			name: primitiveMap[fhirType] || "Any",
			isPrimitive: true,
			nullable: false,
		};
	}

	mapReference(_targets: TypeSchemaIdentifier[]): LanguageType {
		return {
			name: "Reference",
			isPrimitive: false,
			importPath: ".reference",
			nullable: false,
		};
	}

	mapArray(elementType: LanguageType): LanguageType {
		return {
			name: `List[${elementType.name}]`,
			isPrimitive: false,
			importPath: "typing",
			isArray: true,
			nullable: false,
		};
	}

	mapOptional(type: LanguageType, required: boolean): LanguageType {
		if (required) return type;

		return {
			...type,
			name: `Optional[${type.name}]`,
			nullable: true,
		};
	}

	mapEnum(values: string[], name?: string): LanguageType {
		return {
			name: name ? this.formatTypeName(name) : "Literal",
			isPrimitive: false,
			nullable: false,
		};
	}

	formatTypeName(name: string): string {
		return this.applyNamingConvention(name);
	}

	formatFieldName(name: string): string {
		// Convert camelCase to snake_case
		return name
			.replace(/([A-Z])/g, "_$1")
			.toLowerCase()
			.replace(/^_/, "");
	}

	formatFileName(name: string): string {
		return this.formatFieldName(name);
	}
}
