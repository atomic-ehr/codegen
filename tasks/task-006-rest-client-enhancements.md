# Task 006: REST Client Enhancements

## Priority: High
## Status: TODO
## Estimated Effort: 3 hours

## Description
Enhance the REST client generator to provide better type safety, operation support, and advanced features like batching and transactions.

## Goals
- Add full operation support with type safety
- Implement batch and transaction builders
- Add pagination helpers
- Support conditional requests
- Implement retry and error handling strategies

## Implementation

### 1. Enhanced Client Architecture
```typescript
interface EnhancedClientOptions {
  baseUrl: string;
  auth?: AuthConfig;
  retry?: RetryConfig;
  interceptors?: Interceptor[];
  cache?: CacheConfig;
  timeout?: number;
}

class EnhancedFHIRClient {
  private operations: OperationRegistry;
  private searchBuilders: SearchBuilderRegistry;
  private batchBuilder: BatchBuilder;
  private transactionBuilder: TransactionBuilder;
}
```

### 2. Operation Support
```typescript
// Generated operation methods
export class PatientOperations {
  constructor(private client: FHIRClient) {}

  /**
   * $everything operation
   * @see https://hl7.org/fhir/patient-operation-everything.html
   */
  async $everything(
    id: string,
    options?: {
      start?: Date;
      end?: Date;
      _type?: ResourceType[];
      _count?: number;
    }
  ): Promise<Bundle> {
    const params = new URLSearchParams();
    if (options?.start) {
      params.append('start', options.start.toISOString());
    }
    if (options?.end) {
      params.append('end', options.end.toISOString());
    }
    if (options?._type) {
      params.append('_type', options._type.join(','));
    }
    if (options?._count) {
      params.append('_count', options._count.toString());
    }

    return this.client.operation(
      'Patient',
      id,
      '$everything',
      params
    );
  }

  /**
   * $match operation for MPI
   */
  async $match(
    resource: Patient,
    options?: {
      onlyCertainMatches?: boolean;
      count?: number;
    }
  ): Promise<Bundle<Patient>> {
    return this.client.operation(
      'Patient',
      null,
      '$match',
      {
        resource,
        onlyCertainMatches: options?.onlyCertainMatches,
        count: options?.count
      }
    );
  }
}

// Client integration
export class FHIRClient {
  patient = new PatientOperations(this);
  observation = new ObservationOperations(this);
  // ... other resource operations

  async operation<T = any>(
    resourceType: string,
    id: string | null,
    name: string,
    parameters?: any
  ): Promise<T> {
    const path = id 
      ? `${resourceType}/${id}/${name}`
      : `${resourceType}/${name}`;
    
    return this.request('POST', path, parameters);
  }
}
```

### 3. Batch and Transaction Builders
```typescript
// Batch builder with type safety
export class BatchBuilder {
  private entries: BundleEntry[] = [];

  read<T extends Resource>(
    resourceType: T['resourceType'],
    id: string
  ): this {
    this.entries.push({
      request: {
        method: 'GET',
        url: `${resourceType}/${id}`
      }
    });
    return this;
  }

  create<T extends Resource>(resource: T): this {
    this.entries.push({
      resource,
      request: {
        method: 'POST',
        url: resource.resourceType
      }
    });
    return this;
  }

  update<T extends Resource>(resource: T): this {
    this.entries.push({
      resource,
      request: {
        method: 'PUT',
        url: `${resource.resourceType}/${resource.id}`
      }
    });
    return this;
  }

  delete<T extends Resource>(
    resourceType: T['resourceType'],
    id: string
  ): this {
    this.entries.push({
      request: {
        method: 'DELETE',
        url: `${resourceType}/${id}`
      }
    });
    return this;
  }

  search<T extends Resource>(
    resourceType: T['resourceType'],
    params: Record<string, any>
  ): this {
    const query = new URLSearchParams(params).toString();
    this.entries.push({
      request: {
        method: 'GET',
        url: `${resourceType}?${query}`
      }
    });
    return this;
  }

  conditional<T extends Resource>(
    method: 'PUT' | 'DELETE',
    resourceType: T['resourceType'],
    params: Record<string, any>,
    resource?: T
  ): this {
    const query = new URLSearchParams(params).toString();
    this.entries.push({
      resource,
      request: {
        method,
        url: `${resourceType}?${query}`
      }
    });
    return this;
  }

  build(): Bundle {
    return {
      resourceType: 'Bundle',
      type: 'batch',
      entry: this.entries
    };
  }

  async execute(client: FHIRClient): Promise<Bundle> {
    const bundle = this.build();
    return client.batch(bundle);
  }
}

// Transaction builder with validation
export class TransactionBuilder extends BatchBuilder {
  build(): Bundle {
    // Validate transaction integrity
    this.validateReferences();
    
    return {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: this.entries
    };
  }

  private validateReferences(): void {
    // Check that all references exist within transaction
    const tempIds = new Set<string>();
    const references = new Set<string>();

    this.entries.forEach(entry => {
      if (entry.fullUrl?.startsWith('urn:uuid:')) {
        tempIds.add(entry.fullUrl);
      }
      // Extract and validate references
    });
  }
}
```

### 4. Pagination Helpers
```typescript
// Pagination iterator
export class PaginatedResults<T extends Resource> {
  constructor(
    private client: FHIRClient,
    private initialBundle: Bundle<T>
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    let currentBundle = this.initialBundle;

    while (currentBundle) {
      // Yield all resources in current bundle
      for (const entry of currentBundle.entry || []) {
        if (entry.resource) {
          yield entry.resource as T;
        }
      }

      // Get next page
      const nextLink = currentBundle.link?.find(
        l => l.relation === 'next'
      );
      
      if (nextLink?.url) {
        currentBundle = await this.client.requestUrl(nextLink.url);
      } else {
        break;
      }
    }
  }

  async all(): Promise<T[]> {
    const results: T[] = [];
    for await (const resource of this) {
      results.push(resource);
    }
    return results;
  }

  async take(n: number): Promise<T[]> {
    const results: T[] = [];
    for await (const resource of this) {
      results.push(resource);
      if (results.length >= n) break;
    }
    return results;
  }
}

// Client integration
export class FHIRClient {
  async searchPaginated<T extends Resource>(
    resourceType: T['resourceType'],
    params?: any
  ): Promise<PaginatedResults<T>> {
    const bundle = await this.search<T>(resourceType, params);
    return new PaginatedResults(this, bundle.data);
  }
}
```

### 5. Conditional Requests
```typescript
// Conditional request support
export class ConditionalRequests {
  constructor(private client: FHIRClient) {}

  async createIfNotExists<T extends Resource>(
    resource: T,
    searchParams: Record<string, any>
  ): Promise<T> {
    const existing = await this.client.search(
      resource.resourceType,
      searchParams
    );

    if (existing.data.total > 0) {
      return existing.data.entry[0].resource as T;
    }

    return this.client.create(resource);
  }

  async updateConditional<T extends Resource>(
    resourceType: T['resourceType'],
    resource: T,
    searchParams: Record<string, any>
  ): Promise<T> {
    const query = new URLSearchParams(searchParams).toString();
    return this.client.request(
      'PUT',
      `${resourceType}?${query}`,
      resource
    );
  }

  async deleteConditional<T extends Resource>(
    resourceType: T['resourceType'],
    searchParams: Record<string, any>
  ): Promise<void> {
    const query = new URLSearchParams(searchParams).toString();
    return this.client.request(
      'DELETE',
      `${resourceType}?${query}`
    );
  }
}
```

### 6. Error Handling and Retry
```typescript
// Retry strategy
export class RetryStrategy {
  constructor(
    private maxRetries: number = 3,
    private backoff: BackoffStrategy = new ExponentialBackoff()
  ) {}

  async execute<T>(
    fn: () => Promise<T>,
    isRetryable: (error: any) => boolean
  ): Promise<T> {
    let lastError: any;
    
    for (let i = 0; i <= this.maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (i < this.maxRetries && isRetryable(error)) {
          await this.backoff.wait(i);
        } else {
          throw error;
        }
      }
    }
    
    throw lastError;
  }
}

// Enhanced error handling
export class FHIRError extends Error {
  constructor(
    message: string,
    public status?: number,
    public operationOutcome?: OperationOutcome,
    public request?: RequestInfo
  ) {
    super(message);
    this.name = 'FHIRError';
  }

  get issues(): Issue[] {
    return this.operationOutcome?.issue || [];
  }

  hasIssue(severity: 'fatal' | 'error' | 'warning' | 'information'): boolean {
    return this.issues.some(i => i.severity === severity);
  }
}
```

## Files to Create/Modify

### New Files
- `src/fhir/generators/client/operations.ts`
- `src/fhir/generators/client/batch.ts`
- `src/fhir/generators/client/pagination.ts`
- `src/fhir/generators/client/conditional.ts`
- `src/fhir/generators/client/retry.ts`

### Modified Files
- `src/api/generators/rest-client.ts`
- `src/fhir/generators/client/rest.ts`

## Success Criteria
- [ ] Operations have full type safety
- [ ] Batch/transaction builders prevent errors
- [ ] Pagination works seamlessly
- [ ] Conditional requests reduce round trips
- [ ] Retry logic handles transient failures
- [ ] Error messages are helpful

## Testing
```bash
# Unit tests
bun test test/fhir/client/

# Integration tests
bun test test/integration/client.test.ts
```

## Dependencies
- Task 001: Reorganize FHIR Module Structure
- Task 004: Type-Safe Search Builder