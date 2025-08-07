/**
 * Quick test of enhanced TypeScript interface generation
 */

import { EnhancedInterfaceGenerator } from './src/fhir/generators/typescript/enhanced-interfaces';
import type { AnyTypeSchema } from './src/typeschema/types';

// Mock TypeSchema for Patient
const mockPatientSchema: AnyTypeSchema = {
  identifier: {
    name: 'Patient',
    kind: 'resource',
    url: 'http://hl7.org/fhir/StructureDefinition/Patient',
    package: 'hl7.fhir.r4.core',
    version: '4.0.1'
  },
  description: 'Demographics and administrative information about an individual receiving care',
  fields: {
    resourceType: {
      kind: 'field',
      name: 'resourceType',
      description: 'Resource type identifier',
      required: true,
      cardinality: { min: 1, max: 1 },
      type: { kind: 'primitive', name: 'code' },
      fixedValue: 'Patient'
    },
    id: {
      kind: 'field',
      name: 'id',
      description: 'Logical identifier',
      required: false,
      cardinality: { min: 0, max: 1 },
      type: { kind: 'primitive', name: 'id' }
    },
    name: {
      kind: 'field',
      name: 'name',
      description: 'A name associated with the patient',
      required: false,
      cardinality: { min: 0, max: -1 },
      type: { kind: 'complex', name: 'HumanName' }
    },
    gender: {
      kind: 'field',
      name: 'gender',
      description: 'Administrative gender',
      required: false,
      cardinality: { min: 0, max: 1 },
      type: { kind: 'primitive', name: 'code' },
      valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender'
    }
  }
};

async function testEnhancedInterfaces() {
  console.log('🧪 Testing Enhanced Interface Generation...');
  
  // Create enhanced generator with all features enabled
  const generator = new EnhancedInterfaceGenerator({
    includeJSDoc: true,
    includeExamples: true,
    includeFHIRPath: true,
    useBrandedTypes: true,
    useNominalTypes: true,
    useDiscriminatedUnions: true,
    useLiteralTypes: true,
    generatePartialTypes: true,
    generateRequiredTypes: true,
    generatePickTypes: true,
    strictReferences: true,
    readonly: false,
    targetVersion: '5.0'
  });

  try {
    // Generate interface for Patient
    const result = generator.generateInterface(mockPatientSchema);
    
    console.log('✅ Generated Interface:');
    console.log('='.repeat(50));
    console.log(result);
    console.log('='.repeat(50));
    
    // Check for key features
    const checks = [
      { name: 'JSDoc comments', test: result.includes('/**') },
      { name: 'Branded types', test: result.includes('PatientId') || result.includes('__brand') },
      { name: 'Literal types', test: result.includes("resourceType: 'Patient'") },
      { name: 'Helper types', test: result.includes('CreatePatient') || result.includes('UpdatePatient') },
      { name: 'FHIR path annotations', test: result.includes('@fhirpath') },
      { name: 'Examples', test: result.includes('@example') }
    ];

    console.log('\n🔍 Feature Check Results:');
    checks.forEach(check => {
      const status = check.test ? '✅' : '❌';
      console.log(`${status} ${check.name}: ${check.test}`);
    });

    const passedChecks = checks.filter(c => c.test).length;
    console.log(`\n📊 Overall Score: ${passedChecks}/${checks.length} features working`);

    if (passedChecks >= checks.length * 0.8) {
      console.log('🎉 Enhanced interface generation is working well!');
    } else {
      console.log('⚠️  Some enhanced features may need adjustment');
    }

  } catch (error) {
    console.error('❌ Error testing enhanced interfaces:', error);
  }
}

// Run the test
testEnhancedInterfaces().catch(console.error);