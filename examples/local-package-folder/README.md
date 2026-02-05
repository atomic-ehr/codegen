# Local Package Folder Example

Working with custom, unpublished FHIR packages and StructureDefinitions from local files.

## Overview

This example demonstrates how to generate TypeScript types from custom FHIR StructureDefinitions stored on disk, without publishing them to the NPM registry. It includes:

- Loading local StructureDefinition JSON files
- Declaring custom FHIR packages
- Resolving dependencies with published packages (e.g., FHIR R4 core)
- Tree shaking to include only specific custom resources
- Combining local and published packages

## Directory Structure

```
local-package-folder/
├── README.md                    # This file
├── generate.ts                  # Type generation script
├── structure-definitions/       # Your custom StructureDefinitions
│   ├── ExampleNotebook.json    # Custom logical model
│   └── ...                     # Other StructureDefinitions
└── (generated output)          # TypeScript files (after generation)
```

## Adding Your StructureDefinitions

### Create Structure Definition Files

Place your FHIR StructureDefinition JSON files in the `structure-definitions/` directory:

```json
{
  "resourceType": "StructureDefinition",
  "id": "ExampleNotebook",
  "url": "http://example.org/fhir/StructureDefinition/ExampleNotebook",
  "name": "ExampleNotebook",
  "title": "Example Notebook",
  "status": "draft",
  "kind": "logical",
  "abstract": false,
  "type": "ExampleNotebook",
  "description": "A custom notebook resource for the example",
  "differential": {
    "element": [
      {
        "id": "ExampleNotebook",
        "path": "ExampleNotebook",
        "definition": "Root element"
      },
      {
        "id": "ExampleNotebook.title",
        "path": "ExampleNotebook.title",
        "type": [{"code": "string"}],
        "min": 1,
        "max": "1"
      },
      {
        "id": "ExampleNotebook.content",
        "path": "ExampleNotebook.content",
        "type": [{"code": "string"}],
        "min": 0,
        "max": "*"
      }
    ]
  }
}
```

### Update generate.ts

Edit `generate.ts` to point to your StructureDefinitions:

```typescript
await builder
    .localStructureDefinitions({
        package: {
            name: "example.folder.structures",      // Your package name
            version: "0.0.1"                        // Your version
        },
        path: Path.join(__dirname, "structure-definitions"),
        dependencies: [
            { name: "hl7.fhir.r4.core", version: "4.0.1" }
        ],
    })
    .typescript({})
    .outputTo("./examples/local-package-folder")
    .generate();
```

## Generating Types

To generate TypeScript types:

```bash
bun run examples/local-package-folder/generate.ts
```

### With Tree Shaking

To include only specific resources:

```typescript
.typeSchema({
    treeShake: {
        "example.folder.structures": {
            "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
            "http://example.org/fhir/StructureDefinition/OtherResource": {},
        }
    }
})
```

### With Field Selection

To include only specific fields:

```typescript
.typeSchema({
    treeShake: {
        "example.folder.structures": {
            "http://example.org/fhir/StructureDefinition/ExampleNotebook": {
                selectFields: ["id", "title", "content"]
            }
        }
    }
})
```

## Using Generated Types

```typescript
import { ExampleNotebook } from './ExampleNotebook.js';

const notebook: ExampleNotebook = {
    resourceType: "ExampleNotebook",
    id: "notebook-1",
    title: "My Notebook",
    content: [
        "First note",
        "Second note"
    ]
};
```

## Combining Local and Published Packages

You can use both local and published packages together:

```typescript
await builder
    // Local package
    .localStructureDefinitions({
        package: { name: "example.local", version: "1.0.0" },
        path: "./my-definitions",
        dependencies: [
            { name: "hl7.fhir.r4.core", version: "4.0.1" }
        ]
    })
    // Published package
    .fromPackage("hl7.fhir.us.core", "6.1.0")
    .typescript({})
    .outputTo("./generated")
    .generate();
```

## Advanced: Using TGZ Archives

If you have a packaged TGZ file instead of loose StructureDefinitions:

```typescript
await builder
    .localTgzPackage("./packages/my-custom-ig.tgz")
    .typescript({})
    .outputTo("./generated")
    .generate();
```
