/**
 * Modern TypeScript Generator built on BaseGenerator
 * 
 * This is the new, clean implementation that replaces the monolithic typescript.ts generator.
 * Built using the BaseGenerator architecture with TypeMapper, TemplateEngine, and FileManager.
 */

import type { TypeSchema, TypeSchemaIdentifier } from '../../typeschema';
import { BaseGenerator } from './base/BaseGenerator';
import { TypeMapper } from './base/types';
import type { TemplateEngine } from './base/types';
import { TypeScriptTypeMapper, type TypeScriptTypeMapperOptions } from './base/TypeScriptTypeMapper';
import { HandlebarsTemplateEngine, type HandlebarsTemplateEngineOptions } from './base/HandlebarsTemplateEngine';
import { 
  type BaseGeneratorOptions, 
  type GeneratedFile,
  type TemplateContext 
} from './base/types';
import { toPascalCase } from '../../utils';

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
  private readonly resourceTypes = new Set<string>();

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

  protected override createTypeMapper(): TypeMapper {
    const options = this.options as TypeScriptGeneratorOptions;
    return new TypeScriptTypeMapper({
      namingConvention: (options.namingConvention ?? 'PascalCase') === 'PascalCase' ? 'PascalCase' : 'camelCase',
      moduleFormat: options.moduleFormat === 'cjs' ? 'commonjs' : 'esm',
      preferUndefined: true,
      ...options.typeMapperOptions
    }) as unknown as TypeMapper;
  }

  protected override createTemplateEngine(): TemplateEngine {
    const options = this.options as TypeScriptGeneratorOptions;
    const handlebarsEngine = new HandlebarsTemplateEngine({
      logger: this.logger,
      templateDirectory: './templates/typescript',
      autoLoadTemplates: false, // We'll load manually to ensure they're ready
      ...options.templateOptions
    });
    
    // Load templates synchronously during initialization
    handlebarsEngine.loadTemplatesFromDirectory('./templates/typescript').catch(error => {
      this.logger.error('Failed to load TypeScript templates:', error);
    });
    
    return handlebarsEngine as unknown as TemplateEngine;
  }

  protected async generateSchemaContent(schema: TypeSchema, context: TemplateContext): Promise<string> {
    // Skip unsupported schema types
    if (this.shouldSkipSchema(schema)) {
      return "";
    }

    // Collect resource types for Reference generic
    if (schema.identifier.kind === 'resource') {
      this.resourceTypes.add(this.typeMapper.formatTypeName(schema.identifier.name));
    }

    // Update filename for profiles to include proper directory structure
    if (schema.identifier.kind === 'profile') {
      const sanitizedPackage = this.sanitizePackageName(schema.identifier.package || 'unknown');
      const profileFileName = this.typeMapper.formatFileName(schema.identifier.name);
      context.filename = `profiles/${sanitizedPackage}/${profileFileName}`;
      
      // Track profile for index generation
      if (!this.profilesByPackage.has(schema.identifier.package || 'unknown')) {
        this.profilesByPackage.set(schema.identifier.package || 'unknown', []);
      }
      this.profilesByPackage.get(schema.identifier.package || 'unknown')!.push({
        filename: profileFileName,
        interfaceName: this.typeMapper.formatTypeName(schema.identifier.name)
      });
    }

    // Handle Reference type specially
    if (schema.identifier.name === 'Reference') {
      return this.generateReferenceInterface(schema);
    }

    // Generate TypeScript content directly (no templates for simplicity)
    return this.generateTypeScriptInterface(schema);
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
   * Transform multiple schemas into TypeScript
   */
  async transformSchemas(schemas: TypeSchema[]): Promise<GeneratedTypeScript[]> {
    const results: GeneratedTypeScript[] = [];
    
    for (const schema of schemas) {
      const result = await this.transformSchema(schema);
      if (result) {
        results.push(result);
      }
    }
    
    return results;
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
    if (schema.identifier.url?.includes('/extension/') && !this.tsOptions.includeExtensions) {
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
      schema,
      formattedName: this.typeMapper.formatTypeName(schema.identifier.name),
      description: this.formatDescription(schema.description),
      fields,
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
      const symbolsStr = match[1];
      const path = match[2];
      
      if (!symbolsStr || !path) continue;
      
      const symbols = symbolsStr.split(',').map(s => s.trim());
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
      if (match[1]) exports.add(match[1]);
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
        groups['Profiles']!.push(...result.exports || []);
      } else if (result.filename.includes('extension')) {
        groups['Extensions']!.push(...result.exports || []);
      } else if (this.isResourceType(result)) {
        groups['Resources']!.push(...result.exports || []);
      } else {
        groups['Complex Types']!.push(...result.exports || []);
      }
    }

    // Remove empty groups
    return Object.fromEntries(
      Object.entries(groups).filter(([, exports]) => exports.length > 0)
    );
  }

  private isResourceType(result: GeneratedFile): boolean {
    // Heuristic to determine if this is a FHIR resource
    return (result.exports || []).some(exp => 
      exp.endsWith('Resource') || 
      ['Patient', 'Observation', 'Practitioner'].includes(exp)
    );
  }

  private sanitizePackageName(packageName: string): string {
    return packageName.replace(/[^a-zA-Z0-9-_.]/g, '-');
  }

  /**
   * Generate special Reference interface with generics
   */
  private generateReferenceInterface(schema: TypeSchema): string {
    const lines: string[] = [];
    const imports = new Set<string>();

    // Collect import dependencies from fields
    if ('fields' in schema && schema.fields) {
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        if (fieldName !== 'type') { // Skip the 'type' field as it will be handled specially
          const importDeps = this.collectFieldImports(field);
          importDeps.forEach(imp => imports.add(imp));
        }
      }
    }

    // Add import for ResourceType
    lines.push("import type { ResourceType } from './utilities';");

    // Generate other import statements
    if (imports.size > 0) {
      const sortedImports = Array.from(imports).sort();
      for (const importName of sortedImports) {
        lines.push(`import type { ${importName} } from './${importName}';`);
      }
    }
    lines.push(''); // Add blank line after imports

    // Add JSDoc comment
    if (this.tsOptions.includeDocuments && schema.description) {
      lines.push('/**');
      lines.push(` * ${schema.description}`);
      if (schema.identifier.url) {
        lines.push(` * @see ${schema.identifier.url}`);
      }
      if (schema.identifier.package) {
        lines.push(` * @package ${schema.identifier.package}`);
      }
      lines.push(' * @template T - The resource type being referenced');
      lines.push(' */');
    }

    // Generate generic interface declaration
    lines.push('export interface Reference<T extends ResourceType = ResourceType> {');

    // Generate fields with special handling for 'type'
    if ('fields' in schema && schema.fields) {
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        if (fieldName === 'type') {
          // Special handling for the type field to use the generic parameter
          lines.push('  type?: T;');
        } else {
          const fieldLine = this.generateFieldLine(fieldName, field);
          if (fieldLine) {
            lines.push(`  ${fieldLine}`);
          }
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Generate TypeScript interface directly without templates
   */
  private generateTypeScriptInterface(schema: TypeSchema): string {
    const lines: string[] = [];
    const interfaceName = this.typeMapper.formatTypeName(schema.identifier.name);
    const imports = new Set<string>();

    // Collect import dependencies from fields
    if ('fields' in schema && schema.fields) {
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        const importDeps = this.collectFieldImports(field);
        importDeps.forEach(imp => imports.add(imp));
      }
    }

    // Generate import statements
    if (imports.size > 0) {
      const sortedImports = Array.from(imports).sort();
      for (const importName of sortedImports) {
        lines.push(`import type { ${importName} } from './${importName}';`);
      }
      lines.push(''); // Add blank line after imports
    }

    // Add JSDoc comment if enabled
    if (this.tsOptions.includeDocuments && schema.description) {
      lines.push('/**');
      lines.push(` * ${schema.description}`);
      if (schema.identifier.url) {
        lines.push(` * @see ${schema.identifier.url}`);
      }
      if (schema.identifier.package) {
        lines.push(` * @package ${schema.identifier.package}`);
      }
      lines.push(' */');
    }

    // Generate interface declaration
    lines.push(`export interface ${interfaceName} {`);

    // Add resourceType for FHIR resources
    if (schema.identifier.kind === 'resource') {
      lines.push(`  resourceType: '${interfaceName}';`);
    }

    // Generate fields (if any)
    if ('fields' in schema && schema.fields) {
      for (const [fieldName, field] of Object.entries(schema.fields)) {
        const fieldLine = this.generateFieldLine(fieldName, field);
        if (fieldLine) {
          lines.push(`  ${fieldLine}`);
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Collect import dependencies from a field
   */
  private collectFieldImports(field: any): string[] {
    const imports: string[] = [];
    
    if ('type' in field && field.type) {
      const languageType = this.typeMapper.mapType(field.type);
      
      // Only import non-primitive types that are not built-in
      if (!languageType.isPrimitive && languageType.name !== 'any') {
        // Skip basic JavaScript/TypeScript types
        const builtInTypes = ['string', 'number', 'boolean', 'Date', 'object', 'unknown', 'any'];
        if (!builtInTypes.includes(languageType.name)) {
          imports.push(languageType.name);
        }
      }
    }

    return imports;
  }

  /**
   * Extract resource types from reference field constraints
   */
  private extractReferenceTypes(referenceConstraints: any[]): string[] {
    const resourceTypes: string[] = [];
    
    if (!Array.isArray(referenceConstraints)) {
      return resourceTypes;
    }
    
    for (const constraint of referenceConstraints) {
      if (!constraint || typeof constraint !== 'object') {
        continue;
      }
      
      // Handle TypeSchema IdentifierKind objects
      if (constraint.kind === 'resource' && constraint.name) {
        const resourceType = this.typeMapper.formatTypeName(constraint.name);
        if (this.resourceTypes.has(resourceType)) {
          resourceTypes.push(resourceType);
        }
      }
    }
    
    return [...new Set(resourceTypes)]; // Remove duplicates
  }

  /**
   * Extract resource type name from FHIR URL
   */
  private extractResourceTypeFromUrl(url: string): string | null {
    if (!url || typeof url !== 'string') return null;
    
    // Handle FHIR StructureDefinition URLs like:
    // http://hl7.org/fhir/StructureDefinition/Patient -> Patient
    // https://example.org/fhir/StructureDefinition/CustomProfile -> CustomProfile
    const match = url.match(/\/StructureDefinition\/([A-Za-z][A-Za-z0-9]*)/);
    if (match && match[1]) {
      return this.typeMapper.formatTypeName(match[1]);
    }
    
    // Handle direct resource type names
    const directMatch = url.match(/^[A-Za-z][A-Za-z0-9]*$/);
    if (directMatch) {
      return this.typeMapper.formatTypeName(url);
    }
    
    return null;
  }

  /**
   * Generate a single field line
   */
  private generateFieldLine(fieldName: string, field: any): string | null {
    // Handle different field types
    let typeString = 'any';
    let required = false;
    let isArray = false;

    if ('type' in field && field.type) {
      const languageType = this.typeMapper.mapType(field.type);
      typeString = languageType.name;
      
      // Special handling for Reference types with TypeSchema constraints
      if (typeString === 'Reference' && field.reference && Array.isArray(field.reference)) {
        const referenceTypes = this.extractReferenceTypes(field.reference);
        if (referenceTypes.length > 0) {
          const unionType = referenceTypes.map(type => `'${type}'`).join(' | ');
          typeString = `Reference<${unionType}>`;
        }
      }
    }

    if ('required' in field) {
      required = field.required;
    }

    if ('array' in field) {
      isArray = field.array;
    }

    const optional = required ? '' : '?';
    const arrayType = isArray ? '[]' : '';

    return `${fieldName}${optional}: ${typeString}${arrayType};`;
  }

  // ==========================================
  /**
   * Extract exported symbols from TypeScript content
   */
  protected override extractExports(content: string): string[] {
    const exports: string[] = [];
    
    // Match export { name1, name2 } pattern first
    const exportListPattern = /export\s*\{\s*([^}]+)\s*\}/g;
    let match;
    while ((match = exportListPattern.exec(content)) !== null) {
      if (match[1]) {
        const names = match[1].split(',').map(name => name.trim()).filter(Boolean);
        exports.push(...names);
      }
    }
    
    // Match direct export declarations
    const directExportPatterns = [
      /export\s+interface\s+(\w+)/g,      // export interface Name
      /export\s+type\s+(\w+)/g,           // export type Name  
      /export\s+class\s+(\w+)/g,          // export class Name
      /export\s+enum\s+(\w+)/g,           // export enum Name
      /export\s+const\s+(\w+)/g,          // export const name
      /export\s+function\s+(\w+)/g        // export function name
    ];
    
    for (const pattern of directExportPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          exports.push(match[1]);
        }
      }
    }
    
    // Remove duplicates and return
    return [...new Set(exports)];
  }

  // API Compatibility Methods
  // ==========================================

  /**
   * Set output directory for compatibility with API builder
   */
  setOutputDir(directory: string): void {
    this.options.outputDir = directory;
  }

  /**
   * Update generator options for compatibility with API builder
   */
  setOptions(options: Partial<TypeScriptGeneratorOptions>): void {
    // Merge with existing options
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options for compatibility with API builder
   */
  getOptions(): TypeScriptGeneratorOptions {
    return { ...this.options };
  }

  // ==========================================
  // Post-generation hooks
  // ==========================================

  /**
   * Run post-generation hooks - generate utility files
   */
  protected override async runPostGenerationHooks(): Promise<void> {
    await super.runPostGenerationHooks();
    
    // Generate utilities.ts with ResourceType union
    await this.generateUtilitiesFile();
  }

  /**
   * Generate utilities.ts file with ResourceType union
   */
  private async generateUtilitiesFile(): Promise<void> {
    if (this.resourceTypes.size === 0) {
      this.logger.warn('No resource types found, skipping utilities.ts generation');
      return;
    }

    const lines: string[] = [];
    
    // Add file header comment
    lines.push('/**');
    lines.push(' * FHIR Resource Type Utilities');
    lines.push(' * This file contains utility types for FHIR resources.');
    lines.push(' * ');
    lines.push(' * @generated This file is auto-generated. Do not edit manually.');
    lines.push(' */');
    lines.push('');

    // Generate ResourceType union
    const sortedResourceTypes = Array.from(this.resourceTypes).sort();
    lines.push('/**');
    lines.push(' * Union of all FHIR resource types in this package');
    lines.push(' */');
    lines.push('export type ResourceType =');
    
    for (let i = 0; i < sortedResourceTypes.length; i++) {
      const isLast = i === sortedResourceTypes.length - 1;
      const separator = isLast ? ';' : '';
      lines.push(`  | '${sortedResourceTypes[i]}'${separator}`);
    }

    lines.push('');

    // Generate helper type for Resource references
    lines.push('/**');
    lines.push(' * Helper type for creating typed References');
    lines.push(' * @example Reference<\'Patient\' | \'Practitioner\'> - Reference that can point to Patient or Practitioner');
    lines.push(' */');
    lines.push('export type TypedReference<T extends ResourceType> = {');
    lines.push('  reference?: string;');
    lines.push('  type?: T;');
    lines.push('  identifier?: any; // Simplified for utility');
    lines.push('  display?: string;');
    lines.push('};');

    const content = lines.join('\n');
    
    // Write the utilities file
    await this.fileManager.writeFile('utilities.ts', content);
    
    this.logger.info(`Generated utilities.ts with ${this.resourceTypes.size} resource types`);
  }
}