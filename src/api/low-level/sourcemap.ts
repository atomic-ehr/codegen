/**
 * Source Map Generation Support
 *
 * Provides source map generation for generated code to enable proper debugging
 * and error reporting. Supports Source Map v3 specification with accurate
 * mapping between original TypeSchema and generated code.
 */

import type { ASTNode, Position } from "./ast";
import type { CodeFragment } from "./fragment";

/**
 * Source map mapping entry
 */
export interface SourceMapMapping {
	generatedLine: number;
	generatedColumn: number;
	originalLine?: number;
	originalColumn?: number;
	source?: string;
	name?: string;
}

/**
 * Source map file information
 */
export interface SourceMapSource {
	filename: string;
	content?: string;
	sourceRoot?: string;
}

/**
 * Complete source map data structure
 */
export interface SourceMap {
	version: number;
	file: string;
	sourceRoot?: string;
	sources: string[];
	sourcesContent?: string[];
	names: string[];
	mappings: string;
	x_google_linecount?: number;
}

/**
 * Source map generation options
 */
export interface SourceMapOptions {
	file: string;
	sourceRoot?: string;
	includeSourcesContent?: boolean;
	includeNames?: boolean;
	enableInlineSourceMap?: boolean;
	outputSourceMapFile?: string;
}

/**
 * Source mapping context
 */
export interface MappingContext {
	currentLine: number;
	currentColumn: number;
	sources: Map<string, number>;
	names: Map<string, number>;
	mappings: SourceMapMapping[];
	generatedCode: string[];
}

/**
 * Source map generator for code generation debugging
 */
export class SourceMapGenerator {
	private context: MappingContext;
	private options: Required<SourceMapOptions>;

	constructor(options: SourceMapOptions) {
		this.options = {
			sourceRoot: "",
			includeSourcesContent: true,
			includeNames: true,
			enableInlineSourceMap: false,
			outputSourceMapFile: `${options.file}.map`,
			...options,
		};

		this.context = {
			currentLine: 1,
			currentColumn: 0,
			sources: new Map(),
			names: new Map(),
			mappings: [],
			generatedCode: [],
		};
	}

	/**
	 * Add a mapping between generated and original code
	 */
	addMapping(
		generatedLine: number,
		generatedColumn: number,
		originalSource?: string,
		originalLine?: number,
		originalColumn?: number,
		name?: string,
	): void {
		const mapping: SourceMapMapping = {
			generatedLine,
			generatedColumn,
			originalLine,
			originalColumn,
			source: originalSource,
			name,
		};

		// Register source
		if (originalSource && !this.context.sources.has(originalSource)) {
			this.context.sources.set(originalSource, this.context.sources.size);
		}

		// Register name
		if (name && !this.context.names.has(name)) {
			this.context.names.set(name, this.context.names.size);
		}

		this.context.mappings.push(mapping);
	}

	/**
	 * Add mappings from AST node
	 */
	addNodeMapping(
		node: ASTNode,
		generatedLine: number,
		generatedColumn: number,
	): void {
		if (node.sourceRange) {
			this.addMapping(
				generatedLine,
				generatedColumn,
				node.sourceRange.filename,
				node.sourceRange.start.line,
				node.sourceRange.start.column,
				this.getNodeName(node),
			);
		}
	}

	/**
	 * Add mappings from code fragment
	 */
	addFragmentMapping(
		fragment: CodeFragment,
		startLine: number,
		startColumn: number,
	): void {
		if (fragment.sourceRange) {
			this.addMapping(
				startLine,
				startColumn,
				fragment.sourceRange.filename,
				fragment.sourceRange.start.line,
				fragment.sourceRange.start.column,
			);
		}
	}

	/**
	 * Track generated code
	 */
	addGeneratedCode(code: string): void {
		const lines = code.split("\n");

		lines.forEach((line, index) => {
			if (index === 0) {
				// First line continues current line
				this.context.generatedCode[this.context.currentLine - 1] =
					(this.context.generatedCode[this.context.currentLine - 1] || "") +
					line;
				this.context.currentColumn += line.length;
			} else {
				// New lines
				this.context.generatedCode.push(line);
				this.context.currentLine++;
				this.context.currentColumn = line.length;
			}
		});

		// If we added multiple lines, we're at the end of the last line
		if (lines.length > 1) {
			this.context.currentLine = this.context.generatedCode?.length || 0;
			this.context.currentColumn = lines[lines.length - 1]?.length || 0;
		}
	}

	/**
	 * Generate the complete source map
	 */
	generateSourceMap(): SourceMap {
		const sources = Array.from(this.context.sources.keys());
		const names = Array.from(this.context.names.keys());

		return {
			version: 3,
			file: this.options.file,
			sourceRoot: this.options.sourceRoot,
			sources,
			sourcesContent: this.options.includeSourcesContent
				? sources
						.map((source) => this.getSourceContent(source))
						.filter((content): content is string => content !== null)
				: undefined,
			names: this.options.includeNames ? names : [],
			mappings: this.encodeMappings(),
		};
	}

	/**
	 * Generate inline source map comment
	 */
	generateInlineSourceMap(): string {
		const sourceMap = this.generateSourceMap();
		const encoded = Buffer.from(JSON.stringify(sourceMap)).toString("base64");
		return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}`;
	}

	/**
	 * Generate source map file reference comment
	 */
	generateSourceMapComment(): string {
		return `//# sourceMappingURL=${this.options.outputSourceMapFile}`;
	}

	/**
	 * Get current position
	 */
	getCurrentPosition(): Position {
		return {
			line: this.context.currentLine,
			column: this.context.currentColumn,
			offset: this.calculateOffset(),
		};
	}

	/**
	 * Reset the generator
	 */
	reset(): void {
		this.context = {
			currentLine: 1,
			currentColumn: 0,
			sources: new Map(),
			names: new Map(),
			mappings: [],
			generatedCode: [],
		};
	}

	/**
	 * Create a child generator for nested generation
	 */
	createChild(options: Partial<SourceMapOptions> = {}): SourceMapGenerator {
		return new SourceMapGenerator({
			...this.options,
			...options,
		});
	}

	// Private methods

	private getNodeName(node: ASTNode): string | undefined {
		switch (node.kind) {
			case "InterfaceDeclaration":
				return (node as any).name;
			case "PropertySignature":
				return (node as any).name;
			case "ImportDeclaration":
				return "import";
			case "ExportDeclaration":
				return "export";
			default:
				return node.kind;
		}
	}

	private getSourceContent(_source: string): string | null {
		// In a real implementation, this would read the original source file
		// For now, return null to indicate content is not available
		return null;
	}

	private calculateOffset(): number {
		let offset = 0;
		for (let i = 0; i < this.context.currentLine - 1; i++) {
			offset += (this.context.generatedCode[i]?.length || 0) + 1; // +1 for newline
		}
		offset += this.context.currentColumn;
		return offset;
	}

	private encodeMappings(): string {
		// Sort mappings by generated position
		const sortedMappings = [...this.context.mappings].sort((a, b) => {
			if (a.generatedLine !== b.generatedLine) {
				return a.generatedLine - b.generatedLine;
			}
			return a.generatedColumn - b.generatedColumn;
		});

		const vlq = new VLQEncoder();
		let result = "";
		let previousGeneratedColumn = 0;
		let previousGeneratedLine = 1;
		let previousOriginalColumn = 0;
		let previousOriginalLine = 0;
		let previousOriginalSource = 0;
		let previousName = 0;

		sortedMappings.forEach((mapping) => {
			// Add line separators
			while (previousGeneratedLine < mapping.generatedLine) {
				result += ";";
				previousGeneratedColumn = 0;
				previousGeneratedLine++;
			}

			// Add comma separator if not first mapping on line
			if (previousGeneratedColumn > 0) {
				result += ",";
			}

			// Generated column (relative to previous)
			result += vlq.encode(mapping.generatedColumn - previousGeneratedColumn);
			previousGeneratedColumn = mapping.generatedColumn;

			if (
				mapping.source !== undefined &&
				mapping.originalLine !== undefined &&
				mapping.originalColumn !== undefined
			) {
				// Source index
				const sourceIndex = this.context.sources.get(mapping.source) || 0;
				result += vlq.encode(sourceIndex - previousOriginalSource);
				previousOriginalSource = sourceIndex;

				// Original line (relative to previous)
				result += vlq.encode(mapping.originalLine - previousOriginalLine);
				previousOriginalLine = mapping.originalLine;

				// Original column (relative to previous)
				result += vlq.encode(mapping.originalColumn - previousOriginalColumn);
				previousOriginalColumn = mapping.originalColumn;

				// Name index (optional)
				if (mapping.name !== undefined) {
					const nameIndex = this.context.names.get(mapping.name) || 0;
					result += vlq.encode(nameIndex - previousName);
					previousName = nameIndex;
				}
			}
		});

		return result;
	}
}

/**
 * Variable Length Quantity (VLQ) encoder for source maps
 */
class VLQEncoder {
	private static readonly BASE64_CHARS =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	private static readonly VLQ_BASE = 32;
	private static readonly VLQ_BASE_SHIFT = 5;
	private static readonly VLQ_BASE_MASK = VLQEncoder.VLQ_BASE - 1;
	private static readonly VLQ_CONTINUATION_BIT = VLQEncoder.VLQ_BASE;

	encode(value: number): string {
		let encoded = "";
		let vlq = value < 0 ? (-value << 1) + 1 : value << 1;

		do {
			let digit = vlq & VLQEncoder.VLQ_BASE_MASK;
			vlq >>>= VLQEncoder.VLQ_BASE_SHIFT;

			if (vlq > 0) {
				digit |= VLQEncoder.VLQ_CONTINUATION_BIT;
			}

			encoded += VLQEncoder.BASE64_CHARS[digit];
		} while (vlq > 0);

		return encoded;
	}

	decode(encoded: string): number[] {
		const values: number[] = [];
		let index = 0;

		while (index < encoded.length) {
			let vlq = 0;
			let shift = 0;
			let continuation = true;

			while (continuation) {
				if (index >= encoded.length) {
					throw new Error("Unexpected end of VLQ data");
				}

				const char = encoded[index++];
				if (!char) break;
				const digit = VLQEncoder.BASE64_CHARS.indexOf(char);

				if (digit === -1) {
					throw new Error(`Invalid VLQ character: ${char}`);
				}

				continuation = (digit & VLQEncoder.VLQ_CONTINUATION_BIT) !== 0;
				vlq += (digit & VLQEncoder.VLQ_BASE_MASK) << shift;
				shift += VLQEncoder.VLQ_BASE_SHIFT;
			}

			const value = (vlq & 1) === 1 ? -(vlq >>> 1) : vlq >>> 1;
			values.push(value);
		}

		return values;
	}
}

/**
 * Source map builder for complex generation scenarios
 */
export class SourceMapBuilder {
	private generators: Map<string, SourceMapGenerator> = new Map();
	private mainGenerator: SourceMapGenerator;

	constructor(mainFile: string, options: Partial<SourceMapOptions> = {}) {
		this.mainGenerator = new SourceMapGenerator({
			file: mainFile,
			...options,
		});
		this.generators.set(mainFile, this.mainGenerator);
	}

	/**
	 * Create a generator for a specific file
	 */
	createGenerator(
		filename: string,
		options: Partial<SourceMapOptions> = {},
	): SourceMapGenerator {
		const generator = new SourceMapGenerator({
			file: filename,
			...options,
		});
		this.generators.set(filename, generator);
		return generator;
	}

	/**
	 * Get generator for a file
	 */
	getGenerator(filename: string): SourceMapGenerator | undefined {
		return this.generators.get(filename);
	}

	/**
	 * Get the main generator
	 */
	getMainGenerator(): SourceMapGenerator {
		return this.mainGenerator;
	}

	/**
	 * Generate all source maps
	 */
	generateAll(): Map<string, SourceMap> {
		const sourceMaps = new Map<string, SourceMap>();

		for (const [filename, generator] of this.generators) {
			sourceMaps.set(filename, generator.generateSourceMap());
		}

		return sourceMaps;
	}

	/**
	 * Generate source maps for fragments
	 */
	generateForFragments(fragments: CodeFragment[]): Map<string, SourceMap> {
		const sourceMaps = new Map<string, SourceMap>();

		// Group fragments by target file
		const fragmentsByFile = new Map<string, CodeFragment[]>();

		fragments.forEach((fragment) => {
			const targetFile = fragment.metadata?.targetFile || "generated.ts";
			if (!fragmentsByFile.has(targetFile)) {
				fragmentsByFile.set(targetFile, []);
			}
			fragmentsByFile.get(targetFile)?.push(fragment);
		});

		// Generate source maps for each file
		fragmentsByFile.forEach((fileFragments, filename) => {
			const generator =
				this.getGenerator(filename) || this.createGenerator(filename);

			let currentLine = 1;
			let currentColumn = 0;

			fileFragments.forEach((fragment) => {
				// Add mapping for fragment start
				generator.addFragmentMapping(fragment, currentLine, currentColumn);

				// Track generated code
				generator.addGeneratedCode(fragment.content);

				// Update position
				const lines = fragment.content.split("\n");
				if (lines.length > 1) {
					currentLine += lines.length - 1;
					currentColumn = lines[lines.length - 1]?.length || 0;
				} else {
					currentColumn += fragment.content.length;
				}
			});

			sourceMaps.set(filename, generator.generateSourceMap());
		});

		return sourceMaps;
	}

	/**
	 * Create combined source map for multiple files
	 */
	createCombinedSourceMap(targetFile: string): SourceMap {
		const combinedGenerator = new SourceMapGenerator({ file: targetFile });
		const allSources = new Set<string>();
		const allNames = new Set<string>();

		// Collect all sources and names
		for (const generator of this.generators.values()) {
			const sourceMap = generator.generateSourceMap();
			sourceMap.sources.forEach((source) => allSources.add(source));
			sourceMap.names.forEach((name) => allNames.add(name));
		}

		// Generate combined mappings
		let currentLine = 1;
		let currentColumn = 0;

		for (const [filename, generator] of this.generators) {
			const _sourceMap = generator.generateSourceMap();

			// Add file header comment
			const headerComment = `// From: ${filename}\n`;
			combinedGenerator.addGeneratedCode(headerComment);
			currentLine += 1;
			currentColumn = 0;

			// Add original mappings with offset
			// This is a simplified version - real implementation would parse mappings
			combinedGenerator.addMapping(currentLine, currentColumn, filename, 1, 0);

			// Add the generated content
			// In practice, you'd get the actual generated content and add proper mappings
			currentLine += 10; // Placeholder increment
		}

		return combinedGenerator.generateSourceMap();
	}
}

/**
 * Utility functions for source map handling
 */
export namespace SourceMapUtils {
	/**
	 * Parse a source map from JSON string
	 */
	export function parseSourceMap(json: string): SourceMap {
		const parsed = JSON.parse(json);

		if (parsed.version !== 3) {
			throw new Error(`Unsupported source map version: ${parsed.version}`);
		}

		return parsed as SourceMap;
	}

	/**
	 * Merge multiple source maps
	 */
	export function mergeSourceMaps(sourceMaps: SourceMap[]): SourceMap {
		if (sourceMaps.length === 0) {
			throw new Error("Cannot merge empty source map array");
		}

		if (sourceMaps.length === 1) {
			return sourceMaps[0]!;
		}

		const firstMap = sourceMaps[0];
		if (!firstMap) {
			throw new Error("No source maps to merge");
		}

		const merged: SourceMap = {
			version: 3,
			file: firstMap.file,
			sources: [],
			names: [],
			mappings: "",
		};

		// Combine sources and names
		const sourceSet = new Set<string>();
		const nameSet = new Set<string>();

		sourceMaps.forEach((map) => {
			if (map) {
				map.sources?.forEach((source) => sourceSet.add(source));
				map.names?.forEach((name) => nameSet.add(name));
			}
		});

		merged.sources = Array.from(sourceSet);
		merged.names = Array.from(nameSet);

		// Merge mappings (simplified - real implementation would be more complex)
		merged.mappings = sourceMaps.map((map) => map.mappings).join(";");

		return merged;
	}

	/**
	 * Extract original position from source map
	 */
	export function getOriginalPosition(
		_sourceMap: SourceMap,
		_generatedLine: number,
		_generatedColumn: number,
	): { source?: string; line?: number; column?: number; name?: string } | null {
		// This would require a full source map decoder implementation
		// For now, return null as placeholder
		return null;
	}

	/**
	 * Validate source map structure
	 */
	export function validateSourceMap(sourceMap: SourceMap): {
		isValid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		if (sourceMap.version !== 3) {
			errors.push(`Invalid version: expected 3, got ${sourceMap.version}`);
		}

		if (!sourceMap.file) {
			errors.push("Missing file property");
		}

		if (!Array.isArray(sourceMap.sources)) {
			errors.push("Sources must be an array");
		}

		if (!Array.isArray(sourceMap.names)) {
			errors.push("Names must be an array");
		}

		if (typeof sourceMap.mappings !== "string") {
			errors.push("Mappings must be a string");
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	}
}
