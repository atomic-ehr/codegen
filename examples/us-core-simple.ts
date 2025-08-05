#!/usr/bin/env bun

/**
 * Simple US Core Example - Patient Profile Only
 *
 * This is a simplified version that focuses on just the US Core Patient profile
 * for faster testing and demonstration.
 */

import { resolve } from 'path';
import { createTypeSchema } from '../src/cli/commands/typeschema/create';
import { generateTypeScript } from '../src/cli/commands/generate/typescript';
import type { TypeSchemaConfig, GeneratorConfig, TypeScriptConfig } from '../src/lib/core/config';

async function main() {
  console.log('🚀 Simple US Core Patient Example');
  console.log('=================================\n');

  const workingDir = resolve('./tmp/us-core-simple');
  const typeschemaOutput = resolve(workingDir, 'typeschema.ndjson');
  const typesOutput = resolve(workingDir, 'types');

  try {
    // Step 1: Create TypeSchema from US Core package (Patient only)
    console.log('📦 Step 1: Creating TypeSchema for US Core Patient...');

    const typeschemaConfig: TypeSchemaConfig = {
      packages: ['hl7.fhir.us.core'],
      workingDir,
      verbose: true,
      output: {
        format: 'ndjson',
        separate: false,
      },
      treeshaking: [
        // Focus on just Patient profile for this simple example
        'Patient',
        'USCorePatientProfile',
        'us-core-patient',
        // Include basic value sets
        'USCoreRaceValueSet',
        'USCoreEthnicityValueSet',
      ]
    };

    await createTypeSchema(typeschemaConfig, typeschemaOutput);
    console.log('✅ TypeSchema created successfully\n');

    // Step 2: Generate TypeScript types
    console.log('🔧 Step 2: Generating TypeScript types...');

    const generatorConfig: GeneratorConfig = {
      verbose: true,
      outputDir: typesOutput,
    };

    const typescriptConfig: TypeScriptConfig = {
      strict: true,
      generateIndex: true,
      generateProfiles: true,
      profileNamespaces: {
        'us-core': 'USCore'
      }
    };

    await generateTypeScript(generatorConfig, typescriptConfig, typeschemaOutput);
    console.log('✅ TypeScript types generated successfully\n');

    // Step 3: Show results
    console.log('📁 Generated files:');
    console.log(`${typesOutput}/`);
    console.log('├── index.ts');
    console.log('├── types/');
    console.log('│   ├── primitives.ts');
    console.log('│   ├── complex.ts');
    console.log('│   └── valuesets.ts');
    console.log('└── resources/');
    console.log('    ├── Patient.ts');
    console.log('    └── profiles/');
    console.log('        └── uscore/');
    console.log('            └── Patient.ts');
    console.log('');

    console.log('🎉 Simple US Core Patient example completed!');
    console.log('');
    console.log('Next: Run the full us-core-example.ts for complete profile generation');

  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
