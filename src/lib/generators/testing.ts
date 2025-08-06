/**
 * Generator Testing Utilities
 *
 * Utilities for testing generators and the registry system
 */

import type { Generator, GeneratorOptions } from "./base";
import { GeneratorRegistry } from "./generator-registry";
import { resetInitialization } from "./init";
import type {
	GeneratorFactory,
	GeneratorMetadata,
	GeneratorPlugin,
} from "./registry";

/**
 * Test generator options
 */
export interface TestGeneratorOptions extends GeneratorOptions {
	/** Test-specific options */
	testMode?: boolean;
	/** Mock file system operations */
	mockFileSystem?: boolean;
}

/**
 * Mock generator for testing
 */
export class MockGenerator implements Generator {
	readonly name = "mock";
	readonly target = "mock";

	public generatedFiles: Array<{ path: string; content: string }> = [];
	public validateCalled = false;
	public cleanupCalled = false;

	constructor(private options: TestGeneratorOptions) {}

	async generate(): Promise<void> {
		this.generatedFiles.push({
			path: "mock-output.txt",
			content: "Mock generated content",
		});
	}

	async validate(): Promise<void> {
		this.validateCalled = true;
		if (!this.options.outputDir) {
			throw new Error("Output directory is required");
		}
	}

	async cleanup(): Promise<void> {
		this.cleanupCalled = true;
		this.generatedFiles = [];
	}
}

/**
 * Create a mock generator metadata
 */
export function createMockGeneratorMetadata(
	overrides: Partial<GeneratorMetadata> = {},
): GeneratorMetadata {
	return {
		id: "mock",
		name: "Mock Generator",
		target: "mock",
		version: "1.0.0",
		description: "Mock generator for testing",
		builtin: false,
		...overrides,
	};
}

/**
 * Create a mock generator factory
 */
export function createMockGeneratorFactory(
	generatorClass: new (options: GeneratorOptions) => Generator = MockGenerator,
): GeneratorFactory {
	return (options: GeneratorOptions) => new generatorClass(options);
}

/**
 * Create a mock generator plugin
 */
export function createMockGeneratorPlugin(
	overrides: Partial<GeneratorPlugin> = {},
): GeneratorPlugin {
	return {
		metadata: createMockGeneratorMetadata(overrides.metadata),
		createGenerator: createMockGeneratorFactory(),
		...overrides,
	};
}

/**
 * Test registry with isolated state
 */
export class TestGeneratorRegistry extends GeneratorRegistry {
	constructor() {
		super();
	}

	/**
	 * Reset the registry to clean state
	 */
	reset(): void {
		this.clear();
	}

	/**
	 * Get the number of registered generators
	 */
	getRegisteredCount(): number {
		return this.list().length;
	}

	/**
	 * Check if a specific generator is registered
	 */
	isRegistered(id: string): boolean {
		return this.has(id);
	}
}

/**
 * Create a test registry with mock generators
 */
export function createTestRegistry(): TestGeneratorRegistry {
	const registry = new TestGeneratorRegistry();

	// Register a default mock generator
	registry.register(
		createMockGeneratorMetadata(),
		createMockGeneratorFactory(),
	);

	return registry;
}

/**
 * Test fixture for generator testing
 */
export class GeneratorTestFixture {
	public registry: TestGeneratorRegistry;
	public tempDir: string;

	constructor() {
		this.registry = createTestRegistry();
		this.tempDir = "/tmp/generator-test";
	}

	/**
	 * Set up the test fixture
	 */
	async setup(): Promise<void> {
		// Reset initialization state
		resetInitialization();

		// Create temp directory
		await Bun.$`mkdir -p ${this.tempDir}`.quiet();
	}

	/**
	 * Clean up the test fixture
	 */
	async cleanup(): Promise<void> {
		// Clean up temp directory
		await Bun.$`rm -rf ${this.tempDir}`.quiet();

		// Reset registry
		this.registry.reset();

		// Reset initialization state
		resetInitialization();
	}

	/**
	 * Create a generator with test options
	 */
	async createGenerator(
		id: string,
		options: Partial<TestGeneratorOptions> = {},
	): Promise<Generator> {
		const fullOptions: TestGeneratorOptions = {
			outputDir: this.tempDir,
			testMode: true,
			mockFileSystem: true,
			...options,
		};

		return this.registry.create(id, fullOptions);
	}

	/**
	 * Register a test generator
	 */
	registerTestGenerator(
		metadata: Partial<GeneratorMetadata> = {},
		factory?: GeneratorFactory,
	): void {
		const fullMetadata = createMockGeneratorMetadata(metadata);
		const generatorFactory = factory || createMockGeneratorFactory();

		this.registry.register(fullMetadata, generatorFactory);
	}

	/**
	 * Register a test plugin
	 */
	registerTestPlugin(plugin: Partial<GeneratorPlugin> = {}): void {
		const fullPlugin = createMockGeneratorPlugin(plugin);
		this.registry.registerPlugin(fullPlugin);
	}
}

/**
 * Create a test fixture
 */
export function createTestFixture(): GeneratorTestFixture {
	return new GeneratorTestFixture();
}

/**
 * Test helper to run a generator test
 */
export async function runGeneratorTest<T>(
	testFn: (fixture: GeneratorTestFixture) => Promise<T>,
): Promise<T> {
	const fixture = createTestFixture();

	try {
		await fixture.setup();
		return await testFn(fixture);
	} finally {
		await fixture.cleanup();
	}
}

/**
 * Assert that a generator produces expected output
 */
export async function assertGeneratorOutput(
	generator: Generator,
	expectedFiles: Array<{ path: string; content?: string }>,
): Promise<void> {
	await generator.generate();

	if (generator instanceof MockGenerator) {
		const actualFiles = generator.generatedFiles;

		if (actualFiles.length !== expectedFiles.length) {
			throw new Error(
				`Expected ${expectedFiles.length} files, got ${actualFiles.length}`,
			);
		}

		for (let i = 0; i < expectedFiles.length; i++) {
			const expected = expectedFiles[i];
			const actual = actualFiles[i];

			if (actual.path !== expected.path) {
				throw new Error(
					`Expected file path '${expected.path}', got '${actual.path}'`,
				);
			}

			if (expected.content && actual.content !== expected.content) {
				throw new Error(
					`Expected file content '${expected.content}', got '${actual.content}'`,
				);
			}
		}
	}
}

/**
 * Assert that a generator validation works correctly
 */
export async function assertGeneratorValidation(
	generator: Generator,
	shouldPass: boolean = true,
): Promise<void> {
	if (!generator.validate) {
		if (!shouldPass) {
			throw new Error(
				"Expected validation to fail, but no validate method exists",
			);
		}
		return;
	}

	try {
		await generator.validate();
		if (!shouldPass) {
			throw new Error("Expected validation to fail, but it passed");
		}
	} catch (error) {
		if (shouldPass) {
			throw new Error(
				`Expected validation to pass, but it failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
