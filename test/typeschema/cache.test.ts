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
		cache = new TypeSchemaCache();
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

		test("should return null for non-existent schema", () => {
			const retrieved = cache.get(sampleSchema.identifier);
			expect(retrieved).toBe(null);
		});

		test("should return false when deleting non-existent schema", () => {
			const deleted = cache.delete(sampleSchema.identifier);
			expect(deleted).toBe(false);
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

			expect(resources[0]?.identifier.name).toBe("Patient");
			expect(complexTypes[0]?.identifier.name).toBe("HumanName");
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

	test("should initialize global cache", () => {
		const cache = initializeGlobalCache();
		expect(cache).toBeInstanceOf(TypeSchemaCache);
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

	test("should clear global cache", () => {
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

		cacheSchema(sampleSchema);
		expect(isCached(sampleSchema.identifier)).toBe(true);

		clearGlobalCache();
		expect(isCached(sampleSchema.identifier)).toBe(false);
	});
});
