import fs from 'node:fs';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as process from 'node:process';
import type { Generator, GeneratorOptions } from './generators/generator';

/**
 * Custom error class for generator-related errors.
 */
export class GeneratorError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GeneratorError';
    }
}

/**
 * Type definition for the generator creator function.
 */
export type GeneratorCreator = (options: GeneratorOptions) => Generator;

/**
 * Interface for generator metadata.
 */
export interface GeneratorInfo {
    /** Name of the generator (used as CLI argument) */
    name: string;
    /** Display name for the generator (used in help text) */
    displayName: string;
    /** Description of the generator */
    description: string;
    /** Whether it's a built-in generator or external */
    isBuiltIn: boolean;
    /** Path to the generator module (for external generators) */
    path?: string;
    /** The function that creates the generator instance */
    createGenerator?: GeneratorCreator;
}

/**
 * Registry for code generators.
 * Manages built-in generators and discovers custom generators from filesystem.
 */
export class GeneratorsRegistry {
    /** Map of registered generators by name */
    private generators: Map<string, GeneratorInfo> = new Map();
    /** Locations to search for custom generators */
    private customGeneratorPaths: string[] = [];
    /** Whether the registry has been initialized */
    private initialized = false;

    /**
     * Creates a new GeneratorsRegistry instance.
     */
    constructor() {
        // Add default search paths for custom generators
        this.customGeneratorPaths = [
            // Global installations
            path.join(os.homedir(), '.fhirschema', 'generators'),
            // Local installations (current working directory)
            path.join(process.cwd(), 'fhirschema-generators'),
            path.join(process.cwd(), '.fhirschema', 'generators'),
        ];
    }

    /**
     * Registers a built-in generator.
     * @param name - Name of the generator
     * @param displayName - Display name for the generator
     * @param description - Description of the generator
     */
    registerBuiltIn(name: string, displayName: string, description: string): void {
        this.generators.set(name, {
            name,
            displayName,
            description,
            isBuiltIn: true,
        });
    }

    /**
     * Registers the default built-in generators.
     */
    registerDefaultBuiltIns(): void {
        this.registerBuiltIn('mustache', 'Mustache', 'Generates using mustache template engine');
        this.registerBuiltIn(
            'typescript',
            'TypeScript',
            'Generates TypeScript interfaces for FHIR resources',
        );
        this.registerBuiltIn('csharp', 'C#', 'Generates C# classes for FHIR resources');
        this.registerBuiltIn('python', 'Python', 'Generates Python classes for FHIR resources');
    }

    /**
     * Adds a custom path to search for generators.
     * @param dirPath - Directory path to search for generators
     */
    addCustomGeneratorPath(dirPath: string): void {
        if (!this.customGeneratorPaths.includes(dirPath)) {
            this.customGeneratorPaths.push(dirPath);
        }
    }

    /**
     * Checks if a generator with the given name already exists as a built-in generator.
     * @param name - Name to check
     * @returns True if a built-in generator with this name exists
     */
    isBuiltInGeneratorName(name: string): boolean {
        const generator = this.generators.get(name);
        return generator?.isBuiltIn ?? false;
    }

    /**
     * Checks if a generator with the given name exists (built-in or custom).
     * @param name - Name to check
     * @returns True if a generator with this name exists
     */
    hasGenerator(name: string): boolean {
        return this.generators.has(name);
    }

    /**
     * Discovers and registers custom generators from the filesystem.
     */
    async discoverCustomGenerators(): Promise<void> {
        for (const basePath of this.customGeneratorPaths) {
            if (!existsSync(basePath)) {
                continue;
            }

            try {
                const entries = await fs.promises.readdir(basePath, { withFileTypes: true });

                for (const entry of entries) {
                    if (!entry.isDirectory()) {
                        continue;
                    }

                    const packageJsonPath = path.join(basePath, 'package.json');

                    if (!existsSync(packageJsonPath)) {
                        continue;
                    }

                    try {
                        const packageJson = JSON.parse(
                            await fs.promises.readFile(packageJsonPath, 'utf-8'),
                        );

                        if (
                            packageJson.name &&
                            packageJson.description &&
                            packageJson.main &&
                            packageJson.keywords &&
                            packageJson.keywords.includes('fhirschema-generator')
                        ) {
                            // Skip if a built-in generator with the same name already exists
                            if (this.isBuiltInGeneratorName(entry.name)) {
                                // Silently skip to avoid conflicts
                                continue;
                            }

                            this.generators.set(basePath, {
                                name: path.basename(basePath),
                                displayName: packageJson.displayName || packageJson.name,
                                description: packageJson.description,
                                isBuiltIn: false,
                                path: basePath,
                            });
                        }
                    } catch (error) {
                        // Silently ignore errors when loading individual generators
                    }
                }
            } catch (error) {
                // Silently ignore errors when reading directories
            }
        }
    }

    /**
     * Initializes the registry by registering built-in generators and discovering custom ones.
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        this.registerDefaultBuiltIns();
        await this.discoverCustomGenerators();

        this.initialized = true;
    }

    /**
     * Gets all registered generators.
     * @returns Array of generator information
     */
    getAll(): GeneratorInfo[] {
        return Array.from(this.generators.values());
    }

    /**
     * Gets information about a specific generator.
     * @param name - Name of the generator
     * @returns Generator information or undefined if not found
     */
    get(name: string, customGeneratorPath?: string): GeneratorInfo | undefined {
        if (customGeneratorPath) {
            return this.generators.get(customGeneratorPath);
        }

        return this.generators.get(name);
    }

    /**
     * Gets a list of all generator names for CLI options.
     * @returns Array of generator names
     */
    getGeneratorNames(): string[] {
        return Array.from(this.generators.keys());
    }

    /**
     * Loads a generator module by name.
     * @param name - Name of the generator to load
     * @returns Promise resolving to the generator creator function
     * @throws GeneratorError if generator not found or failed to load
     */
    async loadGenerator(name: string): Promise<GeneratorCreator> {
        const generatorInfo = this.generators.get(name);

        if (!generatorInfo) {
            throw new GeneratorError(`Generator '${name}' not found`);
        }

        if (generatorInfo.createGenerator) {
            return generatorInfo.createGenerator;
        }

        try {
            let modulePath: string;

            if (generatorInfo.isBuiltIn) {
                // Built-in generator
                const extension = process.argv?.[1].endsWith('ts') ? 'ts' : 'js';
                modulePath = path.resolve(__dirname, 'generators', name, `index.${extension}`);
            } else if (generatorInfo.path) {
                // Custom generator
                const packageJson = JSON.parse(
                    await fs.promises.readFile(
                        path.join(generatorInfo.path, 'package.json'),
                        'utf-8',
                    ),
                );

                modulePath = path.resolve(generatorInfo.path, packageJson.main);
            } else {
                throw new GeneratorError(`Invalid generator configuration for '${name}'`);
            }

            if (!existsSync(modulePath)) {
                throw new GeneratorError(`Generator module not found at ${modulePath}`);
            }

            const generatorModule = await import(modulePath);

            if (!generatorModule.createGenerator) {
                throw new GeneratorError(
                    `Generator '${name}' does not export a createGenerator function`,
                );
            }

            // Cache the creator function for future use
            generatorInfo.createGenerator = generatorModule.createGenerator;
            this.generators.set(name, generatorInfo);

            return generatorModule.createGenerator;
        } catch (error) {
            if (error instanceof GeneratorError) {
                throw error;
            }
            throw new GeneratorError(
                `Failed to load generator '${name}': ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Creates a generator instance by name with the given options.
     * @param name - Name of the generator to create
     * @param options - Options for the generator
     * @returns Promise resolving to the generator instance
     * @throws GeneratorError if generator not found or failed to load
     */
    async createGenerator(name: string, options: GeneratorOptions): Promise<Generator> {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            const createGeneratorFn = await this.loadGenerator(name);
            return createGeneratorFn(options);
        } catch (error) {
            if (error instanceof GeneratorError) {
                throw error;
            }
            throw new GeneratorError(
                `Failed to create generator '${name}': ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    /**
     * Validates a generator name to ensure it meets naming requirements.
     * @param name - Name to validate
     * @returns An object with validation result and optional error message
     */
    validateGeneratorName(name: string): { isValid: boolean; error?: string } {
        // Check for conflicts with built-in generators
        if (this.isBuiltInGeneratorName(name)) {
            return {
                isValid: false,
                error: `Cannot use name '${name}' because it conflicts with a built-in generator.`,
            };
        }

        // Check for invalid characters
        if (!/^[a-z0-9-]+$/.test(name)) {
            return {
                isValid: false,
                error: 'Generator name must contain only lowercase letters, numbers, and hyphens.',
            };
        }

        // Check for reserved words
        const reservedWords = ['node', 'npm', 'fhirschema', 'fhir', 'schema', 'codegen'];
        if (reservedWords.includes(name)) {
            return {
                isValid: false,
                error: `'${name}' is a reserved word and cannot be used as a generator name.`,
            };
        }

        return { isValid: true };
    }
}

// Export a singleton instance
export const generatorsRegistry = new GeneratorsRegistry();
