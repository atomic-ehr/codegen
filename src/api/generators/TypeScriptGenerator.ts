/**
 * Modern TypeScript Generator built on BaseGenerator
 * 
 * This is the new, clean implementation that replaces the monolithic typescript.ts generator.
 * Built using the BaseGenerator architecture with TypeMapper, TemplateEngine, and FileManager.
 */

import type { TypeSchema, TypeSchemaIdentifier } from '../../typeschema';
import { BaseGenerator } from './base/BaseGenerator';
import { TypeScriptTypeMapper, type TypeScriptTypeMapperOptions } from './base/TypeScriptTypeMapper';
import { HandlebarsTemplateEngine, type HandlebarsTemplateEngineOptions } from './base/HandlebarsTemplateEngine';
import { 
  type BaseGeneratorOptions, 
  type GeneratedFile,
  type TemplateContext 
} from './base/types';
import { toPascalCase, toCamelCase } from '../../utils';

/**
 * TypeScript-specific generator options
 */
export interface TypeScriptGeneratorOptions extends BaseGeneratorOptions {
  /** Module format for imports/exports */
  moduleFormat?: 'esm' | 'cjs';
  
  /** Whether to generate index files */
  generateIndex?: boolean;
  
  /** Include JSDoc documentation */
  includeDocuments?: boolean;
  
  /** Naming convention for types */
  namingConvention?: 'PascalCase' | 'camelCase';
  
  /** Include FHIR extensions */
  includeExtensions?: boolean;
  
  /** Include FHIR profiles */
  includeProfiles?: boolean;
  
  /** Type mapper options */
  typeMapperOptions?: TypeScriptTypeMapperOptions;
  
  /** Template engine options */
  templateOptions?: Partial<HandlebarsTemplateEngineOptions>;
}

/**
 * Result of generating a single TypeScript file
 */
export interface GeneratedTypeScript {
  content: string;
  imports: Map<string, string>;
  exports: string[];
  filename: string;
}

/**
 * Modern TypeScript Generator
 * 
 * Generates clean, type-safe TypeScript interfaces from FHIR TypeSchema documents.
 * Uses the new BaseGenerator architecture for maintainability and extensibility.
 */
export class TypeScriptGenerator extends BaseGenerator<TypeScriptGeneratorOptions, GeneratedFile[]> {
  // State tracking for complex generation
  private readonly enumTypes = new Map<string, { values: string[]; description?: string }>();
  private readonly profilesByPackage = new Map<string, Array<{ filename: string; interfaceName: string }>>();

  constructor(options: TypeScriptGeneratorOptions) {
    super(options);
  }
  
  // Helper to access merged options as TypeScript options
  private get tsOptions(): Required<TypeScriptGeneratorOptions> {
    return this.options as Required<TypeScriptGeneratorOptions>;
  }

  // ==========================================
  // BaseGenerator Implementation
  // ==========================================

  protected getLanguageName(): string {
    return 'TypeScript';
  }

  protected getFileExtension(): string {
    return '.ts';
  }

  protected createTypeMapper() {
    const options = this.options as TypeScriptGeneratorOptions;
    return new TypeScriptTypeMapper({
      namingConvention: (options.namingConvention ?? 'PascalCase') === 'PascalCase' ? 'PascalCase' : 'camelCase',
      moduleFormat: options.moduleFormat ?? 'esm',
      preferUndefined: true,
      ...options.typeMapperOptions
    });
  }

  protected createTemplateEngine() {
    const options = this.options as TypeScriptGeneratorOptions;
    const engine = new HandlebarsTemplateEngine({
      logger: this.logger,
      templateDirectory: './templates/typescript',
      autoLoadTemplates: false, // We'll load manually to ensure they're ready
      ...options.templateOptions
    });
    
    // Load templates synchronously during initialization
    engine.loadTemplatesFromDirectory('./templates/typescript').catch(error => {
      this.logger.error('Failed to load TypeScript templates:', error);
    });
    
    return engine;
  }

  protected async generateSchemaContent(schema: TypeSchema, context: TemplateContext): Promise<string> {
    // Skip unsupported schema types
    if (this.shouldSkipSchema(schema)) {
      return "";
    }

    // Ensure templates are loaded before using them
    try {
      await this.templateEngine.loadTemplatesFromDirectory("./templates/typescript");
    } catch (error) {
      // Templates might already be loaded, which is fine
      this.logger.debug("Templates loading result:", error);
    }

    // Use simple template context for now
    const templateContext: TemplateContext = {
      ...context,
      schema,
      includeDocuments: this.tsOptions.includeDocuments ?? true,
      imports: new Map(),
      exports: new Set([this.typeMapper.formatTypeName(schema.identifier.name)])
    };

    // Determine template to use based on schema type
    const templateName = this.getTemplateForSchema(schema);
    
    // Render the template
    return await this.templateEngine.render(templateName, templateContext);
  }  // ==========================================
  // Abstract Method Implementations
  // ==========================================

  protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[] {
    return schemas.filter(schema => !this.shouldSkipSchema(schema));
  }

  protected async validateContent(content: string, context: TemplateContext): Promise<void> {
    // Basic TypeScript validation - could be enhanced with actual TS compiler
    const hasValidExport = /export\s+(interface|class|type|enum)\s+\w+/.test(content);
    const hasValidSyntax = content.includes('{') && content.includes('}');
    
    if (!hasValidExport) {
      throw new Error(`Generated content for ${context.schema.identifier.name} does not contain valid export statements`);
    }
    
    if (!hasValidSyntax) {
      throw new Error(`Generated content for ${context.schema.identifier.name} has invalid syntax (missing braces)`);
    }
  }

  /**
   * Transform a single schema into TypeScript
   */
  async transformSchema(schema: TypeSchema): Promise<GeneratedTypeScript | undefined> {
    if (this.shouldSkipSchema(schema)) {
      return undefined;
    }

    // Create template context
    const context: TemplateContext = {
      schema,
      typeMapper: this.typeMapper,
      filename: this.getFilenameForSchema(schema),
      language: 'TypeScript',
      timestamp: new Date().toISOString()
    };

    // Generate content using template engine
    const content = await this.generateSchemaContent(schema, context);
    
    if (!content.trim()) {
      return undefined;
    }

    // Extract imports and exports from generated content
    const imports = this.extractImportsFromContent(content, schema);
    const exports = this.extractExportsFromContent(content, schema);
    const filename = this.getFilenameForSchema(schema);

    return {
      content,
      imports,
      exports: Array.from(exports),
      filename
    };
  }

  // ==========================================
  // Schema Processing Logic
  // ==========================================

  private shouldSkipSchema(schema: TypeSchema): boolean {
    // Skip value sets, bindings, and primitive types
    if (schema.identifier.kind === 'value-set' || 
        schema.identifier.kind === 'binding' || 
        schema.identifier.kind === 'primitive-type') {
      return true;
    }

    // Skip profiles if not included
    if (schema.identifier.kind === 'profile' && !this.tsOptions.includeProfiles) {
      return true;
    }

    // Skip extensions if not included  
    if (schema.identifier.kind === 'extension' && !this.tsOptions.includeExtensions) {
      return true;
    }

    return false;
  }

  private getTemplateForSchema(schema: TypeSchema): string {
    // For now, just use the basic interface template to avoid complexity
    return 'interface';
  }

  private filterSchemas(schemas: TypeSchema[]): TypeSchema[] {
    return schemas.filter(schema => !this.shouldSkipSchema(schema));
  }

  private getFilenameForSchema(schema: TypeSchema): string {
    const baseName = this.typeMapper.formatFileName(schema.identifier.name);
    return `${baseName}${this.getFileExtension()}`;
  }

  // ==========================================
  // Template Context Building
  // ==========================================

  private async buildTemplateContext(schema: TypeSchema, baseContext: TemplateContext): Promise<TemplateContext> {
    // Process schema fields into template-friendly format
    const fields = await this.processSchemaFields(schema);
    
    // Calculate imports needed for this schema
    const imports = this.calculateImportsForSchema(schema);
    
    // Determine exports
    const exports = new Set([this.typeMapper.formatTypeName(schema.identifier.name)]);

    return {
      ...baseContext,
      schema: {
        ...schema,
        formattedName: this.typeMapper.formatTypeName(schema.identifier.name),
        description: this.formatDescription(schema.description),
        fields
      },
      imports,
      exports,
      includeDocuments: this.tsOptions.includeDocuments,
      moduleFormat: this.tsOptions.moduleFormat,
      namingConvention: this.tsOptions.namingConvention
    };
  }

  private async processSchemaFields(schema: TypeSchema): Promise<any> {
    if (!('elements' in schema) || !schema.elements) {
      return {};
    }

    const processedFields: Record<string, any> = {};
    
    for (const [fieldName, fieldDef] of Object.entries(schema.elements)) {
      const processedField = await this.processField(fieldName, fieldDef, schema);
      if (processedField) {
        processedFields[fieldName] = processedField;
      }
    }

    return processedFields;
  }

  private async processField(fieldName: string, fieldDef: any, schema: TypeSchema): Promise<any> {
    // Map field type using TypeMapper
    const fieldType = this.typeMapper.mapType(fieldDef);
    
    return {
      name: this.typeMapper.formatFieldName(fieldName),
      type: fieldType.name,
      required: fieldDef.min >= 1,
      isArray: fieldDef.max !== 1,
      description: this.formatDescription(fieldDef.description),
      originalName: fieldName,
      languageType: fieldType
    };
  }

  // ==========================================
  // Import/Export Management
  // ==========================================

  private calculateImportsForSchema(schema: TypeSchema): Map<string, string> {
    const imports = new Map<string, string>();
    
    if (!('elements' in schema) || !schema.elements) {
      return imports;
    }

    // Analyze fields to determine needed imports
    for (const [fieldName, fieldDef] of Object.entries(schema.elements)) {
      const fieldType = this.typeMapper.mapType(fieldDef);
      
      if (!fieldType.isPrimitive && fieldType.importPath) {
        imports.set(fieldType.name, fieldType.importPath);
      }
    }

    return imports;
  }

  private extractImportsFromContent(content: string, schema: TypeSchema): Map<string, string> {
    // Parse existing import statements from content
    const imports = new Map<string, string>();
    const importRegex = /import\s+(?:type\s+)?{\s*([^}]+)\s*}\s+from\s+['"]([^'"]+)['"];?/g;
    
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const symbols = match[1].split(',').map(s => s.trim());
      const path = match[2];
      
      for (const symbol of symbols) {
        imports.set(symbol, path);
      }
    }

    return imports;
  }

  private extractExportsFromContent(content: string, schema: TypeSchema): Set<string> {
    const exports = new Set<string>();
    
    // Extract export statements
    const exportRegex = /export\s+(?:interface|class|enum|type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
    
    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.add(match[1]);
    }

    // Always include the main interface name
    exports.add(this.typeMapper.formatTypeName(schema.identifier.name));

    return exports;
  }

  // ==========================================
  // Index File Generation
  // ==========================================

  private async generateIndexFiles(results: GeneratedFile[]): Promise<GeneratedFile[]> {
    const indexFiles: GeneratedFile[] = [];

    // Generate main index file
    const mainIndex = await this.generateMainIndexFile(results);
    indexFiles.push(mainIndex);

    // Generate sub-index files if profiles are included
    if (this.tsOptions.includeProfiles && this.profilesByPackage.size > 0) {
      const profileIndexes = await this.generateProfileIndexFiles();
      indexFiles.push(...profileIndexes);
    }

    return indexFiles;
  }

  private async generateMainIndexFile(results: GeneratedFile[]): Promise<GeneratedFile> {
    // Group exports for better organization
    const exportGroups = this.groupExportsByCategory(results);
    
    const context: TemplateContext = {
      schema: {} as TypeSchema,
      typeMapper: this.typeMapper,
      filename: 'index.ts',
      language: 'TypeScript',
      timestamp: new Date().toISOString(),
      exports: new Set(),
      imports: new Map(),
      header: '// Auto-generated TypeScript FHIR types\n// Generated by @atomic-ehr/codegen',
      groupedExports: exportGroups,
      moduleFormat: this.tsOptions.moduleFormat
    };

    const content = await this.templateEngine.render('index', context);
    
    return {
      path: this.fileManager.getRelativeImportPath('', 'index.ts'),
      filename: 'index.ts',
      content,
      exports: [],
      size: Buffer.byteLength(content, 'utf-8'),
      timestamp: new Date()
    };
  }

  private async generateProfileIndexFiles(): Promise<GeneratedFile[]> {
    const indexFiles: GeneratedFile[] = [];
    
    for (const [packageName, profiles] of this.profilesByPackage) {
      const sanitizedPackage = this.sanitizePackageName(packageName);
      
      const context: TemplateContext = {
        schema: {} as TypeSchema,
        typeMapper: this.typeMapper,
        filename: `profiles/${sanitizedPackage}/index.ts`,
        language: 'TypeScript',
        timestamp: new Date().toISOString(),
        exports: new Set(profiles.map(p => p.interfaceName)),
        imports: new Map(),
        header: `// ${packageName} FHIR Profiles`,
        packageName,
        profiles
      };

      const content = await this.templateEngine.render('profile-index', context);
      
      indexFiles.push({
        path: context.filename,
        filename: `profiles/${sanitizedPackage}/index.ts`,
        content,
        exports: Array.from(context.exports!),
        size: Buffer.byteLength(content, 'utf-8'),
        timestamp: new Date()
      });
    }

    return indexFiles;
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  private hasEnumFields(schema: TypeSchema): boolean {
    if (!('elements' in schema) || !schema.elements) {
      return false;
    }

    return Object.values(schema.elements).some(field => 
      field.binding && field.binding.strength === 'required'
    );
  }

  private formatDescription(description?: string): string {
    if (!description) return '';
    
    // Clean up description text for JSDoc
    return description
      .replace(/\s+/g, ' ')
      .replace(/^\s+|\s+$/g, '')
      .replace(/"/g, '\\"');
  }

  private groupExportsByCategory(results: GeneratedFile[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {
      'Resources': [],
      'Complex Types': [],
      'Profiles': [],
      'Extensions': []
    };

    for (const result of results) {
      if (result.filename.includes('profile')) {
        groups['Profiles'].push(...result.exports);
      } else if (result.filename.includes('extension')) {
        groups['Extensions'].push(...result.exports);
      } else if (this.isResourceType(result)) {
        groups['Resources'].push(...result.exports);
      } else {
        groups['Complex Types'].push(...result.exports);
      }
    }

    // Remove empty groups
    return Object.fromEntries(
      Object.entries(groups).filter(([, exports]) => exports.length > 0)
    );
  }

  private isResourceType(result: GeneratedFile): boolean {
    // Heuristic to determine if this is a FHIR resource
    return result.exports.some(exp => 
      exp.endsWith('Resource') || 
      ['Patient', 'Observation', 'Practitioner'].includes(exp)
    );
  }

  private sanitizePackageName(packageName: string): string {
    return packageName.replace(/[^a-zA-Z0-9-_.]/g, '-');
  }
}