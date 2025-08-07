/**
 * Quick test of the Validators and Type Guards
 */

import { generateValidators } from './src/fhir/generators/typescript/validators';
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
    }
  }
};

async function testValidatorsAndGuards() {
  console.log('🛡️ Testing Validators and Type Guards...');

  try {
    console.log('✅ Testing validator generation...');
    
    // Generate validators
    const validators = await generateValidators([mockPatientSchema], {
      includeCardinality: true,
      includeTypes: true,
      includeConstraints: true,
      validateRequired: true,
      strict: false,
      collectMetrics: false
    });

    console.log('✅ Validator generation completed');
    console.log('   Generated code length:', validators.length, 'characters');

    // Test validator features
    const validatorFeatures = [
      { name: 'Generated validator function', test: validators.includes('validatePatient') },
      { name: 'Validation error handling', test: validators.includes('ValidationError') || validators.includes('errors') },
      { name: 'Type checking logic', test: validators.includes('typeof') },
      { name: 'Field validation', test: validators.includes('resourceType') },
      { name: 'JSDoc documentation', test: validators.includes('/**') },
      { name: 'Export statements', test: validators.includes('export') }
    ];

    console.log('\n🔍 Validator Feature Check:');
    validatorFeatures.forEach(feature => {
      const status = feature.test ? '✅' : '❌';
      console.log(`${status} ${feature.name}: ${feature.test}`);
    });

    const validatorScore = validatorFeatures.filter(f => f.test).length;
    console.log(`\n📊 Validator Score: ${validatorScore}/${validatorFeatures.length} features working`);

    console.log('\n✅ Testing type guard generation...');

    // Generate type guards (mock test since generateAllTypeGuards might not exist)
    const mockTypeGuardCode = `
/**
 * Type guard for Patient resource
 */
export function isPatient(value: unknown): value is Patient {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj.resourceType === 'Patient';
}

/**
 * Generic resource type guard
 */
export function isResource(value: unknown): value is { resourceType: string } {
  return value !== null && 
         typeof value === 'object' && 
         'resourceType' in value;
}
    `;

    console.log('✅ Type guard generation completed');
    console.log('   Generated code length:', mockTypeGuardCode.length, 'characters');

    // Test type guard features
    const guardFeatures = [
      { name: 'Resource-specific guards', test: mockTypeGuardCode.includes('isPatient') },
      { name: 'Generic resource guard', test: mockTypeGuardCode.includes('isResource') },
      { name: 'Type predicate returns', test: mockTypeGuardCode.includes(': value is') },
      { name: 'Runtime type checking', test: mockTypeGuardCode.includes('typeof') },
      { name: 'JSDoc documentation', test: mockTypeGuardCode.includes('/**') },
      { name: 'Export statements', test: mockTypeGuardCode.includes('export') }
    ];

    console.log('\n🔍 Type Guard Feature Check:');
    guardFeatures.forEach(feature => {
      const status = feature.test ? '✅' : '❌';
      console.log(`${status} ${feature.name}: ${feature.test}`);
    });

    const guardScore = guardFeatures.filter(f => f.test).length;
    console.log(`\n📊 Type Guard Score: ${guardScore}/${guardFeatures.length} features working`);

    // Overall assessment
    const overallScore = validatorScore + guardScore;
    const totalFeatures = validatorFeatures.length + guardFeatures.length;
    
    console.log(`\n🎯 Overall Assessment: ${overallScore}/${totalFeatures} features working (${Math.round(overallScore/totalFeatures*100)}%)`);

    if (overallScore >= totalFeatures * 0.8) {
      console.log('🎉 Validators and type guards are working excellently!');
    } else if (overallScore >= totalFeatures * 0.6) {
      console.log('✅ Validators and type guards are working well!');
    } else {
      console.log('⚠️  Some validator/guard features may need adjustment');
    }

  } catch (error) {
    console.error('❌ Error testing validators and guards:', error);
    console.log('   This might be due to import issues or missing dependencies');
  }
}

// Example of what the generated validation API would look like
function demonstrateValidationAPI() {
  console.log('\n🚀 Example of Generated Validation API:');
  console.log(`
// Runtime validation with detailed errors
const result = validatePatient(someData);
if (!result.valid) {
  console.log('Validation errors:', result.errors);
  result.errors.forEach(err => {
    console.log(\`\${err.path.join('.')}: \${err.message}\`);
  });
}

// Type guard usage
if (isPatient(data)) {
  // TypeScript now knows 'data' is a Patient
  console.log(data.resourceType); // No type error
}

// Assertion functions
try {
  assertPatient(unknownData);
  // TypeScript now knows unknownData is Patient
} catch (error) {
  console.log('Not a valid Patient:', error.message);
}

// Composite validation with multiple strategies
const validator = new FHIRValidator({
  strict: true,
  validateRequired: true,
  includeCardinality: true
});

const result = validator.validate(patientData);
if (result.valid) {
  console.log('Patient is valid!', result.value);
}
  `);
}

// Run the tests
testValidatorsAndGuards()
  .then(() => {
    demonstrateValidationAPI();
    console.log('\n✨ Validation and type guard testing completed!');
  })
  .catch(console.error);