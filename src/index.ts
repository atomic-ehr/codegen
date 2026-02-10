/**
 * Main entry point for the @atomic-ehr/codegen library
 *
 * ## Overview
 *
 * atomic-codegen is a comprehensive code generation toolkit for FHIR healthcare standards,
 * designed with TypeSchema as the intermediate format for maximum flexibility and type safety.
 *
 * ## Key Features
 *
 * - **🔥 FHIR R4/R5 Support**: Complete FHIR resource and profile generation
 * - **🇺🇸 US Core Profiles**: Built-in support for US healthcare implementation guides
 * - **📋 TypeSchema Integration**: Uses TypeSchema as universal intermediate format
 * - **🎯 Type Safety**: Full TypeScript support with runtime validation
 * - **⚡ Performance**: Built with Bun for maximum speed
 * - **🏗️ Extensible**: Plugin architecture for custom generators
 *
 * ## Quick Start
 *
 * ```typescript
 * import { APIBuilder } from '@atomic-ehr/codegen';
 *
 * // High-level API for common workflows
 * const api = new APIBuilder();
 *
 * // Generate FHIR types from packages
 * await api
 *   .fromFHIRPackages(['hl7.fhir.r4.core@4.0.1', 'hl7.fhir.us.core@6.1.0'])
 *   .typescript('./src/types/fhir')
 *   .withValidation()
 *   .generate();
 * ```
 *
 * ## Architecture
 *
 * The library follows a three-stage architecture:
 *
 * 1. **Input**: FHIR packages, JSON Schema, or custom schemas
 * 2. **TypeSchema**: Universal intermediate representation
 * 3. **Output**: TypeScript, Python, Go, or custom target languages
 *
 * ## Examples
 *
 * ### FHIR Patient with US Core Extensions
 *
 * ```typescript
 * import { USCorePatient, USCoreRaceExtension } from './types/fhir';
 *
 * const patient: USCorePatient = {
 *   resourceType: 'Patient',
 *   identifier: [{ value: 'MRN-123' }],
 *   name: [{ family: 'Johnson', given: ['Maria'] }],
 *   gender: 'female',
 *   extension: [{
 *     url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
 *     extension: [{ url: 'text', valueString: 'Hispanic or Latino' }]
 *   } as USCoreRaceExtension]
 * };
 * ```
 *
 * ### Runtime Validation
 *
 * ```typescript
 * import { isUSCorePatient, validateFHIRResource } from './types/fhir/guards';
 *
 * if (isUSCorePatient(someData)) {
 *   // TypeScript knows this is a USCorePatient
 *   const validation = await validateFHIRResource(someData);
 *   if (validation.valid) {
 *     console.log('Valid US Core Patient!');
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 * @module @atomic-ehr/codegen
 * @version 0.0.1
 * @author Atomic EHR Team
 * @since 0.0.1
 */

// Export new high-level API (primary)
export * from "./api/index";
export { registerFromPackageMetas } from "./typeschema/register";
