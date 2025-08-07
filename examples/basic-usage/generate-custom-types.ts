#!/usr/bin/env bun

/**
 * Custom Schema Type Generation Example
 *
 * This example demonstrates how to generate TypeScript types
 * from custom JSON schemas and TypeSchema documents.
 */

import { APIBuilder } from '@atomic-ehr/codegen';

// Example custom schemas
const customSchemas = [
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.com/schemas/patient-summary',
    title: 'PatientSummary',
    description: 'A simplified patient summary for dashboard display',
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'Unique patient identifier'
      },
      name: {
        type: 'object',
        description: 'Patient name components',
        properties: {
          first: { type: 'string' },
          last: { type: 'string' },
          middle: { type: 'string' }
        },
        required: ['first', 'last']
      },
      age: {
        type: 'integer',
        minimum: 0,
        maximum: 150,
        description: 'Patient age in years'
      },
      gender: {
        type: 'string',
        enum: ['male', 'female', 'other', 'unknown'],
        description: 'Patient gender'
      },
      conditions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            display: { type: 'string' },
            severity: {
              type: 'string',
              enum: ['mild', 'moderate', 'severe']
            }
          },
          required: ['code', 'display']
        },
        description: 'Active medical conditions'
      },
      lastVisit: {
        type: 'string',
        format: 'date-time',
        description: 'Date of last clinical visit'
      },
      contactInfo: {
        type: 'object',
        properties: {
          phone: { type: 'string', pattern: '^\\+?[1-9]\\d{1,14}$' },
          email: { type: 'string', format: 'email' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              zipCode: { type: 'string', pattern: '^\\d{5}(-\\d{4})?$' }
            }
          }
        }
      }
    },
    required: ['id', 'name', 'age', 'gender']
  },
  {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://example.com/schemas/vital-signs',
    title: 'VitalSigns',
    description: 'Patient vital signs measurement',
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Reference to patient'
      },
      timestamp: {
        type: 'string',
        format: 'date-time',
        description: 'When the measurement was taken'
      },
      bloodPressure: {
        type: 'object',
        properties: {
          systolic: { type: 'number', minimum: 50, maximum: 300 },
          diastolic: { type: 'number', minimum: 30, maximum: 200 },
          unit: { type: 'string', const: 'mmHg' }
        },
        required: ['systolic', 'diastolic', 'unit']
      },
      heartRate: {
        type: 'object',
        properties: {
          value: { type: 'number', minimum: 30, maximum: 250 },
          unit: { type: 'string', const: 'bpm' }
        },
        required: ['value', 'unit']
      },
      temperature: {
        type: 'object',
        properties: {
          value: { type: 'number', minimum: 90, maximum: 110 },
          unit: { type: 'string', enum: ['F', 'C'] }
        },
        required: ['value', 'unit']
      },
      weight: {
        type: 'object',
        properties: {
          value: { type: 'number', minimum: 0 },
          unit: { type: 'string', enum: ['kg', 'lb'] }
        },
        required: ['value', 'unit']
      }
    },
    required: ['patientId', 'timestamp']
  }
];

async function generateCustomTypes() {
  console.log('🛠️  Generating Custom Schema Types...\n');

  try {
    const result = await new APIBuilder({
      verbose: true,
      validate: true,
      cache: true
    })
      // Load custom schemas from memory
      .fromSchemas(customSchemas)
      .typescript({
        moduleFormat: 'esm',
        generateIndex: true,
        includeDocuments: true,
        namingConvention: 'PascalCase'
      })
      .outputTo('./generated/custom-types')
      .onProgress((phase, current, total, message) => {
        console.log(`[${phase}] ${current}/${total}: ${message || ''}`);
      })
      .generate();

    if (result.success) {
      console.log('\n✅ Custom types generated successfully!');
      console.log(`📁 Output directory: ${result.outputDir}`);
      console.log(`📄 Files generated: ${result.filesGenerated.length}`);
      console.log(`⏱️  Duration: ${result.duration}ms`);

      console.log('\n📋 Generated files:');
      result.filesGenerated.forEach(file => {
        console.log(`   - ${file}`);
      });

      // Show example usage
      console.log('\n📝 Example Usage:');
      console.log(`
import { PatientSummary, VitalSigns } from './generated/custom-types';
import { isPatientSummary, isVitalSigns } from './generated/custom-types/guards';

// Type-safe patient summary
const summary: PatientSummary = {
  id: 'patient-123',
  name: { first: 'John', last: 'Doe' },
  age: 45,
  gender: 'male',
  conditions: [
    { code: 'E11', display: 'Type 2 diabetes', severity: 'moderate' }
  ],
  lastVisit: '2023-12-01T10:30:00Z',
  contactInfo: {
    email: 'john.doe@example.com',
    phone: '+1-555-0123'
  }
};

// Type-safe vital signs
const vitals: VitalSigns = {
  patientId: 'patient-123',
  timestamp: '2023-12-01T10:30:00Z',
  bloodPressure: { systolic: 120, diastolic: 80, unit: 'mmHg' },
  heartRate: { value: 72, unit: 'bpm' },
  temperature: { value: 98.6, unit: 'F' }
};

// Runtime validation
if (isPatientSummary(someData)) {
  console.log('Valid patient summary!');
}

if (isVitalSigns(vitalData)) {
  console.log('Valid vital signs measurement!');
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

// Example of loading schemas from files
async function generateFromFiles() {
  console.log('📁 Generating from schema files...\n');

  // First, let's create some example schema files
  await Bun.write('./schemas/patient.json', JSON.stringify(customSchemas[0], null, 2));
  await Bun.write('./schemas/vitals.json', JSON.stringify(customSchemas[1], null, 2));

  const result = await new APIBuilder()
    .fromFiles('./schemas/*.json')
    .typescript()
    .outputTo('./generated/from-files')
    .generate();

  console.log(result.success ? '✅ Generated from files!' : '❌ Failed to generate from files');
}

// Run if called directly
if (import.meta.main) {
  await generateCustomTypes();

  // Also demonstrate file-based generation
  console.log('\n' + '='.repeat(50));
  await generateFromFiles();
}

export { generateCustomTypes, generateFromFiles };
