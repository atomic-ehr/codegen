# Examples

This directory contains working examples demonstrating the capabilities of Atomic FHIR Codegen.

## Available Examples

### TypeScript Generation

- **[typescript-r4/](typescript-r4/)** - FHIR R4 core type generation ✅ Code included
  - Full FHIR R4 resource type definitions with profiles and bundles
  - Demonstrates `attach` and `extract` functions for FHIR profiles
  - Includes demo showing resource creation and bundle composition

- **[typescript-ccda/](typescript-ccda/)** - C-CDA on FHIR type generation ✅ Code included
  - HL7 CDA UV Core package (`hl7.cda.uv.core@2.0.1-sd`)
  - Document structure and clinical content models

- **[typescript-sql-on-fhir/](typescript-sql-on-fhir/)** - SQL on FHIR ViewDefinition types ✅ Code included
  - Remote TGZ package loading from build.fhir.org
  - Demonstrates tree shaking to include only ViewDefinition
  - Shows SQL-on-FHIR view definition patterns

- **[local-package-folder/](local-package-folder/)** - Custom FHIR packages from local files ✅ Code included
  - Load unpublished StructureDefinitions from disk
  - Combine local and published packages
  - Dependency resolution with FHIR R4 core
  - Tree shaking for custom logical models

### Python Generation

- **[python/](python/)** - Python/Pydantic model generation ✅ Code included
  - Full FHIR R4 as Pydantic models
  - Configurable field formats (`snake_case` or `camelCase`)
  - Automatic validation and serialization with Pydantic
  - Virtual environment setup instructions
  - Client implementation example: [examples/python/client.py](examples/python/client.py).

### C# Generation

- **[csharp/](csharp/)** - C# class generation ✅ Code included
  - Full FHIR R4 as C# classes
  - Custom namespace support
  - Integration tests with Aidbox FHIR server

## Prerequisites

- **Bun 1.0+** or Node.js 18+
- **RAM**: 1GB+ minimum, 2GB+ recommended for full R4 package generation
- **Python 3.10+** (for Python example only)
- **.NET 6.0+** (for C# example only)
- **Docker & Docker Compose** (optional, for C# Aidbox integration tests)

## Quick Start

### Setup

From the project root:

```bash
cd codegen
bun install
```

### Generate Types

Run any example with:

```bash
# Using Bun (recommended)
bun run examples/typescript-r4/generate.ts

# Using Node with tsx
npx tsx examples/typescript-r4/generate.ts

# Using ts-node
npx ts-node examples/typescript-r4/generate.ts
```

Replace `typescript-r4` with any example name:
- `typescript-ccda`
- `typescript-sql-on-fhir`
- `local-package-folder`
- `python`
- `csharp`

## Generated Output Structure

Each example generates output following this pattern:

```
example/
├── README.md                    # Example-specific guide
├── generate.ts                  # Generation script
├── generated/                   # Output (created after generation)
│   ├── index.ts/py/cs          # Main exports
│   ├── resources/               # FHIR resources
│   ├── types/                   # Complex types
│   └── enums/                   # Value set enums
└── [language-specific files]    # requirements.txt, .csproj, etc.
```

## Debug Output

During type generation, you can inspect intermediate data structures to understand how FHIR is transformed into your target language:

### `writeTypeSchemas`

```typescript
.writeTypeSchemas("./debug-schemas")
```

Exports the **TypeSchema** intermediate format as NDJSON files - the universal representation between FHIR and target languages.

### `writeTypeTree`

```typescript
.writeTypeTree("./dependency-tree.yaml")
```

Generates a **YAML file showing the dependency graph** - which types depend on which other types and their origin packages.

## Integration Examples

Add to your build pipeline

```bash
#!/bin/bash
# scripts/generate-fhir-types.sh
cd codegen
bun run examples/typescript-r4/generate.ts
```

```json
{
  "scripts": {
    "generate:types": "bash scripts/generate-fhir-types.sh",
    "prebuild": "npm run generate:types"
  }
}
```

## Support

For issues or questions:
- Check main [README.md](../README.md)
- Review [CONTRIBUTING.md](../CONTRIBUTING.md)
- Open an issue on GitHub
