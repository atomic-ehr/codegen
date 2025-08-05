/**
 * Tests for Base Generator
 */

import { test, expect, describe } from 'bun:test';
import { BaseGenerator, GeneratorOptions } from './base';
import { rm, readFile } from 'fs/promises';
import { join } from 'path';

// Create a concrete implementation for testing
class TestGenerator extends BaseGenerator {
  async generate(): Promise<void> {
    this.file('test.ts');
    this.line('// Test file');
    this.blank();
    this.line('const x = 1;');
    
    this.file('nested/file.ts');
    this.multiLineComment('This is a\nmulti-line comment');
    this.blank();
    
    this.curlyBlock('export function test()', () => {
      this.line('return true;');
    });
    
    await this.writeFiles();
  }
  
  // Expose protected methods for testing
  testLine(content: string): void {
    this.line(content);
  }
  
  testIndent(): void {
    this.indent();
  }
  
  testDedent(): void {
    this.dedent();
  }
  
  testComment(text: string): void {
    this.comment(text);
  }
  
  getCurrentContent(): string[] {
    return this.currentContent;
  }
  
  getCurrentIndent(): number {
    return this.currentIndent;
  }
}

describe('BaseGenerator', () => {
  const testOutputDir = join(import.meta.dir, '../../test-output-base');
  
  async function cleanup() {
    try {
      await rm(testOutputDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore if doesn't exist
    }
  }

  test('should handle indentation correctly', () => {
    const generator = new TestGenerator({ outputDir: testOutputDir });
    
    generator.testLine('level 0');
    expect(generator.getCurrentContent()[0]).toBe('level 0');
    
    generator.testIndent();
    generator.testLine('level 1');
    expect(generator.getCurrentContent()[1]).toBe('  level 1');
    
    generator.testIndent();
    generator.testLine('level 2');
    expect(generator.getCurrentContent()[2]).toBe('    level 2');
    
    generator.testDedent();
    generator.testLine('back to level 1');
    expect(generator.getCurrentContent()[3]).toBe('  back to level 1');
    
    generator.testDedent();
    generator.testLine('back to level 0');
    expect(generator.getCurrentContent()[4]).toBe('back to level 0');
  });

  test('should handle dedent beyond zero', () => {
    const generator = new TestGenerator({ outputDir: testOutputDir });
    
    generator.testDedent(); // Should not go negative
    expect(generator.getCurrentIndent()).toBe(0);
    
    generator.testLine('still at level 0');
    expect(generator.getCurrentContent()[0]).toBe('still at level 0');
  });

  test('should generate single-line comments', () => {
    const generator = new TestGenerator({ outputDir: testOutputDir });
    
    generator.testComment('This is a comment');
    expect(generator.getCurrentContent()[0]).toBe('// This is a comment');
    
    generator.testComment('Line 1\nLine 2\nLine 3');
    expect(generator.getCurrentContent()[1]).toBe('// Line 1');
    expect(generator.getCurrentContent()[2]).toBe('// Line 2');
    expect(generator.getCurrentContent()[3]).toBe('// Line 3');
  });

  test('should generate files with correct structure', async () => {
    await cleanup();
    
    const generator = new TestGenerator({ outputDir: testOutputDir });
    await generator.generate();
    
    // Check first file
    const content1 = await readFile(join(testOutputDir, 'test.ts'), 'utf-8');
    expect(content1).toBe('// Test file\n\nconst x = 1;');
    
    // Check nested file
    const content2 = await readFile(join(testOutputDir, 'nested/file.ts'), 'utf-8');
    expect(content2).toContain('/**\n * This is a\n * multi-line comment\n */');
    expect(content2).toContain('export function test() {');
    expect(content2).toContain('  return true;');
    expect(content2).toContain('}');
    
    await cleanup();
  });

  test('should handle curly blocks with proper indentation', () => {
    const generator = new TestGenerator({ outputDir: testOutputDir });
    
    generator.testLine('before');
    generator.curlyBlock('if (true)', () => {
      generator.testLine('inside');
      generator.curlyBlock('nested', () => {
        generator.testLine('deeply nested');
      });
      generator.testLine('back inside');
    });
    generator.testLine('after');
    
    const content = generator.getCurrentContent();
    expect(content[0]).toBe('before');
    expect(content[1]).toBe('if (true) {');
    expect(content[2]).toBe('  inside');
    expect(content[3]).toBe('  nested {');
    expect(content[4]).toBe('    deeply nested');
    expect(content[5]).toBe('  }');
    expect(content[6]).toBe('  back inside');
    expect(content[7]).toBe('}');
    expect(content[8]).toBe('after');
  });

  test('should log messages in verbose mode', () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    
    try {
      const generator = new TestGenerator({ 
        outputDir: testOutputDir, 
        verbose: true 
      });
      
      (generator as any).log('Test message');
      expect(logs).toContain('Test message');
      
      // Non-verbose should not log
      logs.length = 0;
      const generator2 = new TestGenerator({ 
        outputDir: testOutputDir, 
        verbose: false 
      });
      
      (generator2 as any).log('Should not appear');
      expect(logs).toHaveLength(0);
    } finally {
      console.log = originalLog;
    }
  });

  test('should handle multiple files correctly', async () => {
    await cleanup();
    
    const generator = new TestGenerator({ outputDir: testOutputDir });
    
    // Create multiple files
    (generator as any).file('file1.ts');
    (generator as any).line('content 1');
    
    (generator as any).file('file2.ts');
    (generator as any).line('content 2');
    
    (generator as any).file('dir/file3.ts');
    (generator as any).line('content 3');
    
    const files = (generator as any).getFiles();
    expect(files).toHaveLength(3);
    expect(files[0].path).toBe(join(testOutputDir, 'file1.ts'));
    expect(files[0].content).toBe('content 1');
    expect(files[1].path).toBe(join(testOutputDir, 'file2.ts'));
    expect(files[1].content).toBe('content 2');
    expect(files[2].path).toBe(join(testOutputDir, 'dir/file3.ts'));
    expect(files[2].content).toBe('content 3');
    
    await cleanup();
  });
});