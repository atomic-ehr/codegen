/**
 * Base Generator Class
 * 
 * Provides core functionality for code generation including
 * file management, indentation, and code structuring utilities.
 */

import { join } from 'path';

export interface GeneratorOptions {
  outputDir: string;
  verbose?: boolean;
}

export interface FileContent {
  path: string;
  content: string;
}

export abstract class BaseGenerator {
  protected options: GeneratorOptions;
  protected currentIndent = 0;
  protected indentSize = 2;
  protected files: FileContent[] = [];
  protected currentFile: FileContent | null = null;
  protected currentContent: string[] = [];

  constructor(options: GeneratorOptions) {
    this.options = options;
  }

  /**
   * Main generation method to be implemented by subclasses
   */
  abstract generate(): Promise<void>;

  /**
   * Start a new file
   */
  protected file(relativePath: string): void {
    if (this.currentFile) {
      this.currentFile.content = this.currentContent.join('\n');
      this.files.push(this.currentFile);
    }
    
    this.currentFile = {
      path: join(this.options.outputDir, relativePath),
      content: ''
    };
    this.currentContent = [];
    this.currentIndent = 0;
  }

  /**
   * Add a line to the current file
   */
  protected line(content = ''): void {
    const indent = ' '.repeat(this.currentIndent * this.indentSize);
    this.currentContent.push(indent + content);
  }

  /**
   * Add a blank line
   */
  protected blank(): void {
    this.currentContent.push('');
  }

  /**
   * Start a block with curly braces
   */
  protected curlyBlock(header: string, fn: () => void): void {
    this.line(header + ' {');
    this.indent();
    fn();
    this.dedent();
    this.line('}');
  }

  /**
   * Increase indentation
   */
  protected indent(): void {
    this.currentIndent++;
  }

  /**
   * Decrease indentation
   */
  protected dedent(): void {
    if (this.currentIndent > 0) {
      this.currentIndent--;
    }
  }

  /**
   * Write a comment
   */
  protected comment(text: string): void {
    const lines = text.split('\n');
    lines.forEach(line => {
      this.line(`// ${line}`);
    });
  }

  /**
   * Write a multi-line comment
   */
  protected multiLineComment(text: string): void {
    this.line('/**');
    const lines = text.split('\n');
    lines.forEach(line => {
      this.line(` * ${line}`);
    });
    this.line(' */');
  }

  /**
   * Get all generated files
   */
  protected getFiles(): FileContent[] {
    // Finalize current file if any
    if (this.currentFile) {
      this.currentFile.content = this.currentContent.join('\n');
      this.files.push(this.currentFile);
      this.currentFile = null;
      this.currentContent = [];
    }
    return this.files;
  }

  /**
   * Write all files to disk
   */
  protected async writeFiles(): Promise<void> {
    const files = this.getFiles();
    
    for (const file of files) {
      const dir = file.path.substring(0, file.path.lastIndexOf('/'));
      
      // Ensure directory exists
      await Bun.$`mkdir -p ${dir}`.quiet();
      
      // Write file
      await Bun.write(file.path, file.content);
      
      if (this.options.verbose) {
        console.log(`Generated: ${file.path}`);
      }
    }
  }

  /**
   * Log a message if verbose mode is enabled
   */
  protected log(message: string): void {
    if (this.options.verbose) {
      console.log(message);
    }
  }
}