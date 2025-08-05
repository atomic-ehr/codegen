/**
 * TypeScript Generator
 * 
 * Generates TypeScript interfaces from TypeSchema format
 */

import { BaseGenerator, GeneratorOptions } from './base';
import { SchemaLoader, LoadedSchemas } from './loader';
import {
  TypeSchema,
  TypeSchemaField,
  TypeSchemaIdentifier,
  TypeSchemaNestedType,
  TypeSchemaBinding,
  TypeSchemaValueSet
} from '../typeschema';
import {
  toTypeScriptIdentifier,
  toPropertyName,
  getReferenceType,
  isChoiceField,
  getChoiceBaseName
} from '../utils/naming';
import {
  generateJSDoc,
  generateUnionType,
  cleanupCode
} from '../utils/code';

export interface TypeScriptGeneratorOptions extends GeneratorOptions {
  packagePath?: string;
  baseTypesModule?: string;
}

export class TypeScriptGenerator extends BaseGenerator {
  private schemas: LoadedSchemas | null = null;
  private loader: SchemaLoader;
  private generatedTypes = new Set<string>();
  private typeMapping = new Map<string, string>([
    ['boolean', 'boolean'],
    ['integer', 'number'],
    ['string', 'string'],
    ['decimal', 'number'],
    ['uri', 'string'],
    ['url', 'string'],
    ['canonical', 'string'],
    ['uuid', 'string'],
    ['id', 'string'],
    ['oid', 'string'],
    ['unsignedInt', 'number'],
    ['positiveInt', 'number'],
    ['markdown', 'string'],
    ['time', 'string'],
    ['date', 'string'],
    ['dateTime', 'string'],
    ['instant', 'string'],
    ['base64Binary', 'string'],
    ['code', 'string'],
    ['xhtml', 'string']
  ]);

  constructor(options: TypeScriptGeneratorOptions) {
    super(options);
    this.loader = new SchemaLoader({
      packagePath: options.packagePath,
      verbose: options.verbose
    });
  }

  async generate(): Promise<void> {
    // Load schemas
    this.log('Loading FHIR schemas...');
    this.schemas = await this.loader.load();
    
    // Generate primitive types
    this.log('Generating primitive types...');
    await this.generatePrimitiveTypes();
    
    // Generate complex types
    this.log('Generating complex types...');
    await this.generateComplexTypes();
    
    // Generate resources
    this.log('Generating resources...');
    await this.generateResources();
    
    // Generate index file
    this.log('Generating index file...');
    await this.generateIndexFile();
    
    // Write all files
    await this.writeFiles();
    
    // Clean up resources
    await this.loader.cleanup();
  }

  private async generatePrimitiveTypes(): Promise<void> {
    if (!this.schemas) return;
    
    this.file('types/primitives.ts');
    
    this.multiLineComment('FHIR Primitive Types');
    this.blank();
    
    for (const primitive of this.schemas.primitiveTypes) {
      this.generateTypeAlias(primitive);
      this.blank();
    }
  }

  private async generateComplexTypes(): Promise<void> {
    if (!this.schemas) return;
    
    this.file('types/complex.ts');
    
    this.line("import * as primitives from './primitives';");
    this.blank();
    
    this.multiLineComment('FHIR Complex Types');
    this.blank();
    
    // Sort by dependencies
    const sorted = this.topologicalSort(this.schemas.complexTypes);
    
    for (const type of sorted) {
      this.generateInterface(type);
      this.blank();
    }
  }

  private async generateResources(): Promise<void> {
    if (!this.schemas) return;
    
    // Generate individual resource files
    for (const resource of this.schemas.resources) {
      this.generateResourceFile(resource);
    }
  }

  private generateResourceFile(resource: TypeSchema): void {
    const fileName = `resources/${resource.identifier.name}.ts`;
    this.file(fileName);
    
    // Imports
    this.line("import * as primitives from '../types/primitives';");
    this.line("import * as complex from '../types/complex';");
    
    // Add specific imports for dependencies
    const deps = this.getResourceDependencies(resource);
    if (deps.length > 0) {
      this.blank();
      for (const dep of deps) {
        if (dep !== resource.identifier.name) {
          this.line(`import { ${dep} } from './${dep}';`);
        }
      }
    }
    
    this.blank();
    
    // Generate main interface
    this.generateInterface(resource);
    
    // Generate nested types
    if (resource.nested) {
      this.blank();
      for (const nested of resource.nested) {
        this.generateNestedInterface(nested);
        this.blank();
      }
    }
  }

  private generateInterface(schema: TypeSchema): void {
    const name = this.getTypeName(schema.identifier, schema.identifier.kind);
    const base = schema.base ? this.getTypeName(schema.base, schema.identifier.kind) : null;
    
    this.multiLineComment(schema.description || `${name} Type`);
    
    const header = base 
      ? `export interface ${name} extends ${base}`
      : `export interface ${name}`;
    
    this.curlyBlock(header, () => {
      if (schema.fields) {
        for (const [fieldName, field] of Object.entries(schema.fields)) {
          this.generateField(fieldName, field, schema.identifier.kind);
        }
      }
    });
    
    this.generatedTypes.add(name);
  }

  private generateNestedInterface(nested: TypeSchemaNestedType): void {
    const name = this.getTypeName(nested.identifier, 'nested');
    const base = nested.base ? this.getTypeName(nested.base, 'resource') : 'complex.BackboneElement';
    
    this.curlyBlock(`export interface ${name} extends ${base}`, () => {
      for (const [fieldName, field] of Object.entries(nested.fields)) {
        this.generateField(fieldName, field, 'resource');
      }
    });
  }

  private generateField(name: string, field: TypeSchemaField, currentContext?: string): void {
    if (field.excluded) return;
    
    const fieldName = field.required ? name : `${name}?`;
    const fieldType = this.getFieldType(field, currentContext);
    
    this.line(`${fieldName}: ${fieldType};`);
  }

  private getFieldType(field: TypeSchemaField, currentContext?: string): string {
    let baseType = 'any';
    
    if (field.type) {
      baseType = this.getTypeName(field.type, currentContext);
    } else if (field.reference) {
      // Reference field
      const refTypes = field.reference.map(ref => `Reference<${this.getTypeName(ref, currentContext)}>`).join(' | ');
      baseType = refTypes;
    } else if (field.choices && field.choices.length > 0) {
      // Choice type - union of possible types
      const choiceTypes = field.choices.map(choice => {
        // Assume choice is a field name pattern like "value[x]"
        return 'any'; // Simplified for now
      });
      baseType = choiceTypes.join(' | ');
    }
    
    // Handle arrays
    if (field.array) {
      return `${baseType}[]`;
    }
    
    return baseType;
  }

  private getTypeName(identifier: TypeSchemaIdentifier, currentContext?: string): string {
    const name = identifier.name;
    
    // Check if it's a primitive type
    if (this.typeMapping.has(name)) {
      return this.typeMapping.get(name)!;
    }
    
    // Add namespace prefix based on kind and context
    switch (identifier.kind) {
      case 'primitive-type':
        return `primitives.${name}`;
      case 'complex-type':
        // If we're already in complex type context, don't add prefix
        return currentContext === 'complex-type' ? name : `complex.${name}`;
      case 'resource':
        return name;
      default:
        return name;
    }
  }

  private generateTypeAlias(primitive: TypeSchema): void {
    const name = primitive.identifier.name;
    const tsType = this.typeMapping.get(name) || 'string';
    
    this.multiLineComment(primitive.description || `${name} type`);
    this.line(`export type ${name} = ${tsType};`);
  }

  private async generateIndexFile(): Promise<void> {
    if (!this.schemas) return;
    
    this.file('index.ts');
    
    this.multiLineComment('FHIR TypeScript Type Definitions\nAuto-generated from FHIR schemas');
    this.blank();
    
    // Export primitives and complex types
    this.line("export * as primitives from './types/primitives';");
    this.line("export * as complex from './types/complex';");
    this.blank();
    
    // Export all resources
    this.comment('Resource exports');
    for (const resource of this.schemas.resources) {
      const name = resource.identifier.name;
      this.line(`export { ${name} } from './resources/${name}';`);
    }
    this.blank();
    
    // Generate ResourceTypeMap
    this.comment('Resource type map for runtime type checking');
    this.curlyBlock('export const ResourceTypeMap = {', () => {
      for (const resource of this.schemas.resources) {
        const name = resource.identifier.name;
        this.line(`'${name}': true,`);
      }
    });
    this.line(' as const;');
    this.blank();
    
    // Generate ResourceType union
    this.line('export type ResourceType = keyof typeof ResourceTypeMap;');
    this.blank();
    
    // Generate AnyResource union
    const resourceImports = this.schemas.resources
      .map(r => r.identifier.name)
      .join(' | ');
    this.line(`export type AnyResource = ${resourceImports};`);
  }

  private topologicalSort(schemas: TypeSchema[]): TypeSchema[] {
    const sorted: TypeSchema[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    
    const schemaMap = new Map<string, TypeSchema>();
    for (const schema of schemas) {
      schemaMap.set(schema.identifier.name, schema);
    }
    
    const visit = (schema: TypeSchema) => {
      const name = schema.identifier.name;
      
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        // Circular dependency - just skip
        return;
      }
      
      visiting.add(name);
      
      // Visit dependencies first
      for (const dep of schema.dependencies) {
        const depSchema = schemaMap.get(dep.name);
        if (depSchema) {
          visit(depSchema);
        }
      }
      
      visiting.delete(name);
      visited.add(name);
      sorted.push(schema);
    };
    
    for (const schema of schemas) {
      visit(schema);
    }
    
    return sorted;
  }

  private getResourceDependencies(resource: TypeSchema): string[] {
    const deps = new Set<string>();
    
    // Check field references
    if (resource.fields) {
      for (const field of Object.values(resource.fields)) {
        if (field.reference) {
          for (const ref of field.reference) {
            if (ref.kind === 'resource') {
              deps.add(ref.name);
            }
          }
        }
      }
    }
    
    return Array.from(deps);
  }
}