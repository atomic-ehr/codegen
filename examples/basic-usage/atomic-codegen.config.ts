/**
 * Configuration File Example
 *
 * This example demonstrates how to use a configuration file
 * to manage complex code generation scenarios with multiple
 * inputs and outputs.
 */

import { defineConfig } from '@atomic-ehr/codegen';

export default defineConfig({
  // Input sources
  input: {
    // FHIR packages to load
    packages: [
      'hl7.fhir.r4.core@4.0.1',
      'hl7.fhir.us.core@6.1.0',
      // Add more packages as needed
      // 'hl7.fhir.us.davinci-pdex@2.0.0',
      // 'hl7.fhir.us.carin-bb@2.0.0'
    ],

    // Local schema files
    files: [
      './schemas/custom/*.json',
      './schemas/extensions/*.json'
    ],

    // Direct schema objects (for programmatic generation)
    schemas: [
      // Can be populated programmatically
    ]
  },

  // Output configurations
  output: {
    // TypeScript types generation
    typescript: {
      outputDir: './generated/types',
      moduleFormat: 'esm',
      generateIndex: true,
      includeDocuments: true,
      namingConvention: 'PascalCase',
      includeProfiles: true,
      includeExtensions: true
    },

    // REST API client generation
    restClient: {
      outputDir: './generated/api',
      baseUrl: process.env.FHIR_BASE_URL || 'https://api.example.com/fhir',
      authType: 'bearer',
      includeTypes: true,
      generateMocks: true,
      clientLibrary: 'fetch'
    }
  },

  // Global options
  options: {
    verbose: process.env.NODE_ENV === 'development',
    validate: true,
    cache: true,
    overwrite: true
  }
});
