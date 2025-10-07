/**
 * TypeSchema Parser
 *
 * Parser for reading and manipulating TypeSchema documents from various formats.
 * Supports both NDJSON and JSON formats with automatic format detection.
 */

import { readFile } from "node:fs/promises";
import type { Identifier, TypeSchema, TypeschemaParserOptions } from "@typeschema/types";

/**
 * TypeSchema Parser class
 *
 * Provides functionality to read, parse, and manipulate TypeSchema documents
 * from files or strings in various formats.
 */
export class TypeSchemaParser {
    private options: Required<TypeschemaParserOptions>;

    constructor(options: TypeschemaParserOptions = {}) {
        this.options = {
            format: "auto",
            validate: true,
            strict: false,
            ...options,
        };
    }

    /**
     * Parse TypeSchema from file
     */
    async parseFromFile(filePath: string): Promise<TypeSchema[]> {
        const content = await readFile(filePath, "utf-8");
        const format = this.options.format === "auto" ? this.detectFormat(content, filePath) : this.options.format;

        return this.parseFromString(content, format);
    }

    /**
     * Parse TypeSchema from string content
     */
    async parseFromString(content: string, format?: "ndjson" | "json"): Promise<TypeSchema[]> {
        const actualFormat = format || this.detectFormat(content);

        let schemas: TypeSchema[];

        if (actualFormat === "ndjson") {
            schemas = this.parseNDJSON(content);
        } else {
            schemas = this.parseJSON(content);
        }

        if (this.options.validate) {
            this.validateSchemas(schemas);
        }

        return schemas;
    }

    /**
     * Parse multiple TypeSchema files
     */
    async parseFromFiles(filePaths: string[]): Promise<TypeSchema[]> {
        const allSchemas: TypeSchema[] = [];

        for (const filePath of filePaths) {
            const schemas = await this.parseFromFile(filePath);
            allSchemas.push(...schemas);
        }

        return allSchemas;
    }

    /**
     * Parse a single TypeSchema object
     */
    parseSchema(schemaData: any): TypeSchema {
        // Basic validation of required fields
        if (!schemaData.identifier) {
            throw new Error("TypeSchema must have an identifier");
        }

        if (!this.isValidIdentifier(schemaData.identifier)) {
            throw new Error("TypeSchema identifier is invalid");
        }

        // Return the schema (assuming it's already in correct format)
        // Additional validation would be performed by the validator
        return schemaData as TypeSchema;
    }

    /**
     * Find schemas by identifier
     */
    findByIdentifier(schemas: TypeSchema[], identifier: Partial<Identifier>): TypeSchema[] {
        return schemas.filter((schema) => this.matchesIdentifier(schema.identifier, identifier));
    }

    /**
     * Find schema by URL
     */
    findByUrl(schemas: TypeSchema[], url: string): TypeSchema | undefined {
        return schemas.find((schema) => schema.identifier.url === url);
    }

    /**
     * Find schemas by kind
     */
    findByKind(schemas: TypeSchema[], kind: Identifier["kind"]): TypeSchema[] {
        return schemas.filter((schema) => schema.identifier.kind === kind);
    }

    /**
     * Find schemas by package
     */
    findByPackage(schemas: TypeSchema[], packageName: string): TypeSchema[] {
        return schemas.filter((schema) => schema.identifier.package === packageName);
    }

    /**
     * Get all dependencies from a schema
     */
    // getDependencies(schema: TypeSchema): Identifier[] {
    //   const dependencies: Identifier[] = [];

    //   // Add base dependency
    //   if ("base" in schema && schema.base) {
    //     dependencies.push(schema.base);
    //   }

    //   // Add explicit dependencies
    //   if ("dependencies" in schema && schema.dependencies) {
    //     dependencies.push(...schema.dependencies);
    //   }

    //   // Add field type dependencies
    //   if ("fields" in schema && schema.fields) {
    //     for (const field of Object.values(schema.fields)) {
    //       if ("type" in field && field.type) {
    //         dependencies.push(field.type);
    //       }
    //       if ("binding" in field && field.binding) {
    //         dependencies.push(field.binding);
    //       }
    //       if ("reference" in field && field.reference) {
    //         dependencies.push(...field.reference);
    //       }
    //     }
    //   }

    //   if ("nested" in schema && schema.nested) {
    //     for (const nested of schema.nested) {
    //       dependencies.push(nested.identifier);
    //       dependencies.push(nested.base);

    //       for (const field of Object.values(nested.fields)) {
    //         if ("type" in field && field.type) {
    //           dependencies.push(field.type);
    //         }
    //         if ("binding" in field && field.binding) {
    //           dependencies.push(field.binding);
    //         }
    //         if ("reference" in field && field.reference) {
    //           dependencies.push(...field.reference);
    //         }
    //       }
    //     }
    //   }

    //   // Add binding dependencies
    //   if ("valueset" in schema) {
    //     const bindingSchema = schema as any;
    //     dependencies.push(bindingSchema.valueset);
    //     if (bindingSchema.type) {
    //       dependencies.push(bindingSchema.type);
    //     }
    //   }

    //   // Remove duplicates
    //   return this.deduplicateDependencies(dependencies);
    // }

    /**
     * Resolve schema dependencies
     */
    // resolveDependencies(
    //   schemas: TypeSchema[],
    //   targetSchema: TypeSchema,
    // ): TypeSchema[] {
    //   const dependencies = this.getDependencies(targetSchema);
    //   const resolved: TypeSchema[] = [];

    //   for (const dep of dependencies) {
    //     const depSchema = this.findByUrl(schemas, dep.url);
    //     if (depSchema) {
    //       resolved.push(depSchema);
    //     }
    //   }

    //   return resolved;
    // }

    /**
     * Detect format from content or filename
     */
    private detectFormat(content: string, filename?: string): "ndjson" | "json" {
        // Check file extension first
        if (filename) {
            if (filename.endsWith(".ndjson")) return "ndjson";
            if (filename.endsWith(".json")) return "json";
        }

        // Check content format
        const trimmed = content.trim();

        // NDJSON typically has multiple lines with JSON objects
        if (trimmed.includes("\n")) {
            const lines = trimmed.split("\n").filter((line) => line.trim());
            if (lines.length > 1) {
                try {
                    if (lines[0]) {
                        JSON.parse(lines[0]);
                    }
                    return "ndjson";
                } catch {
                    // Fall through to JSON detection
                }
            }
        }

        // Default to JSON for single objects or arrays
        return "json";
    }

    /**
     * Parse NDJSON format
     */
    private parseNDJSON(content: string): TypeSchema[] {
        const schemas: TypeSchema[] = [];
        const lines = content.split("\n").filter((line) => line.trim());

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                schemas.push(this.parseSchema(parsed));
            } catch (error) {
                if (this.options.strict) {
                    throw new Error(`Failed to parse NDJSON line: ${error}`);
                }
                // Skip invalid lines in non-strict mode
            }
        }

        return schemas;
    }

    /**
     * Parse JSON format
     */
    private parseJSON(content: string): TypeSchema[] {
        try {
            const parsed = JSON.parse(content);

            if (Array.isArray(parsed)) {
                return parsed.map((item) => this.parseSchema(item));
            } else {
                return [this.parseSchema(parsed)];
            }
        } catch (error) {
            throw new Error(`Failed to parse JSON: ${error}`);
        }
    }

    /**
     * Validate schemas
     */
    private validateSchemas(schemas: TypeSchema[]): void {
        for (const schema of schemas) {
            if (!schema.identifier) {
                throw new Error("Schema missing identifier");
            }

            if (!this.isValidIdentifier(schema.identifier)) {
                throw new Error(`Invalid identifier in schema: ${JSON.stringify(schema.identifier)}`);
            }
        }
    }

    /**
     * Validate identifier structure
     */
    private isValidIdentifier(identifier: any): identifier is Identifier {
        return (
            typeof identifier === "object" &&
            identifier !== null &&
            typeof identifier.kind === "string" &&
            typeof identifier.package === "string" &&
            typeof identifier.version === "string" &&
            typeof identifier.name === "string" &&
            typeof identifier.url === "string"
        );
    }

    /**
     * Check if identifier matches criteria
     */
    private matchesIdentifier(identifier: Identifier, criteria: Partial<Identifier>): boolean {
        return (
            (!criteria.kind || identifier.kind === criteria.kind) &&
            (!criteria.package || identifier.package === criteria.package) &&
            (!criteria.version || identifier.version === criteria.version) &&
            (!criteria.name || identifier.name === criteria.name) &&
            (!criteria.url || identifier.url === criteria.url)
        );
    }
}
