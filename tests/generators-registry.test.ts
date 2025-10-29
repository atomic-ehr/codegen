import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratorsRegistry } from '../src/generators-registry';

describe('GeneratorsRegistry', () => {
    let registry: GeneratorsRegistry;

    beforeEach(() => {
        registry = new GeneratorsRegistry();
        // Register default built-in generators
        registry.registerDefaultBuiltIns();
    });

    describe('validateGeneratorName', () => {
        it('should reject built-in generator names', () => {
            // Test built-in names
            expect(registry.validateGeneratorName('typescript').isValid).toBe(false);
            expect(registry.validateGeneratorName('csharp').isValid).toBe(false);
            expect(registry.validateGeneratorName('mustache').isValid).toBe(false);
            expect(registry.validateGeneratorName('python').isValid).toBe(false);
        });

        it('should reject names with invalid characters', () => {
            // Test names with invalid characters
            expect(registry.validateGeneratorName('Invalid').isValid).toBe(false);
            expect(registry.validateGeneratorName('with space').isValid).toBe(false);
            expect(registry.validateGeneratorName('with_underscore').isValid).toBe(false);
            expect(registry.validateGeneratorName('with.dot').isValid).toBe(false);
        });

        it('should reject reserved words', () => {
            // Test reserved words
            expect(registry.validateGeneratorName('fhir').isValid).toBe(false);
            expect(registry.validateGeneratorName('node').isValid).toBe(false);
            expect(registry.validateGeneratorName('npm').isValid).toBe(false);
            expect(registry.validateGeneratorName('schema').isValid).toBe(false);
            expect(registry.validateGeneratorName('codegen').isValid).toBe(false);
            expect(registry.validateGeneratorName('fhirschema').isValid).toBe(false);
        });

        it('should accept valid names', () => {
            // Test valid names
            expect(registry.validateGeneratorName('swift').isValid).toBe(true);
            expect(registry.validateGeneratorName('kotlin').isValid).toBe(true);
            expect(registry.validateGeneratorName('go-lang').isValid).toBe(true);
            expect(registry.validateGeneratorName('rust-fhir').isValid).toBe(true);
            expect(registry.validateGeneratorName('cpp-generator').isValid).toBe(true);
            expect(registry.validateGeneratorName('scala2').isValid).toBe(true);
        });

        it('should provide meaningful error messages', () => {
            // Test error messages
            const builtInError = registry.validateGeneratorName('typescript');
            expect(builtInError.error).toContain('conflicts with a built-in generator');

            const charError = registry.validateGeneratorName('Invalid');
            expect(charError.error).toContain('lowercase letters, numbers, and hyphens');

            const reservedError = registry.validateGeneratorName('fhir');
            expect(reservedError.error).toContain('reserved word');
        });
    });

    describe('isBuiltInGeneratorName', () => {
        it('should identify built-in generator names', () => {
            expect(registry.isBuiltInGeneratorName('typescript')).toBe(true);
            expect(registry.isBuiltInGeneratorName('csharp')).toBe(true);
            expect(registry.isBuiltInGeneratorName('python')).toBe(true);
            expect(registry.isBuiltInGeneratorName('mustache')).toBe(true);
        });

        it('should return false for non-built-in names', () => {
            expect(registry.isBuiltInGeneratorName('cotlin')).toBe(false);
            expect(registry.isBuiltInGeneratorName('nonexistent')).toBe(false);
        });
    });

    describe('hasGenerator', () => {
        it('should return true for registered generators', () => {
            expect(registry.hasGenerator('typescript')).toBe(true);
            expect(registry.hasGenerator('csharp')).toBe(true);
            expect(registry.hasGenerator('python')).toBe(true);
            expect(registry.hasGenerator('mustache')).toBe(true);
        });

        it('should return false for unregistered generators', () => {
            expect(registry.hasGenerator('cotlin')).toBe(false);
            expect(registry.hasGenerator('nonexistent')).toBe(false);
        });
    });
});
