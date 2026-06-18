# Package Sources Example

Feeding the codegen pipeline from package sources **other than the NPM-style registry** (`.fromPackage()`). Two input mechanisms are demonstrated:

- **Local StructureDefinitions from disk** — `.localStructureDefinitions()` (`generate-local.ts`)
- **Remote `.tgz` package by URL** — `.fromPackageRef()` (`generate-sql-on-fhir.ts`)

Both also show tree shaking and dependency resolution against published packages.

## Quick Start

```bash
# Local unpublished StructureDefinitions → ./fhir-types
bun run examples/typescript-custom-packages/generate-local.ts

# Remote SQL-on-FHIR .tgz package → ./sql-on-fhir-types
bun run examples/typescript-custom-packages/generate-sql-on-fhir.ts

# Run the local-package tests
bun test ./examples/typescript-custom-packages/
```

## Directory Structure

```
typescript-custom-packages/
├── README.md                            # This file
├── generate-local.ts                    # .localStructureDefinitions() → ./fhir-types
├── generate-sql-on-fhir.ts              # .fromPackageRef()            → ./sql-on-fhir-types
├── structure-definitions/               # Custom StructureDefinitions for the local demo
├── profile-*.test.ts                    # Tests for the locally-generated profiles
└── (generated output, gitignored)
```

---

## 1. Local StructureDefinitions (`generate-local.ts`)

Generate TypeScript types from custom FHIR StructureDefinitions stored on disk, without
publishing them to a registry. Demonstrates:

- Loading local StructureDefinition JSON files
- Declaring a custom FHIR package and resolving dependencies against published packages (FHIR R4 core)
- Tree shaking to include only specific custom resources
- Combining local and published packages

### Adding Your StructureDefinitions

Place your FHIR StructureDefinition JSON files in `structure-definitions/`, then point
`generate-local.ts` at them:

```typescript
await builder
    .localStructureDefinitions({
        package: { name: "example.folder.structures", version: "0.0.1" },
        path: Path.join(__dirname, "structure-definitions"),
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    })
    .typescript({ generateProfile: true })
    .typeSchema({
        treeShake: {
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
            },
        },
    })
    .outputTo("./examples/typescript-custom-packages/fhir-types")
    .generate();
```

### Combining Local and Published Packages

```typescript
await builder
    .localStructureDefinitions({
        package: { name: "example.local", version: "1.0.0" },
        path: "./my-definitions",
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    })
    .fromPackage("hl7.fhir.us.core", "6.1.0") // published package alongside local
    .typescript({})
    .outputTo("./generated")
    .generate();
```

### Advanced: Using TGZ Archives from Disk

```typescript
await builder
    .localTgzPackage("./packages/my-custom-ig.tgz")
    .typescript({})
    .outputTo("./generated")
    .generate();
```

---

## 2. Remote `.tgz` Package — SQL-on-FHIR (`generate-sql-on-fhir.ts`)

Generate TypeScript types from a package fetched directly from a remote URL, using the
SQL-on-FHIR ViewDefinition specification as the example. Demonstrates:

- Remote package loading via `.fromPackageRef()`
- Tree shaking to include only `ViewDefinition` and its dependencies
- Explicitly adding a dependency (`hl7.fhir.r5.core`) the IG references but doesn't declare

```typescript
.fromPackage("hl7.fhir.r5.core", "5.0.0") // IG reaches R5 core but doesn't declare the dep
.fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
.typescript({ withDebugComment: false, generateProfile: false })
.typeSchema({
    treeShake: {
        "org.sql-on-fhir.ig": {
            "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
        },
    },
})
.outputTo("./examples/typescript-custom-packages/sql-on-fhir-types")
```

Remote `.fromPackageRef()` is useful for packages not published to NPM, development/preview
versions, and custom implementation guides.

Learn more about SQL-on-FHIR: https://sql-on-fhir.org/
