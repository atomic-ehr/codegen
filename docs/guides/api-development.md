# API Development Guide

This guide covers building FHIR-compliant backend APIs using atomic-codegen generated types.

## Table of Contents

- [Overview](#overview)
- [Express.js Integration](#expressjs-integration)
- [Fastify Integration](#fastify-integration)
- [Bun HTTP Server](#bun-http-server)
- [Database Integration](#database-integration)
- [Authentication & Authorization](#authentication--authorization)
- [Search Parameters](#search-parameters)
- [Bundle Operations](#bundle-operations)
- [Testing](#testing)
- [Best Practices](#best-practices)

## Overview

atomic-codegen generates TypeScript types that provide full type safety for building FHIR-compliant APIs, ensuring your backend correctly handles healthcare data according to FHIR specifications.

### Key Benefits

- **Type Safety**: Full TypeScript support for request/response handling
- **FHIR Compliance**: Automatic validation against FHIR specifications
- **Runtime Validation**: Generated type guards and validators
- **Error Handling**: Proper FHIR OperationOutcome responses

## Express.js Integration

### Setup

First, generate your FHIR types:

```bash
bun atomic-codegen generate typescript \
  --from-package hl7.fhir.r4.core@4.0.1 \
  --from-package hl7.fhir.us.core@6.1.0 \
  --output ./src/types/fhir \
  --include-profiles
```

### Basic FHIR Server

```typescript
import express from 'express';
import { USCorePatient, Bundle, OperationOutcome } from './types/fhir';
import { isUSCorePatient } from './types/fhir/guards';

const app = express();
app.use(express.json());

// FHIR-compliant error response
function createOperationOutcome(
  severity: 'error' | 'warning' | 'information',
  code: string,
  details: string
): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{
      severity,
      code,
      details: { text: details }
    }]
  };
}

// Patient CRUD operations
app.post('/fhir/Patient', async (req, res) => {
  try {
    // Validate request body
    if (!isUSCorePatient(req.body)) {
      const outcome = createOperationOutcome(
        'error',
        'invalid',
        'Invalid US Core Patient resource'
      );
      return res.status(400).json(outcome);
    }

    const patient: USCorePatient = req.body;
    
    // Generate ID if not provided
    if (!patient.id) {
      patient.id = `patient-${Date.now()}`;
    }

    // Save to database (implementation specific)
    const saved = await savePatient(patient);
    
    res.status(201)
       .location(`/fhir/Patient/${saved.id}`)
       .json(saved);

  } catch (error) {
    const outcome = createOperationOutcome(
      'error',
      'exception',
      `Internal server error: ${error.message}`
    );
    res.status(500).json(outcome);
  }
});

app.get('/fhir/Patient/:id', async (req, res) => {
  try {
    const patient = await getPatientById(req.params.id);
    
    if (!patient) {
      const outcome = createOperationOutcome(
        'error',
        'not-found',
        `Patient/${req.params.id} not found`
      );
      return res.status(404).json(outcome);
    }

    res.json(patient);
  } catch (error) {
    const outcome = createOperationOutcome(
      'error',
      'exception',
      `Failed to retrieve patient: ${error.message}`
    );
    res.status(500).json(outcome);
  }
});

app.get('/fhir/Patient', async (req, res) => {
  try {
    const searchParams = req.query;
    const patients = await searchPatients(searchParams);
    
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: patients.length,
      entry: patients.map(patient => ({
        fullUrl: `${req.protocol}://${req.get('host')}/fhir/Patient/${patient.id}`,
        resource: patient
      }))
    };

    res.json(bundle);
  } catch (error) {
    const outcome = createOperationOutcome(
      'error',
      'exception',
      `Search failed: ${error.message}`
    );
    res.status(500).json(outcome);
  }
});

app.listen(3000, () => {
  console.log('FHIR server running on port 3000');
});
```

## Fastify Integration

### Fastify with Type Safety

```typescript
import Fastify from 'fastify';
import { USCorePatient, Bundle } from './types/fhir';
import { isUSCorePatient } from './types/fhir/guards';

const fastify = Fastify({ logger: true });

// Schema definitions for validation
const patientSchema = {
  type: 'object',
  properties: {
    resourceType: { type: 'string', const: 'Patient' },
    id: { type: 'string' },
    name: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          family: { type: 'string' },
          given: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  },
  required: ['resourceType']
};

// Patient routes with type safety
fastify.post<{ Body: USCorePatient }>('/fhir/Patient', {
  schema: {
    body: patientSchema,
    response: {
      201: patientSchema,
      400: { type: 'object' }
    }
  }
}, async (request, reply) => {
  if (!isUSCorePatient(request.body)) {
    return reply.status(400).send({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'invalid',
        details: { text: 'Invalid Patient resource' }
      }]
    });
  }

  const patient: USCorePatient = request.body;
  const saved = await savePatient(patient);
  
  reply.status(201).send(saved);
});

fastify.get<{ Params: { id: string } }>('/fhir/Patient/:id', async (request, reply) => {
  const patient = await getPatientById(request.params.id);
  
  if (!patient) {
    return reply.status(404).send({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'not-found',
        details: { text: `Patient/${request.params.id} not found` }
      }]
    });
  }

  return patient;
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('FHIR server running on port 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
```

## Bun HTTP Server

### Native Bun Server

```typescript
import { USCorePatient, Bundle, OperationOutcome } from './types/fhir';
import { isUSCorePatient } from './types/fhir/guards';

const server = Bun.serve({
  port: 3000,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // CORS headers
    const headers = {
      'Content-Type': 'application/fhir+json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    try {
      // Patient routes
      if (path === '/fhir/Patient' && method === 'POST') {
        const body = await req.json();
        
        if (!isUSCorePatient(body)) {
          const outcome: OperationOutcome = {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'invalid',
              details: { text: 'Invalid Patient resource' }
            }]
          };
          return new Response(JSON.stringify(outcome), { 
            status: 400, 
            headers 
          });
        }

        const patient: USCorePatient = body;
        const saved = await savePatient(patient);
        
        return new Response(JSON.stringify(saved), { 
          status: 201, 
          headers: {
            ...headers,
            'Location': `/fhir/Patient/${saved.id}`
          }
        });
      }

      if (path.startsWith('/fhir/Patient/') && method === 'GET') {
        const id = path.split('/').pop();
        const patient = await getPatientById(id!);
        
        if (!patient) {
          const outcome: OperationOutcome = {
            resourceType: 'OperationOutcome',
            issue: [{
              severity: 'error',
              code: 'not-found',
              details: { text: `Patient/${id} not found` }
            }]
          };
          return new Response(JSON.stringify(outcome), { 
            status: 404, 
            headers 
          });
        }

        return new Response(JSON.stringify(patient), { headers });
      }

      if (path === '/fhir/Patient' && method === 'GET') {
        const searchParams = Object.fromEntries(url.searchParams);
        const patients = await searchPatients(searchParams);
        
        const bundle: Bundle = {
          resourceType: 'Bundle',
          type: 'searchset',
          total: patients.length,
          entry: patients.map(patient => ({
            fullUrl: `${url.origin}/fhir/Patient/${patient.id}`,
            resource: patient
          }))
        };

        return new Response(JSON.stringify(bundle), { headers });
      }

      // 404 for unmatched routes
      return new Response('Not Found', { status: 404 });

    } catch (error) {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'exception',
          details: { text: `Server error: ${error.message}` }
        }]
      };
      return new Response(JSON.stringify(outcome), { 
        status: 500, 
        headers 
      });
    }
  }
});

console.log(`FHIR server running on http://localhost:${server.port}`);
```

## Database Integration

### PostgreSQL with JSONB

```typescript
import { Pool } from 'pg';
import { USCorePatient } from './types/fhir';
import { isUSCorePatient } from './types/fhir/guards';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Initialize database schema
async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS patients (
      id VARCHAR(255) PRIMARY KEY,
      resource JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_patients_resource_type 
    ON patients USING GIN ((resource->>'resourceType'));
    
    CREATE INDEX IF NOT EXISTS idx_patients_name 
    ON patients USING GIN ((resource->'name'));
    
    CREATE INDEX IF NOT EXISTS idx_patients_identifier 
    ON patients USING GIN ((resource->'identifier'));
  `);
}

export class PatientRepository {
  async save(patient: USCorePatient): Promise<USCorePatient> {
    if (!patient.id) {
      patient.id = `patient-${Date.now()}`;
    }

    const query = `
      INSERT INTO patients (id, resource) 
      VALUES ($1, $2) 
      ON CONFLICT (id) 
      DO UPDATE SET resource = $2, updated_at = NOW()
      RETURNING resource
    `;
    
    const result = await pool.query(query, [patient.id, JSON.stringify(patient)]);
    return result.rows[0].resource;
  }

  async findById(id: string): Promise<USCorePatient | null> {
    const query = 'SELECT resource FROM patients WHERE id = $1';
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const resource = result.rows[0].resource;
    return isUSCorePatient(resource) ? resource : null;
  }

  async search(params: Record<string, any>): Promise<USCorePatient[]> {
    let query = 'SELECT resource FROM patients WHERE 1=1';
    const values: any[] = [];
    let paramIndex = 1;

    // Name search
    if (params.name) {
      query += ` AND resource->'name' @> $${paramIndex}`;
      values.push(JSON.stringify([{ family: params.name }]));
      paramIndex++;
    }

    // Gender search
    if (params.gender) {
      query += ` AND resource->>'gender' = $${paramIndex}`;
      values.push(params.gender);
      paramIndex++;
    }

    // Active status
    if (params.active !== undefined) {
      query += ` AND resource->>'active' = $${paramIndex}`;
      values.push(params.active.toString());
      paramIndex++;
    }

    // Pagination
    const count = parseInt(params._count) || 20;
    const offset = parseInt(params._offset) || 0;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(count, offset);

    const result = await pool.query(query, values);
    return result.rows
      .map(row => row.resource)
      .filter(isUSCorePatient);
  }

  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM patients WHERE id = $1';
    const result = await pool.query(query, [id]);
    return result.rowCount > 0;
  }
}
```

## Authentication & Authorization

### JWT Authentication

```typescript
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    role: string;
    scopes: string[];
  };
}

// JWT middleware
export function authenticateToken(
  req: AuthenticatedRequest, 
  res: Response, 
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'security',
        details: { text: 'Access token required' }
      }]
    };
    return res.status(401).json(outcome);
  }

  jwt.verify(token, process.env.JWT_SECRET!, (err, user) => {
    if (err) {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'security',
          details: { text: 'Invalid access token' }
        }]
      };
      return res.status(403).json(outcome);
    }

    req.user = user as any;
    next();
  });
}

// FHIR scope authorization
export function requireScope(scope: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user?.scopes.includes(scope)) {
      const outcome: OperationOutcome = {
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'forbidden',
          details: { text: `Insufficient scope. Required: ${scope}` }
        }]
      };
      return res.status(403).json(outcome);
    }
    next();
  };
}

// Usage
app.get('/fhir/Patient', 
  authenticateToken, 
  requireScope('patient/Patient.read'), 
  async (req, res) => {
    // Handle patient search
  }
);
```

## Search Parameters

### Type-Safe Search Implementation

```typescript
interface PatientSearchParams {
  _id?: string;
  identifier?: string;
  name?: string;
  family?: string;
  given?: string;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthdate?: string;
  active?: boolean;
  _count?: number;
  _offset?: number;
  _sort?: string;
}

export class FHIRSearchBuilder {
  private conditions: string[] = [];
  private values: any[] = [];
  private paramIndex = 1;

  addStringSearch(field: string, value: string, exact = false) {
    if (exact) {
      this.conditions.push(`resource->>'${field}' = $${this.paramIndex}`);
      this.values.push(value);
    } else {
      this.conditions.push(`resource->>'${field}' ILIKE $${this.paramIndex}`);
      this.values.push(`%${value}%`);
    }
    this.paramIndex++;
    return this;
  }

  addTokenSearch(field: string, system: string, code: string) {
    this.conditions.push(`
      resource->'${field}' @> $${this.paramIndex}
    `);
    this.values.push(JSON.stringify([{
      system,
      code
    }]));
    this.paramIndex++;
    return this;
  }

  addDateSearch(field: string, operator: string, date: string) {
    const ops = {
      'eq': '=',
      'ne': '!=',
      'gt': '>',
      'ge': '>=',
      'lt': '<',
      'le': '<='
    };
    
    this.conditions.push(`
      (resource->>'${field}')::date ${ops[operator] || '='} $${this.paramIndex}
    `);
    this.values.push(date);
    this.paramIndex++;
    return this;
  }

  build(baseQuery: string) {
    let query = baseQuery;
    if (this.conditions.length > 0) {
      query += ' AND ' + this.conditions.join(' AND ');
    }
    return { query, values: this.values };
  }
}

// Usage
async function searchPatients(params: PatientSearchParams): Promise<USCorePatient[]> {
  const builder = new FHIRSearchBuilder();
  
  if (params.name) {
    builder.addStringSearch('name.0.family', params.name);
  }
  
  if (params.gender) {
    builder.addStringSearch('gender', params.gender, true);
  }
  
  if (params.birthdate) {
    builder.addDateSearch('birthDate', 'eq', params.birthdate);
  }

  const { query, values } = builder.build('SELECT resource FROM patients WHERE 1=1');
  
  // Add pagination
  const count = params._count || 20;
  const offset = params._offset || 0;
  const finalQuery = `${query} LIMIT ${count} OFFSET ${offset}`;
  
  const result = await pool.query(finalQuery, values);
  return result.rows.map(row => row.resource).filter(isUSCorePatient);
}
```

## Bundle Operations

### Transaction Bundle Processing

```typescript
import { Bundle, BundleEntry } from './types/fhir';

export class BundleProcessor {
  async processTransaction(bundle: Bundle): Promise<Bundle> {
    if (bundle.type !== 'transaction') {
      throw new Error('Only transaction bundles are supported');
    }

    const responseEntries: BundleEntry[] = [];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (const entry of bundle.entry || []) {
        const response = await this.processEntry(entry, client);
        responseEntries.push(response);
      }

      await client.query('COMMIT');

      return {
        resourceType: 'Bundle',
        type: 'transaction-response',
        entry: responseEntries
      };

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async processEntry(entry: BundleEntry, client: any): Promise<BundleEntry> {
    const { resource, request } = entry;
    
    if (!request || !resource) {
      throw new Error('Invalid bundle entry');
    }

    switch (request.method) {
      case 'POST':
        return this.handleCreate(resource, request, client);
      case 'PUT':
        return this.handleUpdate(resource, request, client);
      case 'DELETE':
        return this.handleDelete(request, client);
      default:
        throw new Error(`Unsupported method: ${request.method}`);
    }
  }

  private async handleCreate(resource: any, request: any, client: any): Promise<BundleEntry> {
    // Generate ID if not provided
    if (!resource.id) {
      resource.id = `${resource.resourceType.toLowerCase()}-${Date.now()}`;
    }

    // Save to database
    await client.query(
      'INSERT INTO resources (id, resource_type, resource) VALUES ($1, $2, $3)',
      [resource.id, resource.resourceType, JSON.stringify(resource)]
    );

    return {
      response: {
        status: '201 Created',
        location: `${resource.resourceType}/${resource.id}`
      },
      resource
    };
  }
}
```

## Testing

### API Testing with Supertest

```typescript
import request from 'supertest';
import { app } from '../app';
import { USCorePatient } from '../types/fhir';

describe('Patient API', () => {
  const testPatient: USCorePatient = {
    resourceType: 'Patient',
    identifier: [{ value: 'TEST-123' }],
    name: [{ family: 'Doe', given: ['John'] }],
    gender: 'male',
    active: true
  };

  it('should create a patient', async () => {
    const response = await request(app)
      .post('/fhir/Patient')
      .send(testPatient)
      .expect(201);

    expect(response.body.resourceType).toBe('Patient');
    expect(response.body.id).toBeDefined();
    expect(response.headers.location).toMatch(/\/fhir\/Patient\/.+/);
  });

  it('should reject invalid patient', async () => {
    const invalidPatient = { resourceType: 'InvalidType' };

    const response = await request(app)
      .post('/fhir/Patient')
      .send(invalidPatient)
      .expect(400);

    expect(response.body.resourceType).toBe('OperationOutcome');
    expect(response.body.issue[0].severity).toBe('error');
  });

  it('should search patients', async () => {
    const response = await request(app)
      .get('/fhir/Patient?name=Doe')
      .expect(200);

    expect(response.body.resourceType).toBe('Bundle');
    expect(response.body.type).toBe('searchset');
    expect(Array.isArray(response.body.entry)).toBe(true);
  });
});
```

## Best Practices

### 1. Resource Validation

Always validate FHIR resources:

```typescript
// Good: Validate before processing
if (!isUSCorePatient(req.body)) {
  return res.status(400).json(createOperationOutcome(
    'error', 'invalid', 'Invalid Patient resource'
  ));
}

const patient: USCorePatient = req.body;
```

### 2. Error Handling

Use FHIR OperationOutcome for all errors:

```typescript
// Good: FHIR-compliant error responses
function handleError(error: Error, res: Response) {
  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: [{
      severity: 'error',
      code: 'exception',
      details: { text: error.message }
    }]
  };
  res.status(500).json(outcome);
}
```

### 3. Search Implementation

Implement proper FHIR search:

```typescript
// Good: Support FHIR search parameters
app.get('/fhir/Patient', async (req, res) => {
  const searchParams = {
    name: req.query.name as string,
    gender: req.query.gender as string,
    _count: parseInt(req.query._count as string) || 20
  };
  
  const patients = await searchPatients(searchParams);
  // Return Bundle with proper structure
});
```

### 4. Performance Optimization

Use database indexes and pagination:

```sql
-- Create indexes for common search parameters
CREATE INDEX idx_patients_name ON patients USING GIN ((resource->'name'));
CREATE INDEX idx_patients_gender ON patients ((resource->>'gender'));
CREATE INDEX idx_patients_birthdate ON patients ((resource->>'birthDate'));
```

## Next Steps

- **[Advanced Configuration](./advanced-configuration.md)** - Complex scenarios
- **[Examples](../../examples/healthcare-api/)** - Complete API implementation
- **[FHIR Usage Guide](./fhir-usage.md)** - FHIR-specific features

## Resources

- **[FHIR RESTful API](https://hl7.org/fhir/http.html)** - FHIR HTTP specification
- **[Express.js](https://expressjs.com/)** - Web framework
- **[Fastify](https://www.fastify.io/)** - Fast web framework
- **[Bun HTTP](https://bun.sh/docs/api/http)** - Native HTTP server
