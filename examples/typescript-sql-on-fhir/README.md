# TypeScript SQL-on-FHIR Example

FHIR type generation from SQL-on-FHIR ViewDefinition specification with tree shaking.

## Overview

This example demonstrates how to generate TypeScript interfaces from the SQL-on-FHIR ViewDefinition FHIR package. It includes:

- SQL-on-FHIR ViewDefinition type definitions
- Remote package loading from build.fhir.org
- Tree shaking to include only specific resources
- Dependency resolution and tree output for debugging

## What is SQL-on-FHIR?

SQL-on-FHIR is a specification for exposing FHIR data through SQL queries. ViewDefinitions define how FHIR resources are mapped to SQL-queryable views.

Learn more: https://sql-on-fhir.org/

## Generating Types

To generate TypeScript types for SQL-on-FHIR:

```bash
bun run examples/typescript-sql-on-fhir/generate.ts
```

This will download the SQL-on-FHIR package from `https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz` and output to `./examples/typescript-sql-on-fhir/fhir-types/`

## Configuration

Edit `generate.ts` to customize:

```typescript
.typescript({
  withDebugComment: false,      // Include generation metadata
  generateProfile: false        // Don't generate profiles
})
```

### Tree Shaking Configuration

The example uses tree shaking to include only ViewDefinition and it's dependencies:

```typescript
.typeSchema({
  treeShake: {
    "org.sql-on-fhir.ig": {
      "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
    },
  },
})
```

## Using Generated Types

### Import ViewDefinition

```typescript
import { ViewDefinition } from './fhir-types/index.js';

const viewDef: ViewDefinition = {
  resourceType: 'ViewDefinition',
  url: 'http://example.org/viewdef/patient-view',
  name: 'PatientView',
  title: 'Patient SQL View',
  status: 'active',
  resource: 'Patient',
};
```

### Working with View Selects

```typescript
if (viewDef.select) {
  viewDef.select.forEach(select => {
    console.log(`Column: ${select.column}`);
    console.log(`Expression: ${select.expression}`);
  });
}
```

### Example: Patient View Definition

```typescript
const patientView: ViewDefinition = {
  resourceType: 'ViewDefinition',
  url: 'http://example.org/ViewDefinition/PatientDemo',
  name: 'PatientDemo',
  title: 'Patient Demographics View',
  status: 'active',
  experimental: false,
  resource: 'Patient',
  select: [
    {
      column: [
        {
          path: 'id',
          name: 'patient_id'
        },
        {
          path: 'name.given.first()',
          name: 'first_name'
        },
        {
          path: 'name.family',
          name: 'last_name'
        },
        {
          path: 'birthDate',
          name: 'date_of_birth'
        },
        {
          path: 'gender',
          name: 'gender'
        }
      ]
    }
  ]
};
```

## Remote Package Loading

This example demonstrates loading packages from remote URLs:

```typescript
.fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
```

This is useful for:
- Packages not published to NPM
- Development/preview versions
- Custom implementation guides

## Regenerating Types

To regenerate with updated settings:

```bash
bun run examples/typescript-sql-on-fhir/generate.ts
```

## SQL-on-FHIR Resources

- [SQL-on-FHIR Official Site](https://sql-on-fhir.org/)
- [FHIR IG Build](https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/)
