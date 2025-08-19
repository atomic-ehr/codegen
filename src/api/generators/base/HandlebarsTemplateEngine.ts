/**
 * Handlebars-based template engine implementation
 */

import Handlebars from 'handlebars';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import { TemplateEngine, type TemplateContext, type TemplateOptions } from './TemplateEngine';
import { TemplateError } from './errors';
import type { CodegenLogger } from '../../../utils/codegen-logger';

export interface HandlebarsTemplateEngineOptions {
  logger: CodegenLogger;
  
  /** Directory containing template files */
  templateDirectory?: string;
  
  /** Whether to automatically load templates from directory */
  autoLoadTemplates?: boolean;
  
  /** Custom Handlebars options */
  handlebarsOptions?: Handlebars.RuntimeOptions;
}

/**
 * Handlebars template engine implementation
 */
export class HandlebarsTemplateEngine extends TemplateEngine {
  private readonly handlebars: typeof Handlebars;
  private readonly options: Required<HandlebarsTemplateEngineOptions>;

  constructor(options: HandlebarsTemplateEngineOptions) {
    super({ logger: options.logger });
    
    this.options = {
      templateDirectory: './templates',
      autoLoadTemplates: false,
      handlebarsOptions: {},
      ...options
    };

    this.handlebars = Handlebars.create();
    this.setupHandlebars();

    // Auto-load templates if requested
    if (this.options.autoLoadTemplates && this.options.templateDirectory) {
      this.loadTemplatesFromDirectory(this.options.templateDirectory).catch(error => {
        this.logger.warn(`Failed to auto-load templates: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  async render(templateName: string, context: TemplateContext): Promise<string> {
    try {
      // Get compiled template
      const template = this.getCompiledTemplate(templateName);
      if (!template) {
        throw new TemplateError(
          `Template not found: ${templateName}`,
          templateName,
          context,
          {
            availableTemplates: this.getAvailableTemplates()
          }
        );
      }

      // Render with context
      const result = template(context);
      
      this.logger.debug(`Rendered template: ${templateName}`);
      return result;

    } catch (error) {
      if (error instanceof TemplateError) {
        throw error;
      }

      throw new TemplateError(
        `Failed to render template '${templateName}': ${error}`,
        templateName,
        context,
        {
          templateSource: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }

  registerTemplate(name: string, template: string | Function, options: TemplateOptions = {}): void {
    try {
      let compiledTemplate: Handlebars.TemplateDelegate;

      if (typeof template === 'string') {
        // Compile Handlebars template
        compiledTemplate = this.handlebars.compile(template, {
          noEscape: true, // We want raw code output
          ...options.options
        });
      } else if (typeof template === 'function') {
        // Use function directly as template
        compiledTemplate = template as Handlebars.TemplateDelegate;
      } else {
        throw new Error('Template must be a string or function');
      }

      // Store template with metadata
      this.templates.set(name, {
        compiled: compiledTemplate,
        source: typeof template === 'string' ? template : undefined,
        format: options.format || 'handlebars',
        options,
        cache: options.cache !== false // Cache by default
      });

      this.logger.debug(`Registered template: ${name}`);

    } catch (error) {
      throw new TemplateError(
        `Failed to register template '${name}': ${error}`,
        name,
        {},
        { templateSource: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  async loadTemplatesFromDirectory(directory: string): Promise<void> {
    try {
      const files = await this.discoverTemplateFiles(directory);
      
      this.logger.debug(`Loading ${files.length} templates from ${directory}`);

      for (const file of files) {
        await this.loadTemplateFile(file);
      }

      this.logger.info(`Loaded ${files.length} templates from ${directory}`);

    } catch (error) {
      // Only throw an error if it's a real issue, not just missing directory
      if (error instanceof Error && error.message.includes('ENOENT')) {
        this.logger.warn(`Template directory not found: ${directory}`);
        throw new TemplateError(
          `Template directory not found: ${directory}`,
          'directory-load',
          { directory },
          { templateSource: error.message }
        );
      }
      
      throw new TemplateError(
        `Failed to load templates from directory '${directory}': ${error}`,
        'directory-load',
        { directory },
        { templateSource: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Get compiled template from cache or templates
   */
  private getCompiledTemplate(templateName: string): Handlebars.TemplateDelegate | null {
    const templateData = this.templates.get(templateName);
    if (!templateData) return null;

    // Check cache first
    if (templateData.cache && this.templateCache.has(templateName)) {
      return this.templateCache.get(templateName);
    }

    // Get compiled template
    const compiled = templateData.compiled;
    
    // Cache if enabled
    if (templateData.cache) {
      this.templateCache.set(templateName, compiled);
    }

    return compiled;
  }

  /**
   * Setup Handlebars with custom helpers
   */
  private setupHandlebars(): void {
    // Register all our helpers with Handlebars
    for (const [name, helper] of this.helpers) {
      this.handlebars.registerHelper(name, helper as Handlebars.HelperDelegate);
    }
    
    // Override the registerHelper to keep Handlebars instance in sync
    const originalRegisterHelper = this.registerHelper.bind(this);
    this.registerHelper = (name: string, helper: Function) => {
      originalRegisterHelper(name, helper);
      this.handlebars.registerHelper(name, helper as Handlebars.HelperDelegate);
    };

    // Add code generation specific helpers
    this.handlebars.registerHelper('ifEqual', function(this: any, a: any, b: any, options: Handlebars.HelperOptions) {
      if (a === b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    this.handlebars.registerHelper('ifNotEqual', function(this: any, a: any, b: any, options: Handlebars.HelperOptions) {
      if (a !== b) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    this.handlebars.registerHelper('each_with_index', function(this: any, array: any[], options: Handlebars.HelperOptions) {
      let result = '';
      if (Array.isArray(array)) {
        for (let i = 0; i < array.length; i++) {
          const item = array[i];
          const context = {
            ...this,
            '@index': i,
            '@first': i === 0,
            '@last': i === array.length - 1
          };
          // Set the current item as 'this' for the block
          result += options.fn(item, { data: context });
        }
      }
      return result;
    });

    // Helper for generating imports
    this.handlebars.registerHelper('imports', function(imports: Map<string, string>) {
      const statements: string[] = [];
      for (const [symbol, path] of imports) {
        statements.push(`import type { ${symbol} } from '${path}';`);
      }
      return statements.join('\n');
    });

    // Helper for generating exports
    this.handlebars.registerHelper('exports', function(exports: Set<string>) {
      return Array.from(exports).map(exp => `export { ${exp} };`).join('\n');
    });
  }

  /**
   * Discover template files in directory
   */
  private async discoverTemplateFiles(directory: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await readdir(directory);
      
      for (const entry of entries) {
        const fullPath = join(directory, entry);
        const stats = await stat(fullPath);
        
        if (stats.isFile() && this.isTemplateFile(fullPath)) {
          files.push(fullPath);
        } else if (stats.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.discoverTemplateFiles(fullPath);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      this.logger.warn(`Failed to read directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return files;
  }

  /**
   * Check if file is a template file
   */
  private isTemplateFile(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return ['.hbs', '.handlebars', '.template'].includes(ext);
  }

  /**
   * Load a single template file
   */
  private async loadTemplateFile(filePath: string): Promise<void> {
    try {
      const content = await readFile(filePath, 'utf-8');
      const templateName = this.getTemplateNameFromPath(filePath);
      
      this.registerTemplate(templateName, content, {
        format: 'handlebars',
        cache: true
      });

    } catch (error) {
      this.logger.warn(`Failed to load template file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Extract template name from file path
   */
  private getTemplateNameFromPath(filePath: string): string {
    const fileName = basename(filePath);
    const nameWithoutExt = fileName.replace(/\.(hbs|handlebars|template)$/, '');
    return nameWithoutExt;
  }

  /**
   * Find templates with similar names
   */
  private findSimilarTemplates(targetName: string): string[] {
    const available = this.getAvailableTemplates();
    return available.filter(name => {
      const distance = this.levenshteinDistance(targetName.toLowerCase(), name.toLowerCase());
      return distance <= 2;
    }).slice(0, 3);
  }

  /**
   * Calculate Levenshtein distance for template suggestions
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(0));
    
    for (let i = 0; i <= str1.length; i++) matrix[0]![i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j]![0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j]![i] = Math.min(
          matrix[j]![i - 1] + 1,
          matrix[j - 1]![i] + 1,
          matrix[j - 1]![i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length]![str1.length];
  }
}

// Re-export types for convenience
export type { TemplateContext, TemplateOptions } from './TemplateEngine';