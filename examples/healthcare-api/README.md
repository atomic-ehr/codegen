# Healthcare API Example

Complete example of building a FHIR-compliant healthcare API using atomic-codegen generated types.

## Overview

This example demonstrates:

- 🏥 **FHIR-compliant REST API** with full type safety
- 📋 **US Core profiles** for US healthcare compliance
- ✅ **Request/response validation** with generated type guards
- 🗄️ **Database integration** with typed FHIR resources
- 📖 **OpenAPI documentation** generation
- 🧪 **Comprehensive testing** with FHIR test data

## Architecture

```
healthcare-api/
├── src/
│   ├── types/fhir/          # Generated FHIR types
│   ├── controllers/         # API controllers
│   ├── models/             # Database models
│   ├── middleware/         # Validation middleware
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   └── utils/              # Utilities
├── tests/                  # Test suite
├── docs/                   # API documentation
└── scripts/                # Build scripts
```

## Getting Started

### Prerequisites

- Node.js 18+ or Bun 1.0+
- PostgreSQL (or your preferred database)
- Docker (optional, for development)

### 1. Generate FHIR Types

```bash
# Generate US Core types
atomic-codegen typeschema create \
  hl7.fhir.r4.core@4.0.1 \
  hl7.fhir.us.core@6.1.0 \
  -o fhir-uscore.ndjson

atomic-codegen generate typescript \
  -i fhir-uscore.ndjson \
  -o ./src/types/fhir \
  --generate-profiles \
  --generate-validators
```

### 2. Install Dependencies

```bash
bun install
```

### 3. Set Up Database

```bash
# Start PostgreSQL (using Docker)
docker run -d \
  --name fhir-postgres \
  -e POSTGRES_DB=fhir_api \
  -e POSTGRES_USER=fhir \
  -e POSTGRES_PASSWORD=fhir123 \
  -p 5432:5432 \
  postgres:15

# Run migrations
bun run db:migrate
```

### 4. Start Development Server

```bash
bun run dev
```

The API will be available at `http://localhost:3000`

## API Endpoints

### Patient Resources

```http
GET    /fhir/Patient           # Search patients
POST   /fhir/Patient           # Create patient
GET    /fhir/Patient/:id       # Get patient by ID
PUT    /fhir/Patient/:id       # Update patient
DELETE /fhir/Patient/:id       # Delete patient
```

### Observation Resources

```http
GET    /fhir/Observation       # Search observations
POST   /fhir/Observation       # Create observation
GET    /fhir/Observation/:id   # Get observation by ID
PUT    /fhir/Observation/:id   # Update observation
```

### Bundle Operations

```http
POST   /fhir                   # Transaction bundle
GET    /fhir/$export           # Bulk data export
```

## Example Usage

### Creating a US Core Patient

```typescript
import { USCorePatient } from './src/types/fhir';

const patient: USCorePatient = {
  resourceType: 'Patient',
  identifier: [{
    use: 'official',
    system: 'http://hospital.org/patient-ids',
    value: 'MRN-123456'
  }],
  name: [{
    use: 'official',
    family: 'Johnson',
    given: ['Maria', 'Elena']
  }],
  gender: 'female',
  birthDate: '1985-03-15',
  active: true,
  extension: [
    {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      extension: [{
        url: 'text',
        valueString: 'Hispanic or Latino'
      }]
    }
  ]
};

// Create via API
const response = await fetch('/fhir/Patient', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/fhir+json'
  },
  body: JSON.stringify(patient)
});

const created = await response.json();
console.log('Created patient:', created.id);
```

### Creating Observations

```typescript
import { USCoreObservation } from './src/types/fhir';

// Blood pressure observation
const bloodPressure: USCoreObservation = {
  resourceType: 'Observation',
  status: 'final',
  category: [{
    coding: [{
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs'
    }]
  }],
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '85354-9',
      display: 'Blood pressure panel'
    }]
  },
  subject: {
    reference: 'Patient/123'
  },
  effectiveDateTime: '2023-12-01T10:30:00Z',
  component: [
    {
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8480-6',
          display: 'Systolic blood pressure'
        }]
      },
      valueQuantity: {
        value: 120,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]'
      }
    },
    {
      code: {
        coding: [{
          system: 'http://loinc.org',
          code: '8462-4',
          display: 'Diastolic blood pressure'
        }]
      },
      valueQuantity: {
        value: 80,
        unit: 'mmHg',
        system: 'http://unitsofmeasure.org',
        code: 'mm[Hg]'
      }
    }
  ]
};
```

### Search with Parameters

```typescript
// Search for patients by name
const patients = await fetch('/fhir/Patient?name=Johnson&active=true');

// Search for observations by patient
const observations = await fetch('/fhir/Observation?subject=Patient/123&category=vital-signs');

// Complex search with multiple parameters
const results = await fetch('/fhir/Observation?patient=123&code=http://loinc.org|8480-6&date=ge2023-01-01');
```

## Project Structure

### Controllers (`src/controllers/`)

Type-safe API controllers with automatic validation:

```typescript
// src/controllers/PatientController.ts
import { Request, Response } from 'express';
import { USCorePatient } from '../types/fhir';
import { isUSCorePatient } from '../types/fhir/guards';
import { PatientService } from '../services/PatientService';

export class PatientController {
  async createPatient(req: Request, res: Response) {
    // Automatic validation with type guards
    if (!isUSCorePatient(req.body)) {
      return res.status(400).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'invalid',
          details: { text: 'Invalid Patient resource' }
        }]
      });
    }

    const patient: USCorePatient = req.body;
    const created = await PatientService.create(patient);
    
    res.status(201).json(created);
  }

  async getPatient(req: Request, res: Response) {
    const { id } = req.params;
    const patient = await PatientService.findById(id);
    
    if (!patient) {
      return res.status(404).json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-found',
          details: { text: `Patient/${id} not found` }
        }]
      });
    }

    res.json(patient);
  }
}
```

### Services (`src/services/`)

Business logic with typed FHIR operations:

```typescript
// src/services/PatientService.ts
import { USCorePatient } from '../types/fhir';
import { PatientModel } from '../models/PatientModel';
import { validateUSCorePatient } from '../validators/USCoreValidator';

export class PatientService {
  static async create(patient: USCorePatient): Promise<USCorePatient> {
    // Validate US Core constraints
    const validation = validateUSCorePatient(patient);
    if (!validation.valid) {
      throw new ValidationError(validation.errors);
    }

    // Generate ID if not provided
    if (!patient.id) {
      patient.id = generateId();
    }

    // Save to database
    const saved = await PatientModel.create(patient);
    return saved;
  }

  static async findById(id: string): Promise<USCorePatient | null> {
    const patient = await PatientModel.findById(id);
    return patient;
  }

  static async search(params: PatientSearchParams): Promise<USCorePatient[]> {
    return PatientModel.search(params);
  }
}
```

### Database Models (`src/models/`)

Database integration with FHIR resource mapping:

```typescript
// src/models/PatientModel.ts
import { USCorePatient } from '../types/fhir';
import { db } from '../config/database';

export class PatientModel {
  static async create(patient: USCorePatient): Promise<USCorePatient> {
    const result = await db.query(
      'INSERT INTO patients (id, resource) VALUES ($1, $2) RETURNING *',
      [patient.id, JSON.stringify(patient)]
    );

    return result.rows[0].resource;
  }

  static async findById(id: string): Promise<USCorePatient | null> {
    const result = await db.query(
      'SELECT resource FROM patients WHERE id = $1',
      [id]
    );

    return result.rows[0]?.resource || null;
  }

  static async search(params: any): Promise<USCorePatient[]> {
    // Build dynamic query based on FHIR search parameters
    let query = 'SELECT resource FROM patients WHERE 1=1';
    const values: any[] = [];

    if (params.name) {
      query += ' AND resource->>\'name\' ILIKE $' + (values.length + 1);
      values.push(`%${params.name}%`);
    }

    if (params.active !== undefined) {
      query += ' AND resource->>\'active\' = $' + (values.length + 1);
      values.push(params.active.toString());
    }

    const result = await db.query(query, values);
    return result.rows.map(row => row.resource);
  }
}
```

### Middleware (`src/middleware/`)

FHIR-specific middleware for validation and error handling:

```typescript
// src/middleware/fhirValidation.ts
import { Request, Response, NextFunction } from 'express';
import { isPatient, isObservation } from '../types/fhir/guards';

export function validateFHIRResource(req: Request, res: Response, next: NextFunction) {
  const { resourceType } = req.body;

  let isValid = false;
  switch (resourceType) {
    case 'Patient':
      isValid = isPatient(req.body);
      break;
    case 'Observation':
      isValid = isObservation(req.body);
      break;
    // Add other resource types...
  }

  if (!isValid) {
    return res.status(400).json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'error',
        code: 'invalid',
        details: { text: `Invalid ${resourceType} resource` }
      }]
    });
  }

  next();
}
```

## Testing

### Test Structure

```
tests/
├── unit/               # Unit tests
│   ├── controllers/
│   ├── services/
│   └── models/
├── integration/        # API integration tests
│   ├── patient.test.ts
│   ├── observation.test.ts
│   └── bundle.test.ts
├── fixtures/           # Test FHIR resources
│   ├── patients/
│   ├── observations/
│   └── bundles/
└── helpers/           # Test utilities
```

### Example Tests

```typescript
// tests/integration/patient.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { app } from '../src/app';
import { USCorePatient } from '../src/types/fhir';
import { testPatient } from './fixtures/patients/test-patient';

describe('Patient API', () => {
  let patientId: string;

  it('should create a new patient', async () => {
    const response = await fetch('http://localhost:3000/fhir/Patient', {
      method: 'POST',
      headers: { 'Content-Type': 'application/fhir+json' },
      body: JSON.stringify(testPatient)
    });

    expect(response.status).toBe(201);
    
    const created: USCorePatient = await response.json();
    expect(created.resourceType).toBe('Patient');
    expect(created.id).toBeDefined();
    
    patientId = created.id!;
  });

  it('should get patient by ID', async () => {
    const response = await fetch(`http://localhost:3000/fhir/Patient/${patientId}`);
    expect(response.status).toBe(200);
    
    const patient: USCorePatient = await response.json();
    expect(patient.id).toBe(patientId);
    expect(patient.name?.[0]?.family).toBe(testPatient.name?.[0]?.family);
  });

  it('should search patients by name', async () => {
    const response = await fetch('http://localhost:3000/fhir/Patient?name=Johnson');
    expect(response.status).toBe(200);
    
    const bundle = await response.json();
    expect(bundle.resourceType).toBe('Bundle');
    expect(bundle.entry).toBeDefined();
    expect(bundle.entry.length).toBeGreaterThan(0);
  });
});
```

## Deployment

### Docker Support

```dockerfile
# Dockerfile
FROM oven/bun:1 as builder

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install

COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000
CMD ["bun", "run", "start"]
```

### Environment Configuration

```bash
# .env
DATABASE_URL=postgresql://fhir:fhir123@localhost:5432/fhir_api
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret
FHIR_BASE_URL=http://localhost:3000/fhir
LOG_LEVEL=info
```

### Production Deployment

```yaml
# docker-compose.yml
version: '3.8'
services:
  api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://fhir:fhir123@postgres:5432/fhir_api
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: fhir_api
      POSTGRES_USER: fhir
      POSTGRES_PASSWORD: fhir123
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

## Key Features

### ✅ Complete Type Safety
- All API endpoints use generated FHIR types
- Request/response validation with type guards
- Compile-time error checking

### 🏥 FHIR Compliance
- US Core profile support
- FHIR search parameter handling
- Bundle transaction support
- OperationOutcome error responses

### 🚀 Performance Optimized
- Built with Bun for maximum performance
- Efficient database queries with JSONB
- Redis caching for search results
- Streaming support for large datasets

### 📖 Auto-Generated Documentation
- OpenAPI specification from types
- Interactive API documentation
- FHIR conformance statement

## Next Steps

1. **Customize**: Modify the example for your specific use case
2. **Extend**: Add support for additional FHIR resources
3. **Deploy**: Use the Docker setup for production deployment
4. **Monitor**: Add logging, metrics, and monitoring
5. **Scale**: Implement caching, load balancing, and clustering

## Related Examples

- [Frontend App](../frontend-app/) - React app consuming this API
- [Python FastAPI](../python-fastapi/) - Python equivalent
- [GraphQL API](../graphql-api/) - GraphQL wrapper for FHIR

## Questions?

- Check the [FHIR Usage Guide](../../docs/guides/fhir-usage.md)
- Review the [API Reference](../../docs/api-reference/)
- Open an issue on [GitHub](https://github.com/atomic-ehr/codegen/issues)