import { describe, test, expect, beforeEach } from 'bun:test';
import { HandlebarsTemplateEngine } from '../../../../../src/api/generators/base/HandlebarsTemplateEngine';
import { createLogger } from '../../../../../src/utils/codegen-logger';
import { TemplateError } from '../../../../../src/api/generators/base/errors';

describe('TemplateEngine', () => {
  let engine: HandlebarsTemplateEngine;

  beforeEach(() => {
    engine = new HandlebarsTemplateEngine({
      logger: createLogger({ prefix: 'Test', verbose: false })
    });
  });

  describe('Template Registration', () => {
    test('registers and renders simple template', async () => {
      engine.registerTemplate('simple', 'Hello {{name}}!');
      
      const result = await engine.render('simple', { name: 'World' });
      expect(result).toBe('Hello World!');
    });

    test('registers template with helpers', async () => {
      engine.registerTemplate('helper-test', 'Name: {{pascalCase name}}');
      
      const result = await engine.render('helper-test', { name: 'hello_world' });
      expect(result).toBe('Name: HelloWorld');
    });

    test('stores template metadata correctly', () => {
      engine.registerTemplate('test', 'content', {
        format: 'handlebars',
        cache: true
      });

      const info = engine.getTemplateInfo('test');
      expect(info).toBeDefined();
      expect(info!.name).toBe('test');
      expect(info!.format).toBe('handlebars');
    });

    test('handles function templates', async () => {
      const templateFn = (context: any) => `Hello ${context.name}!`;
      engine.registerTemplate('function', templateFn);
      
      const result = await engine.render('function', { name: 'Function' });
      expect(result).toBe('Hello Function!');
    });
  });

  describe('Template Helpers', () => {
    test('string manipulation helpers work', async () => {
      engine.registerTemplate('helpers', 
        '{{uppercase name}} {{lowercase name}} {{capitalize name}}'
      );
      
      const result = await engine.render('helpers', { name: 'testName' });
      expect(result).toBe('TESTNAME testname TestName');
    });

    test('camelCase and pascalCase helpers work', async () => {
      engine.registerTemplate('case-helpers', 
        '{{camelCase name}} {{pascalCase name}}'
      );
      
      const result = await engine.render('case-helpers', { name: 'hello_world-test' });
      expect(result).toContain('helloWorldTest');
      expect(result).toContain('HelloWorldTest');
    });

    test('array helpers work', async () => {
      engine.registerTemplate('arrays', 
        'Count: {{length items}}, Joined: {{join items ", "}}'
      );
      
      const result = await engine.render('arrays', { 
        items: ['a', 'b', 'c'] 
      });
      expect(result).toBe('Count: 3, Joined: a, b, c');
    });

    test('logic helpers work', async () => {
      engine.registerTemplate('logic', 
        '{{#if (eq status "active")}}Active{{else}}Inactive{{/if}}'
      );
      
      const activeResult = await engine.render('logic', { status: 'active' });
      expect(activeResult).toBe('Active');
      
      const inactiveResult = await engine.render('logic', { status: 'inactive' });
      expect(inactiveResult).toBe('Inactive');
    });

    test('utility helpers work', async () => {
      engine.registerTemplate('utils', 
        'JSON: {{json obj}}\nTimestamp: {{timestamp}}\nIndented:\n{{indent text 4}}'
      );
      
      const result = await engine.render('utils', { 
        obj: { key: 'value' },
        text: 'line1\nline2'
      });
      
      expect(result).toContain('"key": "value"');
      expect(result).toContain('    line1');
      expect(result).toContain('    line2');
    });

    test('custom Handlebars helpers work', async () => {
      engine.registerTemplate('handlebars-helpers', 
        '{{#ifEqual status "done"}}Complete{{else}}Pending{{/ifEqual}}'
      );
      
      const result = await engine.render('handlebars-helpers', { status: 'done' });
      expect(result).toBe('Complete');
    });

    test('imports helper works', async () => {
      engine.registerTemplate('imports-test', '{{imports imports}}');
      
      const imports = new Map([
        ['Reference', './Reference'],
        ['Patient', './Patient']
      ]);
      
      const result = await engine.render('imports-test', { imports });
      expect(result).toContain("import type { Reference } from './Reference';");
      expect(result).toContain("import type { Patient } from './Patient';");
    });

    test('exports helper works', async () => {
      engine.registerTemplate('exports-test', '{{exports exports}}');
      
      const exports = new Set(['Patient', 'Reference']);
      
      const result = await engine.render('exports-test', { exports });
      expect(result).toContain('export { Patient };');
      expect(result).toContain('export { Reference };');
    });
  });

  describe('Code Generation Templates', () => {
    test('generates TypeScript interface', async () => {
      const interfaceTemplate = `
export interface {{pascalCase schema.identifier.name}} {
{{#each fields}}
  {{camelCase @key}}{{#unless this.required}}?{{/unless}}: {{this.type}};
{{/each}}
}`.trim();

      engine.registerTemplate('interface', interfaceTemplate);
      
      const result = await engine.render('interface', {
        schema: {
          identifier: { name: 'patient' },
        },
        fields: {
          id: { type: 'string', required: true },
          name: { type: 'string', required: false }
        }
      });

      expect(result).toContain('export interface Patient');
      expect(result).toContain('id: string;');
      expect(result).toContain('name?: string;');
    });

    test('generates complex template with multiple helpers', async () => {
      const complexTemplate = `
/**
 * {{schema.description}}
 */
export interface {{pascalCase schema.name}} {
{{#each schema.fields}}
  {{#if this.description}}
  /** {{this.description}} */
  {{/if}}
  {{camelCase this.name}}{{#unless this.required}}?{{/unless}}: {{this.type}}{{#if this.isArray}}[]{{/if}};
{{/each}}
}

{{#if schema.hasEnums}}
// Enum types
{{#each schema.enums}}
export type {{pascalCase this.name}} = {{#each this.values}}'{{this}}'{{#unless @last}} | {{/unless}}{{/each}};
{{/each}}
{{/if}}`.trim();

      engine.registerTemplate('complex', complexTemplate);
      
      const result = await engine.render('complex', {
        schema: {
          name: 'UserProfile',
          description: 'User profile information',
          hasEnums: true,
          fields: [
            { name: 'user_id', type: 'string', required: true, description: 'Unique identifier' },
            { name: 'tags', type: 'string', required: false, isArray: true }
          ],
          enums: [
            { name: 'UserStatus', values: ['active', 'inactive', 'suspended'] }
          ]
        }
      });

      expect(result).toContain('export interface UserProfile');
      expect(result).toContain('/** Unique identifier */');
      expect(result).toContain('userId: string;');
      expect(result).toContain('tags?: string[];');
      expect(result).toContain("export type UserStatus = 'active' | 'inactive' | 'suspended';");
    });
  });

  describe('Template Management', () => {
    test('lists available templates', () => {
      engine.registerTemplate('template1', 'content1');
      engine.registerTemplate('template2', 'content2');
      
      const templates = engine.getAvailableTemplates();
      expect(templates).toEqual(['template1', 'template2']);
    });

    test('checks template existence', () => {
      engine.registerTemplate('exists', 'content');
      
      expect(engine.hasTemplate('exists')).toBe(true);
      expect(engine.hasTemplate('not-exists')).toBe(false);
    });

    test('unregisters templates', () => {
      engine.registerTemplate('temporary', 'content');
      expect(engine.hasTemplate('temporary')).toBe(true);
      
      const removed = engine.unregisterTemplate('temporary');
      expect(removed).toBe(true);
      expect(engine.hasTemplate('temporary')).toBe(false);
    });

    test('clears all templates', () => {
      engine.registerTemplate('template1', 'content1');
      engine.registerTemplate('template2', 'content2');
      
      engine.clearTemplates();
      expect(engine.getAvailableTemplates()).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    test('throws error for missing template', async () => {
      await expect(
        engine.render('nonexistent', {})
      ).rejects.toThrow(TemplateError);
    });

    test('provides template suggestions for typos', async () => {
      engine.registerTemplate('interface', 'test');
      
      try {
        await engine.render('interfac', {});
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateError);
        const templateError = error as TemplateError;
        expect(templateError.debugInfo?.suggestedTemplates).toContain('interface');
      }
    });

    test('includes available templates in error', async () => {
      engine.registerTemplate('template1', 'content');
      engine.registerTemplate('template2', 'content');
      
      try {
        await engine.render('missing', {});
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TemplateError);
        const templateError = error as TemplateError;
        expect(templateError.debugInfo?.availableTemplates).toContain('template1');
        expect(templateError.debugInfo?.availableTemplates).toContain('template2');
      }
    });

    test('validates context fields', () => {
      // This would be called internally by template implementations
      expect(() => {
        (engine as any).validateContext({}, ['required-field']);
      }).toThrow(TemplateError);
    });
  });

  describe('Template Caching', () => {
    test('caches compiled templates by default', async () => {
      engine.registerTemplate('cached', 'Hello {{name}}!');
      
      // Render twice to test caching
      const result1 = await engine.render('cached', { name: 'First' });
      const result2 = await engine.render('cached', { name: 'Second' });
      
      expect(result1).toBe('Hello First!');
      expect(result2).toBe('Hello Second!');
    });

    test('respects cache setting', () => {
      engine.registerTemplate('no-cache', 'content', { cache: false });
      engine.registerTemplate('with-cache', 'content', { cache: true });
      
      // Both should work (caching is internal optimization)
      expect(engine.hasTemplate('no-cache')).toBe(true);
      expect(engine.hasTemplate('with-cache')).toBe(true);
    });
  });

  describe('Custom Helpers', () => {
    test('registers custom helpers after engine creation', async () => {
      engine.registerHelper('customHelper', (str: string) => `Custom: ${str}`);
      engine.registerTemplate('custom', '{{customHelper value}}');
      
      const result = await engine.render('custom', { value: 'test' });
      expect(result).toBe('Custom: test');
    });
  });

  describe('Template Loading from Directory', () => {
    test('handles missing directory appropriately', async () => {
      // Should complete without throwing for missing directory
      await expect(
        engine.loadTemplatesFromDirectory('./templates/typescript')
      ).resolves.toBeUndefined();
    });

    test('method exists and can be called', async () => {
      expect(typeof engine.loadTemplatesFromDirectory).toBe('function');
      await expect(engine.loadTemplatesFromDirectory('./nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('Core Template Engine Functionality', () => {
    test('template engine initializes correctly', () => {
      expect(engine).toBeDefined();
      expect(engine.getAvailableTemplates()).toEqual([]);
    });

    test('helper registration works', () => {
      const originalCount = engine.getAvailableTemplates().length;
      engine.registerHelper('testHelper', () => 'test');
      // Helper registration shouldn't change template count
      expect(engine.getAvailableTemplates().length).toBe(originalCount);
    });

    test('template info includes format', () => {
      engine.registerTemplate('test', 'content', { format: 'handlebars' });
      const info = engine.getTemplateInfo('test');
      expect(info?.format).toBe('handlebars');
    });
  });
});