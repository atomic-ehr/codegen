#!/usr/bin/env bun

/**
 * Basic FHIR R4 Type Generation Example
 *
 * This example demonstrates how to generate TypeScript types
 * from the core FHIR R4 specification using the high-level API.
 */

import { APIBuilder } from '@atomic-ehr/codegen';

async function generateFHIRTypes() {
  console.log('🔥 Generating FHIR R4 Types...\n');

  try {
    const api = new APIBuilder({
      verbose: true,
      validate: true,
      cache: true
    });

    const result = await api
      .fromPackage('hl7.fhir.r4.core@4.0.1')
      .typescript({
        moduleFormat: 'esm',
        generateIndex: true,
        includeDocuments: true,
        namingConvention: 'PascalCase'
      })
      .outputTo('./generated/fhir-r4')
      .onProgress((phase, current, total, message) => {
        console.log(`[${phase}] ${current}/${total}: ${message}`);
      })
      .generate();

    if (result.success) {
      console.log('\n✅ FHIR R4 types generated successfully!');
      console.log(`📁 Output directory: ${result.outputDir}`);
      console.log(`📄 Files generated: ${result.filesGenerated.length}`);
      console.log(`⏱️  Duration: ${result.duration}ms`);

      console.log('\n📋 Generated files:');
      result.filesGenerated.slice(0, 10).forEach(file => {
        console.log(`  - ${file}`);
      });

      if (result.filesGenerated.length > 10) {
        console.log(`  ... and ${result.filesGenerated.length - 10} more files`);
      }
    } else {
      console.error('\n❌ Generation failed!');
      result.errors.forEach(error => {
        console.error(`  - ${error}`);
      });
    }

    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      result.warnings.forEach(warning => {
        console.warn(`  - ${warning}`);
      });
    }

  } catch (error) {
    console.error('❌ Error during generation:', error);
    process.exit(1);
  }
}

// Run the example
if (import.meta.main) {
  await generateFHIRTypes();
}
