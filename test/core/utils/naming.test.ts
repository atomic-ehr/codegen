/**
 * Tests for naming convention utilities
 */

import { describe, it, expect } from "bun:test";
import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  toConstantCase,
  toDotCase,
  toValidIdentifier,
  toValidFileName,
  pluralize,
  singularize,
  isValidIdentifier,
  isReservedWord,
  NamingPatterns,
  clearCache,
  getCacheStats,
} from "../../../src/core/utils/naming";

describe("Naming Convention Utilities", () => {
  describe("toCamelCase", () => {
    it("should convert to camelCase", () => {
      expect(toCamelCase("hello world")).toBe("helloWorld");
      expect(toCamelCase("Hello World")).toBe("helloWorld");
      expect(toCamelCase("hello-world")).toBe("helloWorld");
      expect(toCamelCase("hello_world")).toBe("helloWorld");
      expect(toCamelCase("HelloWorld")).toBe("helloWorld");
    });

    it("should handle empty strings", () => {
      expect(toCamelCase("")).toBe("");
      expect(toCamelCase("   ")).toBe("");
    });

    it("should handle single words", () => {
      expect(toCamelCase("hello")).toBe("hello");
      expect(toCamelCase("HELLO")).toBe("hello");
    });
  });

  describe("toPascalCase", () => {
    it("should convert to PascalCase", () => {
      expect(toPascalCase("hello world")).toBe("HelloWorld");
      expect(toPascalCase("hello-world")).toBe("HelloWorld");
      expect(toPascalCase("hello_world")).toBe("HelloWorld");
      expect(toPascalCase("helloWorld")).toBe("HelloWorld");
    });

    it("should preserve acronyms", () => {
      expect(toPascalCase("XML parser")).toBe("XMLParser");
      expect(toPascalCase("HTTP client")).toBe("HTTPClient");
    });
  });

  describe("toSnakeCase", () => {
    it("should convert to snake_case", () => {
      expect(toSnakeCase("hello world")).toBe("hello_world");
      expect(toSnakeCase("HelloWorld")).toBe("hello_world");
      expect(toSnakeCase("helloWorld")).toBe("hello_world");
      expect(toSnakeCase("hello-world")).toBe("hello_world");
    });
  });

  describe("toKebabCase", () => {
    it("should convert to kebab-case", () => {
      expect(toKebabCase("hello world")).toBe("hello-world");
      expect(toKebabCase("HelloWorld")).toBe("hello-world");
      expect(toKebabCase("helloWorld")).toBe("hello-world");
      expect(toKebabCase("hello_world")).toBe("hello-world");
    });
  });

  describe("toConstantCase", () => {
    it("should convert to CONSTANT_CASE", () => {
      expect(toConstantCase("hello world")).toBe("HELLO_WORLD");
      expect(toConstantCase("HelloWorld")).toBe("HELLO_WORLD");
      expect(toConstantCase("helloWorld")).toBe("HELLO_WORLD");
    });
  });

  describe("toValidIdentifier", () => {
    it("should create valid identifiers", () => {
      expect(toValidIdentifier("hello world")).toBe("HelloWorld");
      expect(toValidIdentifier("123invalid")).toBe("I123invalid");
      expect(toValidIdentifier("")).toBe("IUnknown");
      expect(toValidIdentifier("valid")).toBe("Valid");
    });
  });

  describe("toValidFileName", () => {
    it("should create valid file names", () => {
      expect(toValidFileName("Hello World")).toBe("hello-world");
      expect(toValidFileName("Invalid<>Name")).toBe("invalid-name");
      expect(toValidFileName("")).toBe("unknown");
    });
  });

  describe("pluralize/singularize", () => {
    it("should pluralize words correctly", () => {
      expect(pluralize("cat")).toBe("cats");
      expect(pluralize("box")).toBe("boxes");
      expect(pluralize("city")).toBe("cities");
      expect(pluralize("child")).toBe("children");
      expect(pluralize("person")).toBe("people");
    });

    it("should singularize words correctly", () => {
      expect(singularize("cats")).toBe("cat");
      expect(singularize("boxes")).toBe("box");
      expect(singularize("cities")).toBe("city");
      expect(singularize("children")).toBe("child");
      expect(singularize("people")).toBe("person");
    });
  });

  describe("isValidIdentifier", () => {
    it("should validate TypeScript identifiers", () => {
      expect(isValidIdentifier("validName")).toBe(true);
      expect(isValidIdentifier("_validName")).toBe(true);
      expect(isValidIdentifier("$validName")).toBe(true);
      expect(isValidIdentifier("123invalid")).toBe(false);
      expect(isValidIdentifier("if")).toBe(false); // Reserved word
    });

    it("should validate for different languages", () => {
      expect(isValidIdentifier("validName", "python")).toBe(true);
      expect(isValidIdentifier("$invalid", "python")).toBe(false);
      expect(isValidIdentifier("def", "python")).toBe(false); // Reserved word
    });
  });

  describe("isReservedWord", () => {
    it("should detect reserved words", () => {
      expect(isReservedWord("if", "typescript")).toBe(true);
      expect(isReservedWord("class", "typescript")).toBe(true);
      expect(isReservedWord("def", "python")).toBe(true);
      expect(isReservedWord("validName", "typescript")).toBe(false);
    });
  });

  describe("NamingPatterns", () => {
    it("should provide common naming patterns", () => {
      expect(NamingPatterns.interface("user data")).toBe("IUserData");
      expect(NamingPatterns.class("user service")).toBe("UserService");
      expect(NamingPatterns.function("get user")).toBe("getUser");
      expect(NamingPatterns.constant("max size")).toBe("MAX_SIZE");
      expect(NamingPatterns.file("User Service")).toBe("user-service");
    });
  });

  describe("caching", () => {
    it("should cache transformations", () => {
      clearCache();
      const initialStats = getCacheStats();
      
      toCamelCase("hello world");
      toCamelCase("hello world"); // Should hit cache
      
      const finalStats = getCacheStats();
      expect(finalStats.size).toBeGreaterThan(initialStats.size);
    });
  });
});