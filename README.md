# Atomic EHR Codegen

[![npm canary](https://img.shields.io/npm/v/@atomic-ehr/codegen/canary.svg?label=canary)](https://www.npmjs.com/package/@atomic-ehr/codegen/v/canary)
[![npm version](https://badge.fury.io/js/%40atomic-ehr%2Fcodegen.svg)](https://badge.fury.io/js/%40atomic-ehr%2Fcodegen)
[![CI](https://github.com/atomic-ehr/codegen/actions/workflows/ci.yml/badge.svg)](https://github.com/atomic-ehr/codegen/actions/workflows/ci.yml)
[![SDK Tests](https://github.com/atomic-ehr/codegen/actions/workflows/sdk-tests.yml/badge.svg)](https://github.com/atomic-ehr/codegen/actions/workflows/sdk-tests.yml)

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [Atomic EHR Codegen](#atomic-ehr-codegen)
  - [Features](#features)
  - [Versions & Release Cycle](#versions--release-cycle)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
    - [Usage Examples](#usage-examples)
  - [Architecture](#architecture)
    - [Input - FHIR packages & resolves canonicals](#input---fhir-packages--resolves-canonicals)
      - [Load Local StructureDefinitions & TGZ Archives](#load-local-structuredefinitions--tgz-archives)
    - [Intermediate - Type Schema](#intermediate---type-schema)
      - [Tree Shaking](#tree-shaking)
    - [Generation](#generation)
  - [Roadmap](#roadmap)
  - [Support](#support)

<!-- markdown-toc end -->

A powerful, extensible code generation toolkit for FHIR ([Fast Healthcare Interoperability Resources](https://www.hl7.org/fhir/)) that transforms FHIR specifications into strongly-typed code for multiple programming languages.

## Features

- 🚀 **High-Performance** - Built with Bun runtime for blazing-fast generation
- 🔧 **Extensible Architecture** - Three-stage pipeline:
    - FHIR package management & canonical resolution
    - Optimized intermediate FHIR data entities representation via Type Schema
    - Generation for different programming languages
- 📦 **Multi-Package Support** - Generate from a list of FHIR packages
- 🎯 **Type-Safe** - Generates fully typed interfaces with proper inheritance
- 🛠️ **Developer Friendly** - Fluent API

## Versions & Release Cycle

- `canary` channel - Latest development version from `main` branch
- `latest` channel - Latest stable version, changelog: [Releases](https://github.com/atomic-ehr/codegen/releases)
- All versions: [NPM: @atomic-ehr/codegen](https://www.npmjs.com/package/@atomic-ehr/codegen?activeTab=versions)

## Installation

```bash
# Using npm
npm install @atomic-ehr/codegen

# Using bun
bun add @atomic-ehr/codegen

# Using yarn
yarn add @atomic-ehr/codegen
```

## Quick Start

1. Write SDK generation script (`generate-types.ts`):

    ```typescript
    import { APIBuilder } from '@atomic-ehr/codegen';

    const builder = new APIBuilder()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .typescript({})
        .outputTo("./examples/typescript-r4/fhir-types");

    const report = await builder.generate();
    console.log(report);
    ```

2. Run the script with:

    - `npm exec tsx generate-types.ts`
    - `bun run generate-types.ts`
    - `pnpm exec tsx generate-types.ts`

### Usage Examples

See the [examples/](examples/) directory for working demonstrations:

- **[typescript-r4/](examples/typescript-r4/)** - FHIR R4 type generation with resource creation demo and profile usage
- **[typescript-ccda/](examples/typescript-ccda/)** - C-CDA on FHIR type generation
- **[typescript-sql-on-fhir/](examples/typescript-sql-on-fhir/)** - SQL on FHIR ViewDefinition with tree shaking
- **[python/](examples/python/)** - Python/Pydantic model generation with configurable field formats
- **[csharp/](examples/csharp/)** - C# class generation with namespace configuration
- **[local-package-folder/](examples/local-package-folder/)** - Loading unpublished local FHIR packages

For detailed documentation, see [examples/README.md](examples/README.md).

## Architecture

The toolkit uses a three-stage architecture (details: [link](https://www.health-samurai.io/articles/type-schema-a-pragmatic-approach-to-build-fhir-sdk)):

1. **Input** - FHIR packages & resolves canonicals
2. **Intermediate representation** - TypeSchema provides a universal representation for FHIR data entities and processing utilities
3. **Generation** - Generate code for TypeScript, Python, etc.

The `APIBuilder` provides a fluent interface for configuring and generating code:

```typescript
const builder = new APIBuilder()

    // Input sources (choose one or combine)
    .fromPackage("hl7.fhir.r4.core", "4.0.1") // NPM registry package
    .fromPackageRef("https://...package.tgz")  // Remote TGZ file
    .localStructureDefinitions({ ... })        // Loose JSON files

    // Type Schema processing
    .treeShake({ ... })                        // Include only specified types

    // Code generator (choose one)
    .typescript({                              // TypeScript generator
        generateProfile?: boolean,
        withDebugComment?: boolean,
        openResourceTypeSet?: boolean,
    })
    .python({                                   // Python generator
        allowExtraFields?: boolean,
        fieldFormat?: "snake_case" | "camelCase",
        staticDir?: string,
    })
    .csharp("NameSpace", "staticFilesPath")   // C# generator

    // Output configuration
    .outputTo("./generated/types")             // Output directory
    .cleanOutput(true)                         // Clean before generation

    // Optional: Optimization & debugging
    .throwException()                          // Throw on errors (optional)
    .writeTypeSchemas("./schemas")             // Export TypeSchema files
    .writeTypeTree("./tree.yaml")              // Export dependency tree

    // Execute generation
    .generate();                                // Returns GenerationReport
```

Each method returns the builder instance, allowing method chaining. The `generate()` method executes the pipeline and returns a report with success status and generated file details.

### Input - FHIR packages & resolves canonicals

The input stage leverages [Canonical Manager](https://github.com/atomic-ehr/canonical-manager) to handle FHIR package management and dependency resolution. It processes FHIR packages from multiple sources (registry, local files, TGZ archives) and resolves all canonical URLs to their concrete definitions, ensuring all references between resources are properly linked before transformation.

The [`Register`](src/typeschema/register.ts) component wraps Canonical Manager specifically for codegen purposes, providing:

- **Multi-package indexing** for fast canonical URL lookups across package boundaries
- **Package-aware resolution** with automatic dependency tree traversal
- **FHIR-to-TypeSchema conversion** using the `@atomic-ehr/fhirschema` translator
- **Element snapshot generation** that merges inherited properties from base resources

#### Load Local StructureDefinitions & TGZ Archives

Use the new `localPackage` helper to point the builder at an on-disk FHIR package folder (for example, an unpublished implementation guide). If you only have loose StructureDefinition JSON files, group them under a folder and pass it to `localStructureDefinitions`. Canonical Manager handles copying, indexing, and dependency installation in both scenarios, so the API builder only needs to describe where the files live and what upstream packages they depend on.

```typescript
.localStructureDefinitions({
    package: { name: "example.local.structures", version: "0.0.1" },
    path: "./custom-profiles",
    dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
})
.localTgzPackage("./packages/my-custom-ig.tgz")
```

The example above points Canonical Manager at `./custom-profiles`, installs the HL7 R4 core dependency automatically, and then limits generation to the custom `ExampleNotebook` logical model plus the standard R4 `Patient` resource via tree shaking. The `localTgzPackage` helper registers `.tgz` artifacts that Canonical Manager already knows how to unpack.

### Intermediate - Type Schema

Type Schema serves as a universal intermediate representation that bridges FHIR's complex hierarchical structure with programming language constructs. It transforms FHIR StructureDefinitions into a flattened, code-generation-friendly format that:

- **Unifies** all FHIR elements (Resources, Types, ValueSets) into a consistent structure
- **Flattens** nested paths for direct field access without complex traversal
- **Enriches** definitions with resolved references, value set expansions, and type dependencies
- **Simplifies** FHIR concepts like choice types and extensions for easier code generation

This approach enables generating idiomatic code for any programming language while preserving FHIR semantics and constraints. Learn more: [Type Schema specification](https://www.health-samurai.io/articles/type-schema-a-pragmatic-approach-to-build-fhir-sdk).

#### Tree Shaking

Tree shaking optimizes the generated output by including only the resources you explicitly need and their dependencies. Instead of generating types for an entire FHIR package (which can contain hundreds of resources), you can specify exactly which resources to include:

```typescript
.treeShake({
  "hl7.fhir.r4.core#4.0.1": {
    "http://hl7.org/fhir/StructureDefinition/Patient": {},
    "http://hl7.org/fhir/StructureDefinition/Observation": {},
  }
})
```

This feature automatically resolves and includes all dependencies (referenced types, base resources, nested types) while excluding unused resources, significantly reducing the size of generated code and improving compilation times.

##### Field-Level Tree Shaking

Beyond resource-level filtering, tree shaking supports fine-grained field selection using `selectFields` (whitelist) or `ignoreFields` (blacklist):

```typescript
.treeShake({
  "hl7.fhir.r4.core#4.0.1": {
    "http://hl7.org/fhir/StructureDefinition/Patient": {
      selectFields: ["id", "name", "birthDate", "gender"]
    },
    "http://hl7.org/fhir/StructureDefinition/Observation": {
      ignoreFields: ["performer", "note"]
    }
  }
})
```

**Configuration Rules:**
- `selectFields`: Only includes the specified fields (whitelist approach)
- `ignoreFields`: Removes specified fields, keeps everything else (blacklist approach)
- These options are **mutually exclusive** - you cannot use both in the same rule

**Polymorphic Field Handling:**

FHIR choice types (like `multipleBirth[x]` which can be boolean or integer) are handled intelligently. Selecting/ignoring the base field affects all variants, while targeting specific variants only affects those types.

### Generation

The generation stage uses a `WriterGenerator` system that transforms Type Schema into target language code. The architecture consists of:

- **Base Writer** (`Writer`): Handles file I/O, indentation, and code formatting primitives
- **Language Writers** (e.g., `TypeScript`): Implement language-specific generation logic

Writers provide high-level abstractions for common code patterns (blocks, imports, type definitions) while maintaining full control over output formatting. Each language writer traverses the Type Schema index and generates corresponding types, interfaces, or classes following that language's idioms and best practices.

- [Type Schema: Python SDK for FHIR](https://www.health-samurai.io/articles/type-schema-python-sdk-for-fhir)

## Roadmap

- [x] TypeScript generation
- [x] FHIR R4 core package support
- [x] Configuration file support
- [x] Comprehensive test suite (72+ tests)
- [x] **Value Set Generation** - Strongly-typed enums from FHIR bindings
- [~] **Profile & Extension Support** - Basic parsing (US Core in development)
- [ ] **Complete Multi-Package Support** - Custom packages and dependencies
- [ ] **Smart Chained Search** - Intelligent search builders

    ```typescript
    // Intelligent search builders
    const results = await client.Patient
        .search()
        .name().contains('Smith')
        .birthdate().greaterThan('2000-01-01')
        .address().city().equals('Boston')
        .include('Patient:organization')
        .sort('birthdate', 'desc')
        .execute();
    ```

- [ ] **Operation Generation** - Type-safe FHIR operations

    ```typescript
    // Type-safe FHIR operations
    const result = await client.Patient
        .operation('$match')
        .withParameters({
            resource: patient,
            onlyCertainMatches: true
        })
        .execute();
    ```

- [x] **Python generation**
- [x] **C# generation**
- [ ] **Rust generation**
- [ ] **GraphQL schema generation**
- [ ] **OpenAPI specification generation**
- [ ] **Validation functions**
- [ ] **Mock data generation**

## Support

- 🐛 [Issue Tracker](https://github.com/atomic-ehr/codegen/issues)

---

Built with ❤️ by the Atomic Healthcare team
