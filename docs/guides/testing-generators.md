# Writing Unit Tests for Generators

This guide explains how to write effective unit tests for code generators in Atomic EHR Codegen. Testing generators is critical to ensure that generated code is correct, maintainable, and consistent across language targets.

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [Writing Unit Tests for Generators](#writing-unit-tests-for-generators)
  - [Overview](#overview)
  - [Test Organization](#test-organization)
  - [Basic Test Pattern](#basic-test-pattern)
    - [Setup](#setup)
    - [Key Components](#key-components)
  - [Configuration Notes](#configuration-notes)
  - [Snapshot Testing](#snapshot-testing)
    - [Understanding Snapshots](#understanding-snapshots)
    - [Creating Snapshots](#creating-snapshots)
    - [Updating Snapshots](#updating-snapshots)
    - [Snapshot Best Practices](#snapshot-best-practices)
  - [Running Tests](#running-tests)

<!-- markdown-toc end -->

## Overview

Generator tests validate that the code writers produce correct output without side effects. The testing strategy uses:

- **In-memory generation** via `APIBuilder` with `inMemoryOnly: true` to avoid file I/O
- **Snapshot testing** to capture and verify exact output
- **File count assertions** to catch missing or unexpected output
- **Structured test organization** mirroring language and generation types

## Test Organization

Generator tests are located in `test/api/` and organized by generation method:

```
test/api/
├── write-generator/              # Tests for language-specific writers
│   ├── __snapshots__/            # Snapshot files
│   ├── typescript.test.ts         # TypeScript writer tests
│   ├── python.test.ts             # Python writer tests
│   ├── csharp.test.ts             # C# writer tests
│   └── [language].test.ts         # Additional language tests
└── mustache.test.ts              # Mustache template generator tests
```

Each test file targets a specific generator and validates its output independently.

## Basic Test Pattern

### Setup

All generator tests follow this basic structure:

```typescript
import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { r4Manager } from "@typeschema-test/utils";

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ manager: r4Manager })
        .setLogLevel("SILENT")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();

    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(236);

    it("generates Patient resource with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"])
            .toMatchSnapshot();
    });
});
```

### Key Components

**APIBuilder Setup:**
- Initialize with test manager: `new APIBuilder({ manager: r4Manager })`
- Set log level to SILENT to reduce noise: `.setLogLevel("SILENT")`
- Choose generator method: `.typescript()`, `.python()`, `.csharp()`, `.mustache()`
- Enable in-memory mode: `inMemoryOnly: true` (no file I/O)

**Generation Result:**
- Contains `success` boolean flag
- Contains `filesGenerated` object with paths as keys and content as values
- Can be accessed and asserted in tests

**Assertions:**
- Validate success: `expect(result.success).toBeTrue()`
- Check file count: `expect(Object.keys(result.filesGenerated).length).toEqual(expected)`
- Snapshot specific files: `expect(result.filesGenerated[path]).toMatchSnapshot()`

## Configuration Notes

- **shouldRunHooks**: Set to `false` in tests to skip post-generation scripts
- **inMemoryOnly**: Always use to avoid file I/O
- **meta.timestamp**: Mock timestamp for reproducible output for Mustache generators
- **throwException()**: Call to fail tests on generation errors
- **debug mode**: Set to capture generated models in output (useful for debugging)

## Snapshot Testing

### Understanding Snapshots

Snapshots capture the exact generated output for comparison across test runs. They're stored in `test/api/write-generator/__snapshots__/` as plain text files.

### Creating Snapshots

When you run tests for the first time, Bun creates snapshot files automatically:

```bash
bun test test/api/write-generator/typescript.test.ts
```

Snapshots are stored in files like:
```
test/api/write-generator/__snapshots__/typescript.test.snap
```

### Updating Snapshots

After intentional changes to code generation logic, update snapshots:

```bash
bun test -- --update-snapshots
```

This updates all snapshot files to match current output.

### Snapshot Best Practices

1. **Review changes carefully** - Always review snapshot diffs before committing:
   ```bash
   git diff test/api/write-generator/__snapshots__/
   ```

2. **Use meaningful commits** - When updating snapshots, include reason in commit:
   ```bash
   git commit -m "test(typescript): update snapshots for camelCase field names"
   ```

3. **One change at a time** - Update snapshots for one feature at a time, not multiple changes together

4. **Document intent** - Add comments in test code explaining why output changed:
   ```typescript
   it("generates fields with camelCase names", async () => {
       // Changed from PascalCase to camelCase to match TypeScript conventions
       expect(result.filesGenerated["generated/types/Patient.ts"])
           .toMatchSnapshot();
   });
   ```


## Running Tests

To run all generator tests, use:

```bash
bun test test/api/
```

For testing specific generators, you can target individual test files or directories. To test only the TypeScript generator:

```bash
bun test test/api/write-generator/typescript.test.ts
```

To test only the Python generator:

```bash
bun test test/api/write-generator/python.test.ts
```

To run all write-generator tests together:

```bash
bun test test/api/write-generator/
```

You can also run tests with coverage reporting to see how much of your code is covered by tests:

```bash
bun test --coverage test/api/
```

For development, watch mode automatically reruns tests when files change:

```bash
bun test --watch test/api/write-generator/
```
