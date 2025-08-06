/**
 * Generator Registry System Tests
 */

import { test, expect } from "bun:test";
import {
  GeneratorRegistry,
  createMockGeneratorMetadata,
  createMockGeneratorFactory,
  runGeneratorTest,
  MockGenerator
} from "../src/lib/generators";

test("GeneratorRegistry - basic functionality", async () => {
  const registry = new GeneratorRegistry();

  // Test empty registry
  expect(registry.list()).toHaveLength(0);
  expect(registry.has("nonexistent")).toBe(false);

  // Register a generator
  const metadata = createMockGeneratorMetadata({
    id: "test-gen",
    name: "Test Generator"
  });
  const factory = createMockGeneratorFactory();

  registry.register(metadata, factory);

  // Test registry after registration
  expect(registry.list()).toHaveLength(1);
  expect(registry.has("test-gen")).toBe(true);

  const entry = registry.get("test-gen");
  expect(entry).toBeDefined();
  expect(entry?.metadata.id).toBe("test-gen");
  expect(entry?.metadata.name).toBe("Test Generator");
});

test("GeneratorRegistry - create generator instance", async () => {
  const registry = new GeneratorRegistry();

  const metadata = createMockGeneratorMetadata({
    id: "mock-gen",
    name: "Mock Generator"
  });
  const factory = createMockGeneratorFactory();

  registry.register(metadata, factory);

  // Create generator instance
  const generator = await registry.create("mock-gen", {
    outputDir: "/tmp/test"
  });

  expect(generator).toBeInstanceOf(MockGenerator);
  expect(generator.name).toBe("mock");
  expect(generator.target).toBe("mock");
});

test("GeneratorRegistry - error handling", async () => {
  const registry = new GeneratorRegistry();

  // Test generator not found
  try {
    await registry.create("nonexistent", { outputDir: "/tmp" });
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect(error.message).toContain("Generator not found: nonexistent");
  }

  // Test duplicate registration
  const metadata = createMockGeneratorMetadata({ id: "duplicate" });
  const factory = createMockGeneratorFactory();

  registry.register(metadata, factory);

  try {
    registry.register(metadata, factory);
    expect(true).toBe(false); // Should not reach here
  } catch (error) {
    expect(error.message).toContain("Generator already registered: duplicate");
  }
});

test("MockGenerator functionality", async () => {
  await runGeneratorTest(async (fixture) => {
    const generator = await fixture.createGenerator("mock");

    expect(generator).toBeInstanceOf(MockGenerator);

    // Test generation
    await generator.generate();

    const mockGen = generator as MockGenerator;
    expect(mockGen.generatedFiles).toHaveLength(1);
    expect(mockGen.generatedFiles[0].path).toBe("mock-output.txt");
    expect(mockGen.generatedFiles[0].content).toBe("Mock generated content");

    // Test validation
    await generator.validate?.();
    expect(mockGen.validateCalled).toBe(true);

    // Test cleanup
    await generator.cleanup?.();
    expect(mockGen.cleanupCalled).toBe(true);
    expect(mockGen.generatedFiles).toHaveLength(0);
  });
});

test("Registry filtering and listing", async () => {
  const registry = new GeneratorRegistry();

  // Register multiple generators
  registry.register(
    createMockGeneratorMetadata({ id: "ts-gen", target: "typescript", builtin: true }),
    createMockGeneratorFactory()
  );

  registry.register(
    createMockGeneratorMetadata({ id: "js-gen", target: "javascript", builtin: false }),
    createMockGeneratorFactory()
  );

  registry.register(
    createMockGeneratorMetadata({ id: "py-gen", target: "python", builtin: false }),
    createMockGeneratorFactory()
  );

  // Test listing all
  const all = registry.list();
  expect(all).toHaveLength(3);

  // Test filtering by target
  const tsGens = registry.listByTarget("typescript");
  expect(tsGens).toHaveLength(1);
  expect(tsGens[0].id).toBe("ts-gen");

  const jsGens = registry.listByTarget("javascript");
  expect(jsGens).toHaveLength(1);
  expect(jsGens[0].id).toBe("js-gen");

  // Test filtering by builtin status
  const builtins = all.filter(g => g.builtin);
  expect(builtins).toHaveLength(1);
  expect(builtins[0].id).toBe("ts-gen");

  const plugins = all.filter(g => !g.builtin);
  expect(plugins).toHaveLength(2);
});
