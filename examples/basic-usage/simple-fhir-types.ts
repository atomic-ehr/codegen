#!/usr/bin/env bun

/**
 * Simple FHIR Types Generation Example
 *
 * This example demonstrates the most basic usage of atomic-codegen
 * to generate TypeScript types from FHIR R4 core package.
 */

import { APIBuilder } from '../../src/api';

async function generateSimpleFHIRTypes() {
  console.log('🚀 Starting simple FHIR types generation...');

  try {
    // Create API builder instance
    const api = new APIBuilder({
      outputDir: './generated/simple-fhir',
      verbose: true,
      overwrite: true
    });

    // Generate TypeScript types from FHIR R4 core package
    const result = await api
      .fromPackage('hl7.fhir.r4.core', '4.0.1')
      .typescript({
        moduleFormat: 'esm',
        generateIndex: true,
        includeDocuments: true,
        namingConvention: 'PascalCase'
      })
      .execute();

    if (result.success) {
      console.log('✅ Generation completed successfully!');
      console.log(`📁 Output directory: ${result.outputDir}`);
      console.log(`📄 Files generated: ${result.filesGenerated.length}`);
      console.log(`⏱️  Duration: ${result.duration}ms`);

      // Show some generated files
      console.log('\n📋 Generated files (first 10):');
      result.filesGenerated.slice(0, 10).forEach(file => {
        console.log(`   - ${file}`);
      });
    } else {
      console.error('❌ Generation failed:');
      result.errors.forEach(error => console.error(`   - ${error}`));
    }

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }
}

// Run the example
if (import.meta.main) {
  generateSimpleFHIRTypes();
}
