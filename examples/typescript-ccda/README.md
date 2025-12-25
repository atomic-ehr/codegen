# TypeScript C-CDA Example

FHIR type generation from HL7 CDA on FHIR specification.

## Overview

This example demonstrates how to generate TypeScript interfaces from the HL7 CDA UV Core (Clinical Document Architecture) FHIR package. It includes:

- Full C-CDA on FHIR type definitions
- Document structure and sections
- Clinical content models
- Export of TypeSchema and dependency tree for debugging

## Generating Types

To generate TypeScript types for CDA:

```bash
bun run examples/typescript-ccda/generate.ts
```

This will output to `./examples/typescript-ccda/fhir-types/` and create debug files.

## Configuration

Edit `generate.ts` to customize:

```typescript
.typescript({
  withDebugComment: false    // Include generation metadata
})
```

## Using Generated Types

### Import CDA Document Types

```typescript
import { ClinicalDocument } from './fhir-types/index.js';

const clinicalDoc: ClinicalDocument = {
  resourceType: 'ClinicalDocument',
  id: 'doc-1',
  code: {
    coding: [{
      system: 'http://loinc.org',
      code: '34133-9'  // Summarization of Episode Note
    }]
  },
  // ... additional fields
};
```

### Working with Document Sections

```typescript
if (clinicalDoc.section) {
  clinicalDoc.section.forEach(section => {
    console.log(`Section: ${section.code?.coding?.[0].display}`);
    // Process section content
  });
}
```
