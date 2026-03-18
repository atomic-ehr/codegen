# Atomic EHR Codegen

[![npm canary](https://img.shields.io/npm/v/@atomic-ehr/codegen/canary.svg?label=canary)](https://www.npmjs.com/package/@atomic-ehr/codegen/v/canary)
[![npm version](https://img.shields.io/npm/v/@atomic-ehr/codegen.svg)](https://www.npmjs.com/package/@atomic-ehr/codegen)
[![CI](https://github.com/atomic-ehr/codegen/actions/workflows/ci.yml/badge.svg)](https://github.com/atomic-ehr/codegen/actions/workflows/ci.yml)
[![SDK Tests](https://github.com/atomic-ehr/codegen/actions/workflows/sdk-tests.yml/badge.svg)](https://github.com/atomic-ehr/codegen/actions/workflows/sdk-tests.yml)

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [Atomic EHR Codegen](#atomic-ehr-codegen)
  - [Features](#features)
  - [Guides](#guides)
  - [Versions & Release Cycle](#versions--release-cycle)
  - [Installation](#installation)
  - [Quick Start](#quick-start)
    - [Usage Examples](#usage-examples)
  - [Architecture](#architecture)
    - [Input - FHIR packages & resolves canonicals](#input---fhir-packages--resolves-canonicals)
      - [Load Local StructureDefinitions & TGZ Archives](#load-local-structuredefinitions--tgz-archives)
    - [Intermediate - Type Schema](#intermediate---type-schema)
      - [Tree Shaking](#tree-shaking)
        - [Field-Level Tree Shaking](#field-level-tree-shaking)
      - [Logical Model Promotion](#logical-model-promotion)
      - [Resolving Schema Collisions](#resolving-schema-collisions)
    - [Generation](#generation)
      - [1. Writer-Based Generation (Programmatic)](#1-writer-based-generation-programmatic)
      - [2. Mustache Template-Based Generation (Declarative)](#2-mustache-template-based-generation-declarative)
    - [Profile Classes](#profile-classes)
  - [Support](#support)

<!-- markdown-toc end -->

A powerful, extensible code generation toolkit for FHIR ([Fast Healthcare Interoperability Resources](https://www.hl7.org/fhir/)) that transforms FHIR specifications into strongly-typed code for multiple programming languages.

## Features

- [x] **Multi-Package Support** — Load packages from the [FHIR registry](examples/typescript-r4/), [remote TGZ files](examples/typescript-sql-on-fhir/), or a [local folder with custom StructureDefinitions](examples/local-package-folder/)
  - Tested with hl7.fhir.r4.core, US Core, C-CDA, SQL on FHIR, etc.
- [x] **Resources & Complex Types** — Generates typed definitions with proper inheritance
- [x] **Value Set Bindings** — Strongly-typed enums from FHIR terminology bindings
- [x] **Profiles** — Factory methods with auto-populated fixed values and required slices ([R4 profiles](examples/typescript-r4/profile-bp.test.ts), [US Core](examples/typescript-us-core/))
  - Extensions — flat typed accessors (e.g. `setRace()` on US Core Patient), [standalone extension profiles](examples/typescript-r4/extension-profile.test.ts)
  - Slicing — typed get/set accessors with discriminator matching
  - Validation — runtime `validate()` for required fields, fixed values, slice cardinality, enums, references
- [x] **Extensible Architecture** — Three-stage pipeline: FHIR packages → [TypeSchema](https://www.health-samurai.io/articles/type-schema-a-pragmatic-approach-to-build-fhir-sdk) IR → code generation
  - TypeSchema is a universal intermediate representation — add a new language by writing only the final generation stage
  - Built-in generators: TypeScript, Python/Pydantic, C#, and Mustache templates
- [x] **TypeSchema Transformations**:
  - [x] **Tree Shaking** — include only the resources and fields you need; automatically resolves dependencies
  - [x] **Logical Model Promotion** — promote FHIR logical models to first-class resources
  - [ ] Renaming — custom naming conventions for generated types and fields
- [ ] **Search Builders** — type-safe FHIR search query construction
- [ ] **Operation Generation** — type-safe FHIR operation calls

| Feature                   | TypeScript | Python  | C#   | Mustache |
|---------------------------|------------|---------|------|----------|
| Resources & Complex Types | yes        | yes     | yes  | template |
| Value Set Bindings        | inline     | limited | enum | template |
| Primitive Extensions      | yes        | no      | no   | no       |
| Profiles                  | yes        | no      | no   | no       |
| Profile Validation        | yes        | no      | no   | no       |

## Guides

- **[Writer Generator Guide](docs/guides/writer-generator.md)** - Build custom code generators with the Writer base class
- **[Mustache Generator Guide](docs/guides/mustache-generator.md)** - Template-based code generation for any language
- **[TypeSchemaIndex Guide](docs/guides/typeschema-index.md)** - Type Schema structure and utilities
- **[Testing Generators Guide](docs/guides/testing-generators.md)** - Unit tests, snapshot testing, and best practices
- **[Contributing Guide](CONTRIBUTING.md)** - Development setup and workflow

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
    import { APIBuilder, prettyReport } from '@atomic-ehr/codegen';

    const builder = new APIBuilder()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .typescript({})
        .outputTo("./examples/typescript-r4/fhir-types")
        .introspection({ typeTree: "./type-tree.yaml" });

    const report = await builder.generate();
    console.log(prettyReport(report));
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
- **[python/](examples/python/)** - Python/Pydantic model generation with simple requests-based client
- **[python-fhirpy/](examples/python-fhirpy/)** - Python/Pydantic model generation with fhirpy async client
- **[csharp/](examples/csharp/)** - C# class generation with namespace configuration
- **[mustache/](examples/mustache/)** - Java generation with Mustache templates and post-generation hooks
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
    .fromPackageRef("https://...package.tgz") // Remote TGZ file
    .localStructureDefinitions({ ... })       // Loose JSON files

    // Type Schema processing
    .typeSchema({
        treeShake: { ... },        // Include only specified types
        promoteLogical: { ... },   // Process logical models as resources
        resolveCollisions: { ... },// Resolve duplicate schema collisions
    })

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

    // Optional: Introspection & debugging
    .throwException()                          // Throw on errors (optional)
    .introspection({
        typeSchemas: "./schemas",              // Export TypeSchemas
        typeTree: "./tree.yaml",               // Export type tree
        fhirSchemas: "./fhir-schemas",         // Export FHIR schemas
        structureDefinitions: "./sd"           // Export StructureDefinitions
    })

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

The example above points Canonical Manager at `./custom-profiles` and installs the HL7 R4 core dependency automatically. The `localTgzPackage` helper registers `.tgz` artifacts that Canonical Manager already knows how to unpack.

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
.typeSchema({
    treeShake: {
        "hl7.fhir.r4.core#4.0.1": {
            "http://hl7.org/fhir/StructureDefinition/Patient": {},
            "http://hl7.org/fhir/StructureDefinition/Observation": {}
        }
    }
})
```

This feature automatically resolves and includes all dependencies (referenced types, base resources, nested types, and extension definitions used by profiles) while excluding unused resources, significantly reducing the size of generated code and improving compilation times.

##### Field-Level Tree Shaking

Beyond resource-level filtering, tree shaking supports fine-grained field selection using `selectFields` (whitelist) or `ignoreFields` (blacklist):

```typescript
.typeSchema({
    treeShake: {
        "hl7.fhir.r4.core#4.0.1": {
            "http://hl7.org/fhir/StructureDefinition/Patient": {
                selectFields: ["id", "name", "birthDate", "gender"]
            },
            "http://hl7.org/fhir/StructureDefinition/Observation": {
                ignoreFields: ["performer", "note"]
            }
        }
    }
})
```

**Configuration Rules:**

- `selectFields`: Only includes the specified fields (whitelist approach)
- `ignoreFields`: Removes specified fields, keeps everything else (blacklist approach)
- These options are **mutually exclusive** - you cannot use both in the same rule
- `ignoreExtensions`: Removes specific extensions from a profile by canonical URL

**Polymorphic Field Handling:**

FHIR choice types (like `multipleBirth[x]` which can be boolean or integer) are handled intelligently. Selecting/ignoring the base field affects all variants, while targeting specific variants only affects those types.

#### Logical Model Promotion

Some implementation guides expose logical models (logical-kind StructureDefinitions) that are intended to be used like resources in generated SDKs. The code generator supports promoting selected logical models to behave as resources during generation.

Use the programmatic API via `APIBuilder`:

```typescript
const builder = new APIBuilder({})
  .fromPackage("my.custom.pkg", "4.0.1")
  .typeSchema({
    promoteLogical: {
      "my.custom.pkg": [
        "http://example.org/StructureDefinition/MyLogicalModel"
      ]
    }
  })
```

#### Resolving Schema Collisions

When multiple StructureDefinitions produce the same binding (e.g. `ObservationCategory` from both `Observation` and `ObservationDefinition`), the schemas may differ in strength or value set. By default the generator picks the most common variant and emits a warning:

```
! ts: 'urn:fhir:binding:ObservationCategory' from 'shared' has 2 versions (#duplicateSchema)
```

To fix this, add `resolveCollisions` to `.typeSchema()` specifying which source should win for each binding URL:

```typescript
.typeSchema({
    resolveCollisions: {
        "urn:fhir:binding:ObservationCategory": {
            package: "hl7.fhir.r4.core#4.0.1",
            canonical: "http://hl7.org/fhir/StructureDefinition/Observation",
        },
    },
})
```

- **`package`** — the FHIR package ID (`name#version`) that contains the preferred source
- **`canonical`** — the StructureDefinition URL that should provide the authoritative binding

The generated `README.md` report (from `.introspection()`) lists all collisions with version details and includes a ready-to-paste `resolveCollisions` config for any unresolved ones. Example output:

```markdown
## Schema Collisions

- `urn:fhir:binding:CommunicationReason` (2 versions)
  - Version 1 (selected): Communication (hl7.fhir.r4.core#4.0.1)
  - Version 2: CommunicationRequest (hl7.fhir.r4.core#4.0.1)
- `urn:fhir:binding:ProcessPriority` (2 versions)
  - Version 1 (auto): Claim (hl7.fhir.r4.core#4.0.1), CoverageEligibilityRequest (hl7.fhir.r4.core#4.0.1)
  - Version 2: ExplanationOfBenefit (hl7.fhir.r4.core#4.0.1)

### Suggested `resolveCollisions` config

.typeSchema({
    resolveCollisions: {
        "urn:fhir:binding:ProcessPriority": {
            package: "hl7.fhir.r4.core#4.0.1",
            canonical: "http://hl7.org/fhir/StructureDefinition/Claim",
        },
    },
})
```

- **(selected)** — resolved by your `resolveCollisions` config
- **(auto)** — picked automatically (most common variant); add to config to make explicit

### Generation

The generation stage transforms Type Schema into target language code using two complementary approaches:

#### 1. Writer-Based Generation (Programmatic)

For languages with built-in support (TypeScript, Python, C#), extend the `Writer` class to implement language-specific generators:

- **FileSystemWriter**: Base class providing file I/O, directory management, and buffer handling (both disk and in-memory modes)
- **Writer**: Extends FileSystemWriter with code formatting utilities (indentation, blocks, comments, line management)
- **Language Writers** (`TypeScript`, `Python`, `CSharp`): Implement language-specific generation logic by traversing TypeSchema index and generating corresponding types, interfaces, or classes (see also: [Type Schema: Python SDK for FHIR](https://www.health-samurai.io/articles/type-schema-python-sdk-for-fhir))

Each language writer maintains full control over output formatting while leveraging high-level abstractions for common code patterns. Writers follow language idioms and best practices, with optimized output for production use.

**When to use**: Full control needed, complex generation logic, performance-critical, language has a dedicated writer, production-grade output

#### 2. Mustache Template-Based Generation (Declarative)

For custom languages or formats, use Mustache templates to define code generation rules without programming:

- **Template Files**: Declarative Mustache templates that describe output structure
- **Configuration**: JSON config file controlling type filtering, naming, and post-generation hooks
- **ViewModels**: Type Schema automatically transformed into template-friendly data structures

Templates enable flexible code generation for any language or format (Go, Rust, GraphQL, documentation, configs) by describing the output format rather than implementing generation logic.

**When to use**: Custom language support, quick prototyping, template-driven customization, non-code output

---

### Profile Classes

When generating TypeScript with `generateProfile: true`, the generator creates profile wrapper classes that provide a fluent API for working with FHIR profiles. These classes handle complex profile constraints like slicing and extensions automatically.

```typescript
import { observation_bpProfile as bpProfile } from "./profiles/Observation_observation_bp";

// create() auto-sets fixed values (code, meta.profile) and required slice stubs
const bp = bpProfile.create({
    status: "final",
    subject: { reference: "Patient/pt-1" },
});

// Slice setters — discriminator values (LOINC codes) applied automatically
// Single-variant choice types (value[x] → valueQuantity) are flattened:
bp.setVSCat({ text: "Vital Signs" })
    .setSystolicBP({ value: 120, unit: "mmHg" })
    .setDiastolicBP({ value: 80, unit: "mmHg" })
    .setEffectiveDateTime("2024-06-15");

bp.validate(); // [] — valid

// Get plain FHIR JSON — ready for API calls, storage, etc.
const obs = bp.toResource();
// obs.component[0].valueQuantity.value === 120
// obs.component[0].code.coding[0].code === "8480-6"
```

**Slicing & Choice Type Flattening:**

```typescript
// Flat getter (default) — discriminator stripped, choice type flattened
bp.getSystolicBP();        // { value: 120, unit: "mmHg" }

// Raw getter — full FHIR element including discriminator values
bp.getSystolicBP('raw');   // { code: { coding: [...] }, valueQuantity: { value: 120, ... } }
```

**Wrapping Existing Resources:**

```typescript
// Wrap any resource to read slices
const bp2 = bpProfile.from(existingObservation);
bp2.getSystolicBP();       // { value: 120, unit: "mmHg" }
bp2.getVSCat();            // { text: "Vital Signs" }
bp2.getEffectiveDateTime(); // "2024-06-15"
```

**Validation:**

```typescript
const errors = bp.validate();
// [] — empty means valid
// ["effective: at least one of effectiveDateTime, effectivePeriod is required"]
```

See [examples/typescript-r4/](examples/typescript-r4/) for R4 profile tests and [examples/typescript-us-core/](examples/typescript-us-core/) for US Core profile examples.

## Support

- [Issue Tracker](https://github.com/atomic-ehr/codegen/issues)

---

Built by the Atomic Healthcare team
