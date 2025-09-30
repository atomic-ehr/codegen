/**
 * Index file builder for automated exports
 *
 * Automatically generates index files that export all types and functions
 * from a directory, with support for grouping and namespaces.
 */

import type { CodegenLogger } from "../../../../utils/codegen-logger";
import type { FileManager } from "../FileManager";
import type { TemplateEngine } from "../types";

export interface IndexBuilderConfig {
    directory: string;
    fileManager: FileManager;
    templateEngine?: TemplateEngine;
    logger: CodegenLogger;
}

/**
 * Builder for index files with intelligent export management
 *
 * Features:
 * - Automatic export detection
 * - Namespace support
 * - Export grouping
 * - Custom headers
 * - Template support
 */
export class IndexBuilder {
    private readonly config: IndexBuilderConfig;
    private readonly exports = new Map<string, string>(); // symbol -> from path
    private readonly namespaces = new Map<string, string>(); // namespace -> path
    private readonly reExports = new Map<string, string>(); // export all from path
    private header = "";
    private footer = "";
    private groupingFunction?: (exportName: string) => string;
    private sortFunction?: (a: [string, string], b: [string, string]) => number;

    constructor(config: IndexBuilderConfig) {
        this.config = config;
    }

    /**
     * Add exports from a specific file
     * @param exportNames Export names
     * @param fromPath Path to file (without extension)
     */
    withExports(exportNames: string[], fromPath: string): IndexBuilder {
        for (const name of exportNames) {
            this.exports.set(name, fromPath);
        }
        return this;
    }

    /**
     * Add a single export
     * @param exportName Export name
     * @param fromPath Path to file
     */
    withExport(exportName: string, fromPath: string): IndexBuilder {
        this.exports.set(exportName, fromPath);
        return this;
    }

    /**
     * Add namespace exports
     * @param namespaces Map of namespace to path
     */
    withNamespaces(namespaces: Record<string, string>): IndexBuilder {
        for (const [ns, path] of Object.entries(namespaces)) {
            this.namespaces.set(ns, path);
        }
        return this;
    }

    /**
     * Add namespace export
     * @param namespace Namespace name
     * @param path Path to export as namespace
     */
    withNamespace(namespace: string, path: string): IndexBuilder {
        this.namespaces.set(namespace, path);
        return this;
    }

    /**
     * Re-export all from paths
     * @param paths Paths to re-export all from
     */
    withReExports(paths: string[]): IndexBuilder {
        for (const path of paths) {
            this.reExports.set(path, path);
        }
        return this;
    }

    /**
     * Add re-export
     * @param path Path to re-export all from
     */
    withReExport(path: string): IndexBuilder {
        this.reExports.set(path, path);
        return this;
    }

    /**
     * Set header content
     * @param header Header content
     */
    withHeader(header: string): IndexBuilder {
        this.header = header;
        return this;
    }

    /**
     * Set footer content
     * @param footer Footer content
     */
    withFooter(footer: string): IndexBuilder {
        this.footer = footer;
        return this;
    }

    /**
     * Group exports by function
     * @param fn Function that returns group name for export
     */
    groupBy(fn: (exportName: string) => string): IndexBuilder {
        this.groupingFunction = fn;
        return this;
    }

    /**
     * Sort exports by function
     * @param fn Sort function for [exportName, fromPath] tuples
     */
    sortBy(fn: (a: [string, string], b: [string, string]) => number): IndexBuilder {
        this.sortFunction = fn;
        return this;
    }

    /**
     * Auto-discover exports from directory
     * @param filePattern Pattern to match files (e.g., "*.ts")
     */
    async autoDiscover(_filePattern?: string): Promise<IndexBuilder> {
        // This is a placeholder - in a real implementation, this would:
        // 1. Read all files in the directory
        // 2. Parse TypeScript/JavaScript to extract exports
        // 3. Add them to the exports map

        this.config.logger.debug(`Auto-discovering exports in ${this.config.directory}`);

        // For now, just log that this feature would be implemented
        this.config.logger.warn("Auto-discovery not yet implemented - manually add exports");

        return this;
    }

    /**
     * Save the index file
     */
    async save(): Promise<string> {
        const content = this.generateContent();
        const indexPath = `${this.config.directory}/index.ts`;

        const result = await this.config.fileManager.writeFile(indexPath, content);
        this.config.logger.debug(`Generated index file: ${indexPath}`);

        return result.path;
    }

    /**
     * Build content without saving (for preview)
     */
    build(): string {
        return this.generateContent();
    }

    /**
     * Generate the index file content
     */
    private generateContent(): string {
        const lines: string[] = [];

        // Add header
        if (this.header) {
            lines.push(this.header);
            lines.push("");
        }

        // Add re-exports first
        if (this.reExports.size > 0) {
            lines.push("// Re-exports");
            for (const path of this.reExports.values()) {
                lines.push(`export * from './${path}';`);
            }
            lines.push("");
        }

        // Process exports
        if (this.exports.size > 0) {
            if (this.groupingFunction) {
                this.generateGroupedExports(lines);
            } else {
                this.generateSimpleExports(lines);
            }
            lines.push("");
        }

        // Add namespace exports
        if (this.namespaces.size > 0) {
            lines.push("// Namespace exports");
            const sortedNamespaces = Array.from(this.namespaces.entries()).sort();
            for (const [ns, path] of sortedNamespaces) {
                lines.push(`export * as ${ns} from './${path}';`);
            }
            lines.push("");
        }

        // Add footer
        if (this.footer) {
            lines.push(this.footer);
        }

        // Clean up extra empty lines
        const content = lines
            .join("\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
        return `${content}\n`; // Ensure file ends with newline
    }

    /**
     * Generate simple exports without grouping
     */
    private generateSimpleExports(lines: string[]): void {
        lines.push("// Exports");

        let exportEntries = Array.from(this.exports.entries());

        // Apply custom sorting if provided
        if (this.sortFunction) {
            exportEntries = exportEntries.sort(this.sortFunction);
        } else {
            // Default: sort by export name
            exportEntries = exportEntries.sort(([a], [b]) => a.localeCompare(b));
        }

        // Group by path for cleaner output
        const exportsByPath = new Map<string, string[]>();
        for (const [exportName, fromPath] of exportEntries) {
            if (!exportsByPath.has(fromPath)) {
                exportsByPath.set(fromPath, []);
            }
            exportsByPath.get(fromPath)?.push(exportName);
        }

        // Generate export statements
        for (const [path, exports] of exportsByPath) {
            const sortedExports = exports.sort();
            if (sortedExports.length === 1) {
                lines.push(`export type { ${sortedExports[0]} } from './${path}';`);
            } else if (sortedExports.length <= 3) {
                lines.push(`export type { ${sortedExports.join(", ")} } from './${path}';`);
            } else {
                lines.push(`export type {`);
                sortedExports.forEach((exp, index) => {
                    const isLast = index === sortedExports.length - 1;
                    lines.push(`\t${exp}${isLast ? "" : ","}`);
                });
                lines.push(`} from './${path}';`);
            }
        }
    }

    /**
     * Generate grouped exports
     */
    private generateGroupedExports(lines: string[]): void {
        if (!this.groupingFunction) return;

        const groups = new Map<string, Map<string, string[]>>();

        // Group exports
        for (const [exportName, fromPath] of this.exports) {
            const group = this.groupingFunction(exportName);

            if (!groups.has(group)) {
                groups.set(group, new Map());
            }

            const groupMap = groups.get(group)!;
            if (!groupMap.has(fromPath)) {
                groupMap.set(fromPath, []);
            }

            groupMap.get(fromPath)?.push(exportName);
        }

        // Generate grouped output
        const sortedGroups = Array.from(groups.entries()).sort();

        for (const [groupName, groupExports] of sortedGroups) {
            lines.push(`// ${groupName}`);

            for (const [path, exports] of groupExports) {
                const sortedExports = exports.sort();
                if (sortedExports.length === 1) {
                    lines.push(`export type { ${sortedExports[0]} } from './${path}';`);
                } else {
                    lines.push(`export type { ${sortedExports.join(", ")} } from './${path}';`);
                }
            }

            lines.push("");
        }
    }

    /**
     * Get current exports (for testing/debugging)
     */
    getExports(): Map<string, string> {
        return new Map(this.exports);
    }

    /**
     * Get current namespaces (for testing/debugging)
     */
    getNamespaces(): Map<string, string> {
        return new Map(this.namespaces);
    }

    /**
     * Get current re-exports (for testing/debugging)
     */
    getReExports(): Map<string, string> {
        return new Map(this.reExports);
    }
}
