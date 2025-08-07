/**
 * Tests for TypeSchema Cache System
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
	TypeSchemaCache,
	getGlobalCache,
	initializeGlobalCache,
	clearGlobalCache,
	cacheSchema,
	getCachedSchema,
	isCached,
} from "../../src/typeschema/cache";
import type { AnyTypeSchema } from "../../src/typeschema/types";

describe("TypeSchemaCache", () => {
	let cache: TypeSchemaCache;

	const sampleSchema: AnyTypeSchema = {
		identifier: {
			kind: "resource",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "Patient",
			url: "http://hl7.org/fhir/StructureDefinition/Patient",
		},
		fields: {},
		dependencies: [],
	};

	const anotherSchema: AnyTypeSchema = {
		identifier: {
			kind: "complex-type",
			package: "hl7.fhir.r4.core",
			version: "4.0.1",
			name: "HumanName",
			url: "http://hl7.org/fhir/StructureDefinition/HumanName",
		},
		fields: {},
		dependencies: [],
	};

	beforeEach(() => {
		cache = new TypeSchemaCache({
			enabled: true,
			maxSize: 100,
			ttl: 60000, // 1 minute
		});
	});

	afterEach(() => {
		if (cache) {
			cache.clear();
		}
		clearGlobalCache();
	});

	describe("Basic Cache Operations", () => {
		test("should store and retrieve schema", () => {
			cache.set(sampleSchema);
			const retrieved = cache.get(sampleSchema.identifier);

			expect(retrieved).toEqual(sampleSchema);
		});

		test("should check if schema exists", () => {
			expect(cache.has(sampleSchema.identifier)).toBe(false);

			cache.set(sampleSchema);
			expect(cache.has(sampleSchema.identifier)).toBe(true);
		});

		test("should retrieve schema by URL", () => {
			cache.set(sampleSchema);
			const retrieved = cache.getByUrl(sampleSchema.identifier.url);

			expect(retrieved).toEqual(sampleSchema);
		});

		test("should check if schema exists by URL", () => {
			expect(cache.hasByUrl(sampleSchema.identifier.url)).toBe(false);

			cache.set(sampleSchema);
			expect(cache.hasByUrl(sampleSchema.identifier.url)).toBe(true);
		});

		test("should delete schema", () => {
			cache.set(sampleSchema);
			expect(cache.has(sampleSchema.identifier)).toBe(true);

			const deleted = cache.delete(sampleSchema.identifier);
			expect(deleted).toBe(true);
			expect(cache.has(sampleSchema.identifier)).toBe(false);
		});

		test("should delete schema by URL", () => {
			cache.set(sampleSchema);
			expect(cache.hasByUrl(sampleSchema.identifier.url)).toBe(true);

			const deleted = cache.deleteByUrl(sampleSchema.identifier.url);
			expect(deleted).toBe(true);
			expect(cache.hasByUrl(sampleSchema.identifier.url)).toBe(false);
		});
	});

	describe("Batch Operations", () => {
		test("should store multiple schemas", () => {
			const schemas = [sampleSchema, anotherSchema];
			cache.setMany(schemas);

			expect(cache.has(sampleSchema.identifier)).toBe(true);
			expect(cache.has(anotherSchema.identifier)).toBe(true);
		});

		test("should clear all schemas", () => {
			cache.set(sampleSchema);
			cache.set(anotherSchema);

			expect(cache.has(sampleSchema.identifier)).toBe(true);
			expect(cache.has(anotherSchema.identifier)).toBe(true);

			cache.clear();

			expect(cache.has(sampleSchema.identifier)).toBe(false);
			expect(cache.has(anotherSchema.identifier)).toBe(false);
		});
	});

	describe("Indexing and Searching", () => {
		beforeEach(() => {
			cache.set(sampleSchema);
			cache.set(anotherSchema);
		});

		test("should get schemas by package", () => {
			const coreSchemas = cache.getByPackage("hl7.fhir.r4.core");
			expect(coreSchemas).toHaveLength(2);

			const emptyResult = cache.getByPackage("nonexistent.package");
			expect(emptyResult).toHaveLength(0);
		});

		test("should get schemas by kind", () => {
			const resources = cache.getByKind("resource");
			const complexTypes = cache.getByKind("complex-type");
			const profiles = cache.getByKind("profile");

			expect(resources).toHaveLength(1);
			expect(complexTypes).toHaveLength(1);
			expect(profiles).toHaveLength(0);

			expect(resources[0].identifier.name).toBe("Patient");
			expect(complexTypes[0].identifier.name).toBe("HumanName");
		});
	});

	describe("Cache Options and Configuration", () => {
		test("should respect enabled flag", () => {
			const disabledCache = new TypeSchemaCache({ enabled: false });

			disabledCache.set(sampleSchema);
			expect(disabledCache.has(sampleSchema.identifier)).toBe(false);
		});

		test("should update options", () => {
			const initialOptions = cache.getOptions();
			expect(initialOptions.maxSize).toBe(100);
			expect(initialOptions.ttl).toBe(60000);

			cache.setOptions({
				maxSize: 200,
				ttl: 120000,
			});

			const updatedOptions = cache.getOptions();
			expect(updatedOptions.maxSize).toBe(200);
			expect(updatedOptions.ttl).toBe(120000);
		});

		test("should provide cache statistics", () => {
			cache.set(sampleSchema);
			cache.set(anotherSchema);

			const stats = cache.getStats();
			expect(stats.size).toBe(2);
			expect(stats.maxSize).toBe(100);
		});
	});

	describe("TTL and Expiration", () => {
		test("should expire entries after TTL", async () => {
			const shortTTLCache = new TypeSchemaCache({ ttl: 50 }); // 50ms

			shortTTLCache.set(sampleSchema);
			expect(shortTTLCache.has(sampleSchema.identifier)).toBe(true);

			// Wait for expiration - simple sleep approach
			await Bun.sleep(100); // Wait 100ms for 50ms TTL to expire

			expect(shortTTLCache.has(sampleSchema.identifier)).toBe(false);
		});

		test("should clear expired entries", async () => {
			const shortTTLCache = new TypeSchemaCache({ ttl: 50 });

			shortTTLCache.set(sampleSchema);
			shortTTLCache.set(anotherSchema);

			// Wait for expiration - simple sleep approach
			await Bun.sleep(100); // Wait 100ms for 50ms TTL to expire

			const removedCount = shortTTLCache.clearExpired();
			expect(removedCount).toBe(2);
		});
	});

	describe("LRU Behavior", () => {
		test("should evict least recently used items when at capacity", () => {
			const smallCache = new TypeSchemaCache({ maxSize: 2 });

			const schema1 = { ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Schema1" }};
			const schema2 = { ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Schema2" }};
			const schema3 = { ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Schema3" }};

			smallCache.set(schema1);
			smallCache.set(schema2);
			smallCache.set(schema3); // Should evict schema1

			expect(smallCache.has(schema1.identifier)).toBe(false);
			expect(smallCache.has(schema2.identifier)).toBe(true);
			expect(smallCache.has(schema3.identifier)).toBe(true);
		});

		test("should update LRU order on access", () => {
			const smallCache = new TypeSchemaCache({ maxSize: 2 });

			const schema1 = { ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Schema1" }};
			const schema2 = { ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Schema2" }};
			const schema3 = { ...sampleSchema, identifier: { ...sampleSchema.identifier, name: "Schema3" }};

			smallCache.set(schema1);
			smallCache.set(schema2);

			// Access schema1 to make it most recently used
			smallCache.get(schema1.identifier);

			// Add schema3, should evict schema2 (now least recently used)
			smallCache.set(schema3);

			expect(smallCache.has(schema1.identifier)).toBe(true);
			expect(smallCache.has(schema2.identifier)).toBe(false);
			expect(smallCache.has(schema3.identifier)).toBe(true);
		});
	});
});

describe("Global Cache", () => {
	beforeEach(() => {
		clearGlobalCache();
	});

	afterEach(() => {
		clearGlobalCache();
	});

	test("should provide global cache instance", () => {
		const cache1 = getGlobalCache();
		const cache2 = getGlobalCache();

		expect(cache1).toBe(cache2); // Same instance
	});

	test("should initialize global cache with options", () => {
		const cache = initializeGlobalCache({
			maxSize: 500,
			ttl: 300000,
		});

		const options = cache.getOptions();
		expect(options.maxSize).toBe(500);
		expect(options.ttl).toBe(300000);
	});

	test("convenience functions should work with global cache", () => {
		const sampleSchema: AnyTypeSchema = {
			identifier: {
				kind: "resource",
				package: "hl7.fhir.r4.core",
				version: "4.0.1",
				name: "Patient",
				url: "http://hl7.org/fhir/StructureDefinition/Patient",
			},
			fields: {},
			dependencies: [],
		};

		expect(isCached(sampleSchema.identifier)).toBe(false);

		cacheSchema(sampleSchema);
		expect(isCached(sampleSchema.identifier)).toBe(true);

		const retrieved = getCachedSchema(sampleSchema.identifier);
		expect(retrieved).toEqual(sampleSchema);
	});
});
