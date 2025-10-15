/**
 * Mock implementations for testing
 */

import { BaseGenerator } from "@root/api/generators/base/BaseGenerator";
import type { BaseGeneratorOptions, GeneratedFile, TemplateContext } from "@root/api/generators/base/types";
import type { TypeSchema } from "@typeschema/types";

/**
 * Mock logger that captures all log messages
 */
export class MockLogger {
    public messages: Array<{ level: string; message: string; error?: Error }> = [];

    debug(message: string): void {
        this.messages.push({ level: "debug", message });
    }

    info(message: string): void {
        this.messages.push({ level: "info", message });
    }

    warn(message: string, error?: Error): void {
        this.messages.push({ level: "warn", message, error });
    }

    error(message: string, error?: Error): void {
        this.messages.push({ level: "error", message, error });
    }

    child(_prefix: string): MockLogger {
        return new MockLogger();
    }

    hasLevel(level: string): boolean {
        return this.messages.some((msg) => msg.level === level);
    }

    getMessages(level?: string): Array<{ level: string; message: string; error?: Error }> {
        return level ? this.messages.filter((msg) => msg.level === level) : this.messages;
    }

    clear(): void {
        this.messages = [];
    }
}

/**
 * Simple test generator for testing base functionality
 */
export class TestGenerator extends BaseGenerator<BaseGeneratorOptions, GeneratedFile[]> {
    protected getLanguageName(): string {
        return "TestLanguage";
    }

    protected getFileExtension(): string {
        return ".test";
    }

    protected createTypeMapper(): any {
        return {
            formatTypeName: (name: string) => name,
            formatFileName: (name: string) => name,
            mapType: () => ({ name: "TestType", isPrimitive: false }),
        };
    }

    protected async generateSchemaContent(schema: TypeSchema, context: TemplateContext): Promise<string> {
        const content = `// Test content for ${schema.identifier.name}
interface ${schema.identifier.name} {
  id?: string;
}

export { ${schema.identifier.name} };`;

        // Add exports to context
        context.exports?.add(schema.identifier.name);

        return content;
    }

    protected async validateContent(content: string, _context: TemplateContext): Promise<void> {
        if (content.includes("INVALID")) {
            throw new Error("Test validation error");
        }
    }

    protected filterAndSortSchemas(schemas: TypeSchema[]): TypeSchema[] {
        return schemas.sort((a, b) => a.identifier.name.localeCompare(b.identifier.name));
    }
}

/**
 * Mock file manager for testing without file system
 */
export class MockFileManager {
    public writtenFiles = new Map<string, string>();
    public writeDelay = 0; // Simulate slow filesystem

    async writeFile(
        path: string,
        content: string,
    ): Promise<{
        path: string;
        size: number;
        writeTime: number;
    }> {
        if (this.writeDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, this.writeDelay));
        }

        this.writtenFiles.set(path, content);

        return {
            path,
            size: content.length,
            writeTime: this.writeDelay,
        };
    }

    async writeBatch(files: Map<string, string>): Promise<
        Array<{
            path: string;
            size: number;
            writeTime: number;
        }>
    > {
        const results = [];
        for (const [path, content] of files) {
            results.push(await this.writeFile(path, content));
        }
        return results;
    }

    getWrittenFile(path: string): string | undefined {
        return this.writtenFiles.get(path);
    }

    hasWrittenFile(path: string): boolean {
        return this.writtenFiles.has(path);
    }

    getWrittenFiles(): Map<string, string> {
        return new Map(this.writtenFiles);
    }

    clear(): void {
        this.writtenFiles.clear();
    }
}
