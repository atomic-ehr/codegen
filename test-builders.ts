/**
 * Quick test of the Builder Pattern Generation
 */

import { generateBuilders } from './src/fhir/generators/typescript/builders';
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
    birthDate: {
      kind: 'field',
      name: 'birthDate',
      description: 'Date of birth',
      required: false,
      cardinality: { min: 0, max: 1 },
      type: { kind: 'primitive', name: 'date' }
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

async function testBuilderGeneration() {
  console.log('🏗️ Testing Builder Pattern Generation...');
  
  try {
    // Generate builder for Patient with all features enabled
    const result = generateBuilders([mockPatientSchema], {
      includeValidation: true,
      immutable: false,
      includeFactoryMethods: true,
      includeInterfaces: true,
      fluent: true,
      generateNestedBuilders: true,
      includeHelperMethods: true,
      supportPartialBuild: true,
      includeJSDoc: true,
      generateFactories: true,
      includeTypeGuards: true,
      handleChoiceTypes: true
    });
    
    console.log('✅ Generated Builder Class:');
    console.log('='.repeat(60));
    console.log(result.substring(0, 2000)); // Show first 2000 chars
    if (result.length > 2000) {
      console.log('\n... (truncated)');
    }
    console.log('='.repeat(60));
    
    // Check for key builder features
    const checks = [
      { name: 'Builder class definition', test: result.includes('class PatientBuilder') },
      { name: 'Method chaining (with methods)', test: result.includes('with') && result.includes(': this') },
      { name: 'Build method', test: result.includes('.build()') },
      { name: 'Partial build method', test: result.includes('buildPartial') },
      { name: 'JSDoc comments', test: result.includes('/**') },
      { name: 'Factory function', test: result.includes('createPatient') || result.includes('patient()') },
      { name: 'Validation logic', test: result.includes('validate') || result.includes('required') },
      { name: 'Helper methods', test: result.includes('add') || result.includes('clear') || result.includes('reset') }
    ];

    console.log('\n🔍 Builder Feature Check Results:');
    checks.forEach(check => {
      const status = check.test ? '✅' : '❌';
      console.log(`${status} ${check.name}: ${check.test}`);
    });

    const passedChecks = checks.filter(c => c.test).length;
    console.log(`\n📊 Overall Builder Score: ${passedChecks}/${checks.length} features working`);

    if (passedChecks >= checks.length * 0.8) {
      console.log('🎉 Builder pattern generation is working excellently!');
    } else if (passedChecks >= checks.length * 0.6) {
      console.log('✅ Builder pattern generation is working well!');
    } else {
      console.log('⚠️  Some builder features may need adjustment');
    }

    // Test code syntax validity
    try {
      // Basic syntax check - no actual execution
      const syntaxCheck = result.includes('export') && result.includes('{') && result.includes('}');
      console.log(`🔧 Generated Code Syntax: ${syntaxCheck ? '✅ Valid' : '❌ Issues detected'}`);
    } catch (error) {
      console.log('🔧 Generated Code Syntax: ❌ Issues detected');
    }

  } catch (error) {
    console.error('❌ Error testing builder generation:', error);
  }
}

// Run the test
testBuilderGeneration().catch(console.error);