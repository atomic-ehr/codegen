# Examples

This directory contains working examples demonstrating the capabilities of Atomic FHIR Codegen.

## Available Examples

### TypeScript Generation

- **[typescript-r4-us-core/](typescript-r4-us-core/)** - FHIR R4 core + US Core type generation with profile classes
  - `generate.ts` - Generates TypeScript interfaces for FHIR R4 core and US Core 8.0.1 in one tree
  - Resource creation, base R4 profiles (bodyweight, blood pressure), and bundle composition
  - US Core profiles with type-safe race/ethnicity/birth-sex extensions and observation slicing

- **[typescript-custom-packages/](typescript-custom-packages/)** - Feeding packages from sources other than the registry
  - `generate.ts` - Runs two input mechanisms: local unpublished StructureDefinitions from disk (`.localStructureDefinitions()`) and a remote TGZ package by URL (`.fromPackageRef()`, SQL-on-FHIR ViewDefinition)
  - Demonstrates dependency resolution with FHIR R4/R5 core and tree shaking

### Python Generation

- **[python/](python/)** - Python/Pydantic model generation with simple requests-based client
  - `generate.ts` - Generates Python models with configurable field formats
  - Supports `snake_case` or `camelCase` field naming
  - Configurable extra field validation
  - Client implementation example: [python/client.py](python/client.py)

- **[python-fhirpy/](python-fhirpy/)** - Python/Pydantic models with fhirpy async client
  - `generate.ts` - Generates Python models with fhirpy integration
  - Uses `fhirpyClient: true` for async FHIR client support
  - Client implementation example: [python-fhirpy/client.py](python-fhirpy/client.py)

### C# Generation

- **[csharp/](csharp/)** - C# class generation
  - `generate.ts` - Generates C# classes with custom namespace
  - Includes static files for base functionality
  - Includes integration tests with Aidbox FHIR server

The C# integration tests require an Aidbox FHIR server:

```bash
# Start Aidbox server
docker compose up

# In another terminal, run the C# tests
cd examples/csharp
dotnet test
```

See [examples/csharp/README.md](csharp/README.md) for detailed setup instructions.

### Template-Based Generation

- **[mustache/](mustache/)** - Java generation with Mustache templates
  - `mustache-java-r4-gen.ts` - Generates Java code using Mustache templates
  - Full Maven project structure with post-generation hooks
  - Demonstrates template-driven code generation for any language or format

### On-the-Fly Generation

These examples pull packages from the FHIR registry and generate types on-the-fly (generated types are gitignored and regenerated on CI).

- **[on-the-fly/norge-r4/](on-the-fly/norge-r4/)** - Norwegian FHIR profiles (Grunndata, no-basis, SFM)
  - `generate.ts` - Fetches multiple Norwegian FHIR packages from Simplifier
  - Demonstrates `preprocessPackage` for fixing package metadata and dependency injection

- **[on-the-fly/kbv-r4/](on-the-fly/kbv-r4/)** - German KBV profiles (kbv.ita.for)
  - `generate.ts` - Fetches KBV packages with `ignorePackageIndex: true` for corrupt package indices
  - `profile-patient.test.ts` - Regression test for `meta` merge in profiles with required `meta` (#137)

- **[on-the-fly/ccda/](on-the-fly/ccda/)** - C-CDA on FHIR type generation (HL7 CDA logical models)
  - `generate.ts` - Builds a `CanonicalManager` with `preprocessPackage` fixes and `promoteLogical` for CDA resources
  - `demo-cda.test.ts` / `demo-ccda.test.ts` - CDA ↔ FHIR R4 mapping demos

## Running Examples

Each example contains a `generate.ts` script that can be run with:

```bash
# Using Bun
bun run examples/typescript-r4-us-core/generate.ts

# Using Node with tsx
npx tsx examples/typescript-r4-us-core/generate.ts

# Using ts-node
npx ts-node examples/typescript-r4-us-core/generate.ts
```
