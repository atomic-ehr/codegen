/**
 * TypeScript-specific type mapper implementation
 */

import type { TypeSchemaIdentifier } from "../../../typeschema/type-schema.types";
import {
  type LanguageType,
  TypeMapper,
  type TypeMapperOptions,
} from "./TypeMapper.js";

/**
 * TypeScript-specific options
 */
export interface TypeScriptTypeMapperOptions extends TypeMapperOptions {
  /** Whether to use 'unknown' or 'any' for unmapped types */
  preferUnknown?: boolean;

  /** Whether to generate branded types for primitives */
  useBrandedTypes?: boolean;

  /** Whether to use 'undefined' or 'null' for optional types */
  preferUndefined?: boolean;

  /** Module format for imports */
  moduleFormat?: "esm" | "commonjs";
}

/**
 * TypeScript type mapper
 */
export class TypeScriptTypeMapper extends TypeMapper {
  private readonly tsOptions: Required<TypeScriptTypeMapperOptions>;

  constructor(options: TypeScriptTypeMapperOptions = {}) {
    super(options);

    this.tsOptions = {
      ...this.options,
      preferUnknown: true,
      useBrandedTypes: false,
      preferUndefined: true,
      moduleFormat: "esm",
      ...options,
    };
  }

  getLanguageName(): string {
    return "TypeScript";
  }

  mapPrimitive(fhirType: string): LanguageType {
    const customMapping = this.getCustomMapping(fhirType);
    if (customMapping) {
      return {
        name: customMapping,
        isPrimitive: true,
        nullable: false,
      };
    }

    const primitiveMap: Record<string, string> = {
      string: "string",
      integer: "number",
      decimal: "number",
      boolean: "boolean",
      dateTime: "string",
      date: "string",
      time: "string",
      instant: "string",
      uri: "string",
      url: "string",
      canonical: "string",
      oid: "string",
      uuid: "string",
      base64Binary: "string",
      code: "string",
      id: "string",
      markdown: "string",
      unsignedInt: "number",
      positiveInt: "number",

      xhtml: "string",
      json: "unknown",
    };

    const mappedType = primitiveMap[fhirType];

    if (!mappedType) {
      console.warn(`Unknown FHIR primitive type: ${fhirType}`);
      return {
        name: this.tsOptions.preferUnknown ? "unknown" : "any",
        isPrimitive: true,
        nullable: false,
        metadata: { warning: "unmapped_primitive", originalType: fhirType },
      };
    }

    if (this.tsOptions.useBrandedTypes && fhirType !== mappedType) {
      return {
        name: `${mappedType} & { readonly __brand: '${fhirType}' }`,
        isPrimitive: false,
        importPath: "./brands",
        nullable: false,
        metadata: { isBranded: true, originalFhirType: fhirType },
      };
    }

    return {
      name: mappedType,
      isPrimitive: true,
      nullable: false,
    };
  }

  mapReference(targets: TypeSchemaIdentifier[]): LanguageType {
    if (!targets || targets.length === 0) {
      return {
        name: "Reference",
        isPrimitive: false,
        importPath: "./Reference",
        generics: ["unknown"],
        nullable: false,
      };
    }

    if (targets.length === 1) {
      const targetName = targets[0]?.name || "unknown";
      const targetStringLiteral =
        targetName === "unknown" ? "unknown" : `'${targetName}'`;
      return {
        name: "Reference",
        isPrimitive: false,
        importPath: "./Reference",
        generics: [targetStringLiteral],
        nullable: false,
        metadata: {
          referencedType: targetName,
          referencedSchema: targets[0],
        },
      };
    }

    const targetStringLiterals = targets.map((t) => {
      const targetName = t.name || "unknown";
      return targetName === "unknown" ? "unknown" : `'${targetName}'`;
    });
    return {
      name: "Reference",
      isPrimitive: false,
      importPath: "./Reference",
      generics: [targetStringLiterals.join(" | ")],
      nullable: false,
      metadata: {
        referencedTypes: targets.map((t) => t.name || "unknown"),
        referencedSchemas: targets,
      },
    };
  }

  mapArray(elementType: LanguageType): LanguageType {
    if (this.options.preferArraySyntax) {
      return {
        name: `${elementType.name}[]`,
        isPrimitive: elementType.isPrimitive,
        importPath: elementType.importPath,
        isArray: true,
        nullable: false,
        metadata: {
          elementType: elementType,
          arrayStyle: "suffix",
        },
      };
    } else {
      return {
        name: "Array",
        isPrimitive: false,
        generics: [elementType.name],
        isArray: true,
        nullable: false,
        metadata: {
          elementType: elementType,
          arrayStyle: "generic",
        },
      };
    }
  }

  mapOptional(type: LanguageType, required: boolean): LanguageType {
    if (required || !this.shouldBeNullable(required)) {
      return type;
    }

    const nullType = this.tsOptions.preferUndefined ? "undefined" : "null";

    return {
      ...type,
      name: `${type.name} | ${nullType}`,
      nullable: true,
      metadata: {
        ...type.metadata,
        nullabilityType: nullType,
        wasOptional: true,
      },
    };
  }

  mapEnum(values: string[], name?: string): LanguageType {
    const enumName = name ? this.formatTypeName(name) : "CodedValue";

    const unionType = values.map((v) => `'${v}'`).join(" | ");

    return {
      name: unionType,
      isPrimitive: false,
      nullable: false,
      metadata: {
        enumName,
        values,
        isUnionType: true,
      },
    };
  }

  formatTypeName(name: string): string {
    return this.applyNamingConvention(name);
  }

  formatFieldName(name: string): string {
    return toCamelCase(name);
  }

  formatFileName(name: string): string {
    return this.applyNamingConvention(name);
  }

  /**
   * Generate TypeScript interface field
   * @param fieldName Field name
   * @param fieldType Field type
   * @param required Whether field is required
   */
  generateInterfaceField(
    fieldName: string,
    fieldType: LanguageType,
    required: boolean,
  ): string {
    const formattedName = this.formatFieldName(fieldName);
    const optionalMarker = required ? "" : "?";

    return `${formattedName}${optionalMarker}: ${fieldType.name};`;
  }

  /**
   * Generate import statement for a type
   * @param type Language type with import info
   */
  generateImportStatement(type: LanguageType): string | undefined {
    if (!type.importPath || type.isPrimitive) {
      return undefined;
    }

    if (this.tsOptions.moduleFormat === "esm") {
      return `import type { ${type.name} } from '${type.importPath}';`;
    } else {
      return `const { ${type.name} } = require('${type.importPath}');`;
    }
  }

  /**
   * Get all required imports for a set of types
   * @param types Array of language types
   */
  getRequiredImports(types: LanguageType[]): string[] {
    const imports = new Set<string>();

    for (const type of types) {
      const importStatement = this.generateImportStatement(type);
      if (importStatement) {
        imports.add(importStatement);
      }
    }

    return Array.from(imports).sort();
  }
}

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, char) => char?.toUpperCase() || "");
}
