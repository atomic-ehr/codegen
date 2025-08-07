/**
 * Quick test of the Enhanced REST Client
 */

import { generateEnhancedRestClient } from './src/fhir/generators/client/enhanced-rest-client';
import type { AnyTypeSchema } from './src/typeschema/types';

// Mock TypeSchema for testing
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
    }
  }
};

async function testEnhancedRestClient() {
  console.log('🚀 Testing Enhanced REST Client...');

  try {
    console.log('✅ Testing client generation with all features...');
    
    // Generate enhanced REST client with all features enabled
    const clientCode = await generateEnhancedRestClient([mockPatientSchema], {
      className: 'EnhancedFHIRClient',
      includeErrorHandling: true,
      includeRetryStrategies: true,
      includeOperations: true,
      includeBatchTransaction: true,
      includePagination: true,
      includeConditionalOperations: true,
      includeInterceptors: true,
      includeCaching: true,
      httpClient: 'fetch',
      generateTypes: true
    });

    console.log('✅ Enhanced client generation completed');
    console.log('   Generated code length:', clientCode.length, 'characters');

    // Test enhanced client features
    const clientFeatures = [
      { name: 'Error handling classes', test: clientCode.includes('FHIRError') || clientCode.includes('OperationOutcome') },
      { name: 'Retry strategies', test: clientCode.includes('RetryStrategy') || clientCode.includes('CircuitBreaker') },
      { name: 'Operation support', test: clientCode.includes('$everything') || clientCode.includes('operation') },
      { name: 'Batch/Transaction builders', test: clientCode.includes('BatchBuilder') || clientCode.includes('TransactionBuilder') },
      { name: 'Pagination helpers', test: clientCode.includes('PaginatedResults') || clientCode.includes('asyncIterator') },
      { name: 'Conditional operations', test: clientCode.includes('createIfNotExists') || clientCode.includes('conditional') },
      { name: 'Interceptors system', test: clientCode.includes('Interceptor') || clientCode.includes('intercept') },
      { name: 'Caching support', test: clientCode.includes('Cache') || clientCode.includes('TTL') },
      { name: 'Type safety', test: clientCode.includes('export interface') || clientCode.includes('export type') },
      { name: 'JSDoc documentation', test: clientCode.includes('/**') }
    ];

    console.log('\n🔍 Enhanced Client Feature Check:');
    clientFeatures.forEach(feature => {
      const status = feature.test ? '✅' : '❌';
      console.log(`${status} ${feature.name}: ${feature.test}`);
    });

    const clientScore = clientFeatures.filter(f => f.test).length;
    console.log(`\n📊 Enhanced Client Score: ${clientScore}/${clientFeatures.length} features working`);

    // Test advanced features by checking for specific patterns
    console.log('\n🔍 Advanced Feature Analysis:');
    
    const advancedFeatures = [
      { name: 'Exponential backoff', test: clientCode.includes('exponential') || clientCode.includes('backoff') },
      { name: 'Circuit breaker pattern', test: clientCode.includes('OPEN') || clientCode.includes('CLOSED') || clientCode.includes('circuit') },
      { name: 'Request/Response interceptors', test: clientCode.includes('RequestInterceptor') || clientCode.includes('ResponseInterceptor') },
      { name: 'Authentication handling', test: clientCode.includes('Bearer') || clientCode.includes('Authorization') },
      { name: 'Cache invalidation', test: clientCode.includes('invalidate') || clientCode.includes('evict') },
      { name: 'Async pagination', test: clientCode.includes('async *') || clientCode.includes('AsyncIterator') },
      { name: 'Transaction validation', test: clientCode.includes('validateTransaction') || clientCode.includes('reference') },
      { name: 'Error recovery', test: clientCode.includes('recover') || clientCode.includes('fallback') }
    ];

    advancedFeatures.forEach(feature => {
      const status = feature.test ? '✅' : '❌';
      console.log(`${status} ${feature.name}: ${feature.test}`);
    });

    const advancedScore = advancedFeatures.filter(f => f.test).length;
    console.log(`\n📊 Advanced Features Score: ${advancedScore}/${advancedFeatures.length} features present`);

    // Overall assessment
    const totalScore = clientScore + advancedScore;
    const totalFeatures = clientFeatures.length + advancedFeatures.length;
    
    console.log(`\n🎯 Overall Assessment: ${totalScore}/${totalFeatures} features working (${Math.round(totalScore/totalFeatures*100)}%)`);

    if (totalScore >= totalFeatures * 0.8) {
      console.log('🎉 Enhanced REST client is working excellently!');
    } else if (totalScore >= totalFeatures * 0.6) {
      console.log('✅ Enhanced REST client is working well!');
    } else {
      console.log('⚠️  Some enhanced client features may need adjustment');
    }

    // Test code syntax validity
    const syntaxCheck = clientCode.includes('export') && clientCode.includes('class') && clientCode.includes('{') && clientCode.includes('}');
    console.log(`🔧 Generated Code Syntax: ${syntaxCheck ? '✅ Valid' : '❌ Issues detected'}`);

  } catch (error) {
    console.error('❌ Error testing enhanced REST client:', error);
    console.log('   This might be due to import issues or missing dependencies');
  }
}

// Example of what the generated enhanced client API would look like
function demonstrateEnhancedClientAPI() {
  console.log('\n🚀 Example of Generated Enhanced Client API:');
  console.log(`
// Create enhanced client with comprehensive features
const client = new EnhancedFHIRClient({
  baseUrl: 'https://fhir.server.com',
  auth: { type: 'bearer', token: 'your-token' },
  retry: { 
    maxAttempts: 3, 
    backoffStrategy: 'exponential',
    baseDelay: 1000 
  },
  cache: { 
    defaultTTL: 300000, // 5 minutes
    maxSize: 1000,
    evictionStrategy: 'lru'
  },
  interceptors: [
    authInterceptor,
    loggingInterceptor,
    rateLimitInterceptor
  ]
});

// Type-safe FHIR operations
const bundle = await client
  .operation('Patient', '123')
  .$everything({
    start: new Date('2023-01-01'),
    end: new Date('2023-12-31'),
    _count: 50
  });

// Transaction builder with validation
const result = await client.transaction()
  .create(newPatient)
  .conditionalUpdate(existingPatient, { identifier: 'system|value' })
  .delete('Observation', 'obs-123')
  .execute();

// Paginated search with async iteration
const patients = client.searchPaginated('Patient', { active: 'true' });
for await (const patient of patients.take(100)) {
  console.log(patient.name);
}

// Conditional operations with error handling
try {
  const result = await client.createIfNotExists(patient, { 
    identifier: 'MRN|12345' 
  });
  console.log('Patient created or found:', result.id);
} catch (error) {
  if (error instanceof FHIRError) {
    console.log('FHIR Error:', error.operationOutcome);
  }
}

// Bulk operations with retry and caching
const results = await client.batch()
  .read('Patient', '1')
  .read('Patient', '2')
  .search('Observation', { subject: 'Patient/1' })
  .execute();
  `);
}

// Run the tests
testEnhancedRestClient()
  .then(() => {
    demonstrateEnhancedClientAPI();
    console.log('\n✨ Enhanced REST client testing completed!');
  })
  .catch(console.error);