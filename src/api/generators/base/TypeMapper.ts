/**
 * Abstract base class for language-specific type mapping
 *
 * This provides the interface that all language generators must implement
 * to convert FHIR TypeSchema types into their target language types.
 */

import type { TypeSchemaIdentifier } from "../../../typeschema/type-schema.types";

/**
 * Represents a type in the target language
 */
export interface LanguageType {
  /** The type name in the target language */
  name: string;

  /** Whether this is a primitive type (doesn't need imports) */
  isPrimitive: boolean;

  /** Import path if this type needs to be imported */
  importPath?: string;

  /** Generic type parameters if applicable */
  generics?: string[];

  /** Whether this type can be null/undefined */
  nullable?: boolean;

  /** Whether this is an array type */
  isArray?: boolean;

  /** Additional metadata for language-specific features */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for type mapping behavior
 */
export interface TypeMapperOptions {
  /** Whether to generate nullable types (e.g., T | null) */
  generateNullable?: boolean;

  /** Whether to use strict type checking */
  strictTypes?: boolean;

  /** Custom type mappings */
  customMappings?: Record<string, string>;

  /** Whether to generate array types or use generic collections */
  preferArraySyntax?: boolean;

  /** Naming convention strategy */
  namingConvention?: "camelCase" | "PascalCase" | "snake_case" | "kebab-case";
}

/**
 * Abstract type mapper for language-specific type conversion
 */
export abstract class TypeMapper {
  protected readonly options: Required<TypeMapperOptions>;

  constructor(options: TypeMapperOptions = {}) {
    this.options = {
      generateNullable: true,
      strictTypes: true,
      customMappings: {},
      preferArraySyntax: true,
      namingConvention: "PascalCase",
      ...options,
    };
  }

  // ==========================================
  // Abstract Methods - Must be implemented by subclasses
  // ==========================================

  /**
   * Get the target language name (e.g., "TypeScript", "Python")
   */
  abstract getLanguageName(): string;

  /**
   * Map a FHIR primitive type to target language
   * @param fhirType FHIR primitive type (string, integer, boolean, etc.)
   */
  abstract mapPrimitive(fhirType: string): LanguageType;

  /**
   * Map a reference type to target language
   * @param targets Array of possible reference targets
   */
  abstract mapReference(targets: TypeSchemaIdentifier[]): LanguageType;

  /**
   * Map an array type to target language
   * @param elementType The type of array elements
   */
  abstract mapArray(elementType: LanguageType): LanguageType;

  /**
   * Map an optional/nullable type
   * @param type The base type
   * @param required Whether the field is required
   */
  abstract mapOptional(type: LanguageType, required: boolean): LanguageType;

  /**
   * Map an enum/coded type
   * @param values Possible enum values
   * @param name Optional enum name
   */
  abstract mapEnum(values: string[], name?: string): LanguageType;

  /**
   * Format a type name according to language conventions
   * @param name Raw type name
   */
  abstract formatTypeName(name: string): string;

  /**
   * Format a field name according to language conventions
   * @param name Raw field name
   */
  abstract formatFieldName(name: string): string;

  /**
   * Format a file name according to language conventions
   * @param name Raw file name (without extension)
   */
  abstract formatFileName(name: string): string;

  // ==========================================
  // Concrete Methods - Shared functionality
  // ==========================================

  /**
   * Main entry point for type mapping
   * @param schemaType Type from TypeSchema
   */
  mapType(schemaType: any): LanguageType {
    // Handle primitive types
    if (typeof schemaType === "string") {
      return this.mapPrimitive(schemaType);
    }

    // Handle complex types
    if (schemaType && typeof schemaType === "object") {
      const kind = schemaType.kind || schemaType.type;

      switch (kind) {
        case "primitive-type":
          return this.mapPrimitive(schemaType.name);

        case "reference":
          return this.mapReference(schemaType.targets || []);

        case "array": {
          const elementType = this.mapType(schemaType.element);
          return this.mapArray(elementType);
        }

        case "enum":
        case "coded":
          return this.mapEnum(schemaType.values || [], schemaType.name);

        case "complex-type":
        case "resource":
          return this.mapComplexType(schemaType);

        default:
          return this.mapUnknownType(schemaType);
      }
    }

    return this.mapUnknownType(schemaType);
  }

  /**
   * Map a complex type (resource, complex-type)
   * @param schemaType Complex type from schema
   */
  protected mapComplexType(schemaType: any): LanguageType {
    const typeName = this.formatTypeName(schemaType.name || "Unknown");

    return {
      name: typeName,
      isPrimitive: false,
      importPath: this.calculateImportPath(schemaType),
      nullable: !schemaType.required && this.options.generateNullable,
      metadata: {
        kind: schemaType.kind,
        package: schemaType.package,
      },
    };
  }

  /**
   * Handle unknown/unmapped types
   * @param schemaType Unknown type
   */
  protected mapUnknownType(schemaType: any): LanguageType {
    // console.warn(`Unknown type encountered:`, schemaType);

    return {
      name: "unknown",
      isPrimitive: true,
      nullable: true,
      metadata: {
        originalType: schemaType,
        warning: "unmapped_type",
      },
    };
  }

  /**
   * Calculate import path for a type
   * @param schemaType Type to calculate import for
   */
  protected calculateImportPath(schemaType: any): string | undefined {
    if (!schemaType.name) return undefined;

    const fileName = this.formatFileName(schemaType.name);
    return `./${fileName}`;
  }

  /**
   * Apply naming convention to a string
   * @param name Input name
   */
  protected applyNamingConvention(name: string): string {
    switch (this.options.namingConvention) {
      case "camelCase":
        return toCamelCase(name);
      case "PascalCase":
        return toPascalCase(name);
      case "snake_case":
        return toSnakeCase(name);
      case "kebab-case":
        return toKebabCase(name);
      default:
        return name;
    }
  }

  /**
   * Get custom mapping if available
   * @param type Original type name
   */
  protected getCustomMapping(type: string): string | undefined {
    return this.options.customMappings[type];
  }

  /**
   * Check if type should be nullable
   * @param required Whether field is required
   */
  protected shouldBeNullable(required: boolean): boolean {
    return !required && this.options.generateNullable;
  }
}

// ==========================================
// Utility Functions
// ==========================================

function toCamelCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, char) => char?.toUpperCase() || "");
}

function toPascalCase(str: string): string {
  const camelCase = toCamelCase(str);
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
}

function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .replace(/[-\s]+/g, "_")
    .toLowerCase()
    .replace(/^_/, "");
}

function toKebabCase(str: string): string {
  return toSnakeCase(str).replace(/_/g, "-");
}
