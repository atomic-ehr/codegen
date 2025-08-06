#!/usr/bin/env bun

/**
 * US Core Profile Example
 *
 * This example demonstrates how to:
 * 1. Generate TypeScript types from US Core profiles
 * 2. Use the generated profile types in your application
 * 3. Validate profile constraints at compile time
 */

import { resolve } from 'path';
import { createTypeSchema } from '../src/cli/commands/typeschema/create';
import { generateTypeScript } from '../src/cli/commands/generate/typescript';
import type { TypeSchemaConfig, GeneratorConfig, TypeScriptConfig } from '../src/lib/core/config';

async function main() {
  console.log('🚀 US Core Profile Example');
  console.log('==========================\n');

  const workingDir = resolve('./tmp/us-core-example');
  const typeschemaOutput = resolve(workingDir, 'typeschema.ndjson');
  const typesOutput = resolve(workingDir, 'types');

  try {
    // Step 1: Create TypeSchema from US Core package
    console.log('📦 Step 1: Creating TypeSchema from US Core package...');

    const typeschemaConfig: TypeSchemaConfig = {
      packages: ['hl7.fhir.us.core'],
      workingDir,
      verbose: true,
      outputFormat: 'ndjson',
      validation: true,
      treeshaking: [
        // Focus on commonly used US Core profiles
        'USCorePatientProfile',
        'USCoreObservationProfile',
        'USCoreConditionProfile',
        'USCoreProcedureProfile',
        'USCoreMedicationRequestProfile',
        'USCoreEncounterProfile',
        'USCoreDiagnosticReportProfile',
        // Include related value sets
        'USCoreEthnicityValueSet',
        'USCoreRaceValueSet',
        'USCoreSimpleObservationCategoryValueSet',
      ]
    };

    await createTypeSchema(typeschemaConfig, typeschemaOutput);
    console.log('✅ TypeSchema created successfully\n');

    // Step 2: Generate TypeScript types
    console.log('🔧 Step 2: Generating TypeScript types...');

    const generatorConfig: GeneratorConfig = {
      target: "typescript",
      outputDir: typesOutput,
      includeComments: true,
      includeValidation: false,
      namespaceStyle: "nested",
      verbose: true,
    };

    const typescriptConfig: TypeScriptConfig = {
      strict: true,
      target: "ES2020",
      module: "ES2020",
      declaration: true,
      useEnums: true,
      preferInterfaces: true,
    };

    await generateTypeScript(generatorConfig, typescriptConfig, typeschemaOutput);
    console.log('✅ TypeScript types generated successfully\n');

    // Step 3: Demonstrate usage
    console.log('📝 Step 3: Example usage of generated types');
    console.log('==========================================\n');

    console.log('Generated files structure:');
    console.log(`${typesOutput}/`);
    console.log('├── index.ts                    # Main exports');
    console.log('├── types/');
    console.log('│   ├── primitives.ts          # FHIR primitive types');
    console.log('│   ├── complex.ts             # FHIR complex types');
    console.log('│   └── valuesets.ts           # Value set types');
    console.log('├── resources/');
    console.log('│   ├── index.ts               # Resource exports');
    console.log('│   ├── Patient.ts             # Base Patient resource');
    console.log('│   ├── Observation.ts         # Base Observation resource');
    console.log('│   └── profiles/');
    console.log('│       └── uscore/');
    console.log('│           ├── index.ts       # US Core profile exports');
    console.log('│           ├── Patient.ts     # US Core Patient profile');
    console.log('│           └── Observation.ts # US Core Observation profile');
    console.log('');

    console.log('Example TypeScript usage:');
    console.log('```typescript');
    console.log("import { Patient } from './types/resources/Patient';");
    console.log("import { USCorePatientProfile } from './types/resources/profiles/uscore/Patient';");
    console.log("import { USCoreEthnicityValueSet, USCoreRaceValueSet } from './types/valuesets';");
    console.log('');
    console.log('// Base FHIR Patient');
    console.log('const basePatient: Patient = {');
    console.log('  resourceType: "Patient",');
    console.log('  id: "example-patient",');
    console.log('  name: [{ family: "Doe", given: ["John"] }]');
    console.log('};');
    console.log('');
    console.log('// US Core Patient with profile constraints');
    console.log('const usCorePatient: USCorePatientProfile = {');
    console.log('  resourceType: "Patient",');
    console.log('  id: "us-core-patient",');
    console.log('  // Required by US Core: name, gender, identifier');
    console.log('  name: [{ family: "Smith", given: ["Jane"] }],');
    console.log('  gender: "female",');
    console.log('  identifier: [{');
    console.log('    system: "http://hl7.org/fhir/sid/us-ssn",');
    console.log('    value: "123-45-6789"');
    console.log('  }],');
    console.log('  // US Core extensions with proper typing');
    console.log('  extension: [{');
    console.log('    url: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race",');
    console.log('    extension: [{');
    console.log('      url: "ombCategory",');
    console.log('      valueCoding: {');
    console.log('        system: "urn:oid:2.16.840.1.113883.6.238",');
    console.log('        code: "2106-3" as USCoreRaceValueSet,');
    console.log('        display: "White"');
    console.log('      }');
    console.log('    }]');
    console.log('  }]');
    console.log('};');
    console.log('```');
    console.log('');

    console.log('🎉 US Core example completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Examine the generated types in:', typesOutput);
    console.log('2. Import and use the profile types in your application');
    console.log('3. Leverage TypeScript\'s type checking for profile compliance');
    console.log('4. Use profile-specific value sets for better type safety');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
