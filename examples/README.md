# Examples

This directory contains working examples demonstrating the capabilities of Atomic FHIR Codegen.

## Available Examples

### TypeScript Generation

- **[typescript-r4/](typescript-r4/)** - FHIR R4 core type generation
  - `generate.ts` - Generates TypeScript interfaces for FHIR R4 specification
  - `demo.ts` - Demonstrates resource creation, profile usage (bodyweight), and bundle composition
  - Shows how to use `attach` and `extract` functions for FHIR profiles

- **[typescript-ccda/](typescript-ccda/)** - C-CDA on FHIR type generation
  - `generate.ts` - Generates types from HL7 CDA UV Core package (`hl7.cda.uv.core@2.0.1-sd`)
  - Exports TypeSchema files and dependency tree

- **[typescript-sql-on-fhir/](typescript-sql-on-fhir/)** - SQL on FHIR ViewDefinition types
  - `generate.ts` - Generates types from remote TGZ package
  - Demonstrates tree shaking to include only specific resources

### Multi-Language Generation

- **[python/](python/)** - Python/Pydantic model generation
  - `generate.ts` - Generates Python models with configurable field formats
  - Supports `snake_case` or `camelCase` field naming
  - Configurable extra field validation
  - Client implementation example: [examples/python/client.py](examples/python/client.py).


- **[csharp/](csharp/)** - C# class generation
  - `generate.ts` - Generates C# classes with custom namespace
  - Includes static files for base functionality
  - Includes integration tests with Aidbox FHIR server

### Template-Based Generation

- **[mustache/](mustache/)** - Java generation with Mustache templates
  - `mustache-java-r4-gen.ts` - Generates Java code using Mustache templates
  - Full Maven project structure with post-generation hooks
  - Demonstrates template-driven code generation for any language or format

### Local Package Support

- **[local-package-folder/](local-package-folder/)** - Working with unpublished FHIR packages
  - `generate.ts` - Loads local StructureDefinitions from disk
  - Demonstrates dependency resolution with FHIR R4 core
  - Shows tree shaking for custom logical models

## Running Examples

Each example contains a `generate.ts` script that can be run with:

```bash
# Using Bun
bun run examples/typescript-r4/generate.ts

# Using Node with tsx
npx tsx examples/typescript-r4/generate.ts

# Using ts-node
npx ts-node examples/typescript-r4/generate.ts
```

To run the TypeScript R4 demo after generation:

```bash
bun run examples/typescript-r4/demo.ts
```

For the Mustache example:

```bash
bun run examples/mustache/mustache-java-r4-gen.ts
```

This generates a complete Maven project with Java classes ready to build.

## Prerequisites for C# Example

The C# example includes integration tests with Aidbox FHIR server. To run the tests:

```bash
# Start Aidbox server
docker compose up

# In another terminal, run the C# tests
cd examples/csharp
dotnet test
```

See [examples/csharp/README.md](csharp/README.md) for detailed setup instructions.
