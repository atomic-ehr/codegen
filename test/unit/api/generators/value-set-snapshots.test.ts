/**
 * Snapshot tests for value set generation output
 */
import { describe, test, expect } from "bun:test";
import { TypeScriptGenerator } from "../../../../src/api/generators/typescript";
import type { TypeSchemaForBinding } from "@typeschema/types";
import { createLogger } from "../../../../src/utils/codegen-logger";

describe("Value Set Generation Snapshots", () => {
    test("should generate consistent output for basic binding", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: true,
            includeDocuments: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "AdministrativeGender",
                kind: "binding",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                url: "http://hl7.org/fhir/administrative-gender",
            },
            strength: "required",
            enum: ["male", "female", "other", "unknown"],
            valueset: { url: "http://hl7.org/fhir/ValueSet/administrative-gender" },
        };

        const generatedCode = (generator as any).generateValueSetFile(binding);

        // This snapshot test ensures the output remains consistent
        expect(generatedCode).toBe(`/**
 * AdministrativeGender value set
 * @see http://hl7.org/fhir/ValueSet/administrative-gender
 * @package hl7.fhir.r4.core
 * @generated This file is auto-generated. Do not edit manually.
 */

export const AdministrativeGenderValues = [
  'male',
  'female',
  'other',
  'unknown'
] as const;

export type AdministrativeGender = typeof AdministrativeGenderValues[number];

export const isValidAdministrativeGender = (value: string): value is AdministrativeGender =>
  AdministrativeGenderValues.includes(value as AdministrativeGender);`);
    });

    test("should generate consistent output for binding without helpers", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: false,
            includeDocuments: true,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "ContactPointSystem",
                kind: "binding",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                url: "http://hl7.org/fhir/contact-point-system",
            },
            strength: "required",
            enum: ["phone", "fax", "email", "pager", "url", "sms", "other"],
            valueset: { url: "http://hl7.org/fhir/ValueSet/contact-point-system" },
        };

        const generatedCode = (generator as any).generateValueSetFile(binding);

        expect(generatedCode).toBe(`/**
 * ContactPointSystem value set
 * @see http://hl7.org/fhir/ValueSet/contact-point-system
 * @package hl7.fhir.r4.core
 * @generated This file is auto-generated. Do not edit manually.
 */

export const ContactPointSystemValues = [
  'phone',
  'fax',
  'email',
  'pager',
  'url',
  'sms',
  'other'
] as const;

export type ContactPointSystem = typeof ContactPointSystemValues[number];`);
    });

    test("should generate consistent output without documentation", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: true,
            includeDocuments: false,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "PublicationStatus",
                kind: "binding",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                url: "http://hl7.org/fhir/publication-status",
            },
            strength: "required",
            enum: ["draft", "active", "retired", "unknown"],
            valueset: { url: "http://hl7.org/fhir/ValueSet/publication-status" },
        };

        const generatedCode = (generator as any).generateValueSetFile(binding);

        expect(generatedCode).toBe(`export const PublicationStatusValues = [
  'draft',
  'active',
  'retired',
  'unknown'
] as const;

export type PublicationStatus = typeof PublicationStatusValues[number];

export const isValidPublicationStatus = (value: string): value is PublicationStatus =>
  PublicationStatusValues.includes(value as PublicationStatus);`);
    });

    test("should generate consistent output for special characters", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: true,
            includeDocuments: false,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "SpecialCharsBinding",
                kind: "binding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/special-chars",
            },
            strength: "required",
            enum: [
                "1.2.840.10065.1.12.1.1",
                "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                "value-with-hyphens",
                "value_with_underscores",
            ],
            valueset: { url: "http://test.com/valueset/special-chars" },
        };

        const generatedCode = (generator as any).generateValueSetFile(binding);

        expect(generatedCode).toBe(`export const SpecialCharsBindingValues = [
  '1.2.840.10065.1.12.1.1',
  'http://terminology.hl7.org/CodeSystem/v3-ActCode',
  'value-with-hyphens',
  'value_with_underscores'
] as const;

export type SpecialCharsBinding = typeof SpecialCharsBindingValues[number];

export const isValidSpecialCharsBinding = (value: string): value is SpecialCharsBinding =>
  SpecialCharsBindingValues.includes(value as SpecialCharsBinding);`);
    });

    test("should generate consistent output for minimal binding", () => {
        const generator = new TypeScriptGenerator({
            generateValueSets: true,
            includeValueSetHelpers: false,
            includeDocuments: false,
            outputDir: "/tmp/test",
            logger: createLogger({ prefix: "Test", verbose: false }),
        });

        const binding: TypeSchemaForBinding = {
            identifier: {
                name: "MinimalBinding",
                kind: "binding",
                package: "test.package",
                version: "1.0.0",
                url: "http://test.com/minimal",
            },
            strength: "required",
            enum: ["one", "two"],
            valueset: { url: "http://test.com/valueset/minimal" },
        };

        const generatedCode = (generator as any).generateValueSetFile(binding);

        expect(generatedCode).toBe(`export const MinimalBindingValues = [
  'one',
  'two'
] as const;

export type MinimalBinding = typeof MinimalBindingValues[number];`);
    });
});
