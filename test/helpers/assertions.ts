/**
 * Custom assertions for generator testing
 */

import { expect } from 'bun:test';
import type { GeneratedFile } from '../../src/api/generators/base/types';

/**
 * Assert that generated file has valid TypeScript syntax
 */
export function assertValidTypeScript(content: string, filename?: string): void {
  const context = filename ? ` in ${filename}` : '';
  
  // Check balanced braces
  const openBraces = (content.match(/\{/g) || []).length;
  const closeBraces = (content.match(/\}/g) || []).length;
  expect(openBraces).toBe(closeBraces);
  
  // Check balanced parentheses
  const openParens = (content.match(/\(/g) || []).length;
  const closeParens = (content.match(/\)/g) || []).length;
  expect(openParens).toBe(closeParens);
  
  // Check for common TypeScript syntax
  if (content.includes('interface')) {
    expect(content).toMatch(/interface\s+\w+\s*\{/);
  }
  
  if (content.includes('export')) {
    const hasExportDeclaration = /export\s+(interface|type|const|function|class)/.test(content);
    const hasExportStatement = /export\s*\{/.test(content);
    expect(hasExportDeclaration || hasExportStatement).toBe(true);
  }

  // Check for proper semicolons and line endings
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (line && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
      // Interface/type property lines should end with semicolon or be closing brace
      if (line.match(/^\s*\w+[?]?:\s*[^;]+[^;}]$/)) {
        expect(line).toMatch(/;$/);
      }
    }
  }
}

/**
 * Assert file generation results meet quality standards
 */
export function assertGenerationQuality(files: GeneratedFile[]): void {
  expect(files.length).toBeGreaterThan(0);
  
  for (const file of files) {
    expect(file.filename).toMatch(/\.(ts|js|test)$/);
    expect(file.content.length).toBeGreaterThan(0);
    expect(file.exports.length).toBeGreaterThan(0);
    expect(file.path).toBeTruthy();

    // Check that content is not just whitespace
    expect(file.content.trim()).not.toBe('');

    // Check that exports are valid identifiers
    for (const exportName of file.exports) {
      expect(exportName).toMatch(/^[a-zA-Z_$][a-zA-Z0-9_$]*$/);
    }
  }
}

/**
 * Assert that two generated file sets are equivalent
 */
export function assertFilesEquivalent(
  actual: GeneratedFile[], 
  expected: GeneratedFile[]
): void {
  
  // Sort both arrays by filename for comparison
  const sortedActual = actual.sort((a, b) => a.filename.localeCompare(b.filename));
  const sortedExpected = expected.sort((a, b) => a.filename.localeCompare(b.filename));
  
  for (let i = 0; i < sortedActual.length; i++) {
    const actualFile = sortedActual[i]!;
    const expectedFile = sortedExpected[i]!;
    
    expect(actualFile.filename).toBe(expectedFile.filename);
    expect(normalizeWhitespace(actualFile.content))
      .toBe(normalizeWhitespace(expectedFile.content));
    expect(new Set(actualFile.exports)).toEqual(new Set(expectedFile.exports));
  }
}

/**
 * Assert performance meets benchmarks
 */
export function assertPerformanceBenchmark(
  actualTime: number,
  baselineTime: number,
  tolerance: number = 0.1
): void {
  const maxAllowed = baselineTime * (1 + tolerance);
  expect(actualTime).toBeLessThanOrEqual(maxAllowed);
}

/**
 * Assert memory usage is reasonable
 */
export function assertMemoryUsage(maxMemoryMB: number): void {
  const memoryUsage = process.memoryUsage();
  const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
  
  expect(heapUsedMB).toBeLessThanOrEqual(maxMemoryMB);
}

/**
 * Assert that content contains valid FHIR resource structure
 */
export function assertValidFHIRStructure(content: string, resourceType: string): void {
  // Check for interface declaration
  expect(content).toMatch(new RegExp(`interface\\s+${resourceType}\\s*\\{`));

  // Check for common FHIR fields
  expect(content).toMatch(/resourceType[?]?:\s*['"`]/);
  
  if (resourceType !== 'Element' && resourceType !== 'BackboneElement') {
    expect(content).toMatch(/id[?]?:\s*string/);

  }

  // Check export
  expect(content).toMatch(new RegExp(`export\\s+.*${resourceType}`));
}

/**
 * Assert code follows naming conventions
 */
export function assertNamingConventions(content: string): void {
  // Interface names should be PascalCase
  const interfaceMatches = content.match(/interface\s+(\w+)/g);
  if (interfaceMatches) {
    for (const match of interfaceMatches) {
      const name = match.replace('interface ', '');
      expect(name).toMatch(/^[A-Z][a-zA-Z0-9]*$/);
    }
  }

  // Type names should be PascalCase
  const typeMatches = content.match(/type\s+(\w+)/g);
  if (typeMatches) {
    for (const match of typeMatches) {
      const name = match.replace('type ', '');
      expect(name).toMatch(/^[A-Z][a-zA-Z0-9]*$/);
    }
  }

  // Property names should be camelCase
  const propertyMatches = content.match(/^\s*(\w+)[?]?:/gm);
  if (propertyMatches) {
    for (const match of propertyMatches) {
      const name = match.replace(/^\s*/, '').replace(/[?]:.*$/, '');
      if (!name.startsWith('_') && !name.includes('_')) { // Allow underscore prefixes and snake_case
        expect(name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  }
}

/**
 * Assert imports are properly organized
 */
export function assertImportOrganization(content: string): void {
  const lines = content.split('\n');
  let importSection = true;
  let lastImportLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line || line.startsWith('//') || line.startsWith('/*')) {
      continue;
    }
    
    if (line.startsWith('import ')) {
      if (!importSection) {
        expect(false).toBe(true);
      }
      lastImportLine = i;
    } else if (line && !line.startsWith('import ')) {
      importSection = false;
    }
  }
  
  // Check that there's proper spacing after imports
  if (lastImportLine >= 0 && lastImportLine < lines.length - 1) {
    const nextLine = lines[lastImportLine + 1];
    if (nextLine?.trim() && !nextLine.startsWith('//')) {
      expect(nextLine.trim()).toBe('');
    }
  }
}

/**
 * Assert content has proper JSDoc comments for exports
 */
export function assertHasDocumentation(content: string): void {
  const exportMatches = content.match(/^export\s+(interface|type|class|const|function)\s+(\w+)/gm);
  
  if (exportMatches) {
    const lines = content.split('\n');
    
    for (const match of exportMatches) {
      const exportName = match.split(/\s+/).pop();
      const exportLineIndex = lines.findIndex(line => line.includes(match));
      
      if (exportLineIndex > 0) {
        const previousLine = lines[exportLineIndex - 1]?.trim();
        const twoLinesBack = lines[exportLineIndex - 2]?.trim();
        
        const hasJSDoc = previousLine === '*/' || 
                        twoLinesBack?.startsWith('/**') || 
                        previousLine?.startsWith('//');
        
        expect(hasJSDoc).toBe(true);
      }
    }
  }
}

/**
 * Assert error messages are helpful and actionable
 */
export function assertHelpfulError(error: Error): void {
  expect(error.message.length).toBeGreaterThan(10);
  expect(error.message).not.toMatch(/undefined|null|\[object Object\]/);
  
  // Should contain suggestions or context
  const hasSuggestion = error.message.includes('try') || 
                       error.message.includes('check') ||
                       error.message.includes('ensure') ||
                       error.message.includes('verify');
  expect(hasSuggestion).toBe(true);
}

/**
 * Assert array has expected structure and content
 */
export function assertArrayStructure<T>(
  array: T[], 
  expectedLength: { min?: number; max?: number; exact?: number },
  itemValidator?: (item: T, index: number) => void
): void {
  if (expectedLength.exact !== undefined) {
    expect(array).toHaveLength(expectedLength.exact);
  } else {
    if (expectedLength.min !== undefined) {
      expect(array.length).toBeGreaterThanOrEqual(expectedLength.min);
    }
    if (expectedLength.max !== undefined) {
      expect(array.length).toBeLessThanOrEqual(expectedLength.max);
    }
  }

  if (itemValidator) {
    array.forEach((item, index) => {
      try {
        itemValidator(item, index);
      } catch (error) {
        throw new Error(`Item validation failed at index ${index}: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
  }
}

// Helper functions
function normalizeWhitespace(content: string): string {
  return content
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}();,])\s*/g, '$1')
    .trim();
}