#!/usr/bin/env bun

/**
 * US Core Profile Type Generation Example
 *
 * This example demonstrates how to generate TypeScript types
 * from FHIR R4 Core + US Core profiles for US healthcare compliance.
 */

import { APIBuilder } from '@atomic-ehr/codegen';

async function generateUSCoreTypes() {
  console.log('🇺🇸 Generating US Core Profile Types...\n');

  try {
    const result = await new APIBuilder({
      verbose: true,
      validate: true,
      cache: true
    })
      // Load both FHIR R4 Core and US Core packages
      .fromPackage('hl7.fhir.r4.core@4.0.1')
      .fromPackage('hl7.fhir.us.core@6.1.0')
      .typescript({
        moduleFormat: 'esm',
        generateIndex: true,
        includeDocuments: true,
        namingConvention: 'PascalCase',
        includeProfiles: true,    // Include US Core profiles
        includeExtensions: true   // Include US Core extensions
      })
      .outputTo('./generated/us-core')
      .onProgress((phase, current, total, message) => {
        const percentage = Math.round((current / total) * 100);
        console.log(`[${phase}] ${percentage}% (${current}/${total}): ${message || ''}`);
      })
      .generate();

    if (result.success) {
      console.log('\n✅ US Core types generated successfully!');
      console.log(`📁 Output directory: ${result.outputDir}`);
      console.log(`📄 Files generated: ${result.filesGenerated.length}`);
      console.log(`⏱️  Duration: ${result.duration}ms`);

      // Show US Core specific files
      console.log('\n🏥 US Core Profile Types:');
      const usCoreFiles = result.filesGenerated.filter(file =>
        file.includes('USCore') || file.includes('us-core')
      );

      usCoreFiles.slice(0, 10).forEach(file => {
        console.log(`   - ${file}`);
      });

      if (usCoreFiles.length > 10) {
        console.log(`   ... and ${usCoreFiles.length - 10} more US Core files`);
      }

      // Show example usage
      console.log('\n📝 Example Usage:');
      console.log(`
import { USCorePatient, USCoreObservation } from './generated/us-core';
import { isUSCorePatient } from './generated/us-core/guards';

// Type-safe US Core Patient with race extension
const patient: USCorePatient = {
  resourceType: 'Patient',
  identifier: [{ value: 'MRN-123' }],
  name: [{ family: 'Johnson', given: ['Maria'] }],
  gender: 'female',
  extension: [{
    url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    extension: [{ url: 'text', valueString: 'Hispanic or Latino' }]
  }]
};

// Runtime validation
if (isUSCorePatient(someData)) {
  // TypeScript knows this is a USCorePatient
  console.log('Valid US Core Patient!');
}
      `);

    } else {
      console.error('\n❌ Generation failed!');
      result.errors.forEach(error => console.error(`   Error: ${error}`));
    }

    if (result.warnings.length > 0) {
      console.warn('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.warn(`   ${warning}`));
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  await generateUSCoreTypes();
}

export { generateUSCoreTypes };
