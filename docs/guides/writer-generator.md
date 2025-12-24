# Creating Custom Writers for Code Generation

This guide explains how to build your own code generator for a new programming language by inheritance from `Writer` class in Atomic EHR Codegen.

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [Creating Custom Writers for Code Generation](#creating-custom-writers-for-code-generation)
  - [Architecture Overview](#architecture-overview)
    - [`FileSystemWriter`](#filesystemwriter)
    - [`Writer extends FileSystemWriter`](#writer-extends-filesystemwriter)
  - [`FileSystemWriter` Class](#filesystemwriter-class)
    - [Usage Examples](#usage-examples)
      - [Directory Structure Organization](#directory-structure-organization)
      - [Multiple Files Per Type](#multiple-files-per-type)
  - [`Writer` Class](#writer-class)
    - [Code Writing Methods](#code-writing-methods)
    - [Disclaimer & Metadata](#disclaimer--metadata)
    - [Usage Examples](#usage-examples-1)
      - [Indentation Handling](#indentation-handling)
      - [Curly Blocks](#curly-blocks)
      - [Square Blocks](#square-blocks)
      - [Comments and Documentation](#comments-and-documentation)
  - [Implementation Pattern](#implementation-pattern)
    - [Step 1: Extend the Writer Class](#step-1-extend-the-writer-class)
    - [Step 2: Implement the `generate` Method](#step-2-implement-the-generate-method)
    - [Step 3: Implement Type Generation](#step-3-implement-type-generation)
  - [Next Steps](#next-steps)
  - [Resources](#resources)

<!-- markdown-toc end -->

---

## Architecture Overview

The code generation pipeline consists of three stages:

```text
Register extends CanonicalManager (FHIR Package retrieval and FHIR Schema generation)
    ↓
TypeSchemaIndex (Type Schema generation and management)
    ↓             ---------------------+
Writer (Actual code generation)        |<-- Language specific part
    ↓             ---------------------+
Generated Code
```

For comprehensive documentation on `TypeSchemaIndex` structure, utilities, and usage, see the [TypeSchemaIndex Guide](./typeschema-index.md).

There are two main base classes:

### `FileSystemWriter`

Base class handling file I/O and directory management.

- Creates and manages output files and directories
- Supports both in-memory and on-disk writing
- Provides buffer management for generated content
- Copy static assets

### `Writer extends FileSystemWriter`

Base class for source code generation.

- Handles indentation and formatting
- Provides methods for common code patterns (blocks, comments, lines)
- Supports language-specific code constructs

---

## `FileSystemWriter` Class

The `FileSystemWriter` class handles file I/O and directory management. It requires configuration through options:

```typescript
export type FileSystemWriterOptions = {
    outputDir: string;                    // Where to write files
    inMemoryOnly?: boolean;               // Don't write to disk (for testing)
    logger?: CodegenLogger;               // Optional logging
    resolveAssets?: (fn: string) => string; // Asset resolution function
};
```

Core Methods:

```typescript
cd(path: string, gen: () => void)
  Creates a subdirectory and executes generation code within it
  Example: this.cd("models", () => { /* generate model files */ })

cat(filename: string, gen: () => void)
  Opens a file for writing and executes generation code
  Example: this.cat("patient.ts", () => { /* write file content */ })

write(str: string)
  Writes a string to the currently open file
  Example: this.write("class Patient {")

cp(source: string, destination: string)
  Copies a static asset file to the output directory
  Uses resolveAssets option to locate source files
  Example: this.cp("styles.css", "public/styles.css")

writtenFiles(): FileBuffer[]
  Returns all generated files with content
```

### Usage Examples

#### Directory Structure Organization

Use `cd()` to organize generated code into nested directories:

```typescript
this.cd("src/main/java", () => {
    this.cd("com/example/fhir", () => {
        this.cat("Patient.java", () => {
            this.line("public class Patient {");
            this.line("}");
        });
    });
});
```

Results in output structure:
```
output/
  src/
    main/
      java/
        com/
          example/
            fhir/
              Patient.java
```

#### Multiple Files Per Type

Generate multiple related files for a single type:

```typescript
private generateType(schema: TypeSchema): void {
    this.cat(`I${schema.name}.java`, () => {
        this.generateInterface(schema);
    });

    this.cat(`${schema.name}.java`, () => {
        this.generateClass(schema);
    });

    this.cat(`${schema.name}Builder.java`, () => {
        this.generateBuilder(schema);
    });
}
```

---

## `Writer` Class

The `Writer` class extends `FileSystemWriter` and adds code generation capabilities. It requires additional formatting options:

```typescript
export type WriterOptions = FileSystemWriterOptions & {
    tabSize: number;                      // Indentation size (spaces)
    withDebugComment?: boolean;           // Include debug info in output
    commentLinePrefix: string;            // Comment syntax (e.g., "//", "#")
    generateProfile?: boolean;            // Generate profile-related types
};
```

### Code Writing Methods

```typescript
line(...tokens: string[])
  Writes an indented line with automatic newline
  Example: this.line("public class Patient {")

lineSM(...tokens: string[])
  Writes a line ending with semicolon (statement)
  Example: this.lineSM("int age = 25")

comment(...tokens: string[])
  Writes a comment line with language-appropriate prefix
  Example: this.comment("This is a patient resource")

indentBlock(gencontent: () => void)
  Increases indentation, executes content, then decreases
  Example: this.indentBlock(() => { this.line("return patient;") })

curlyBlock(tokens, gencontent, endTokens?)
  Writes { ... } block with proper indentation
  Example: this.curlyBlock(["class Patient"], () => { /* body */ })

squareBlock(tokens, gencontent, endTokens?)
  Writes [ ... ] block with proper indentation
  Example: this.squareBlock(["List<Patient>"], () => { /* items */ })
```

### Disclaimer & Metadata

```typescript
disclaimer(): string[]
  Returns an array of disclaimer text lines about autogenerated code

generateDisclaimer()
  Writes the disclaimer comment to the current file
  Example: this.generateDisclaimer()
```

### Usage Examples

#### Indentation Handling

The `Writer` class automatically tracks indentation level:

```typescript
this.line("public class Patient {");          // No indent
this.indentBlock(() => {
    this.line("private String name;");        // 1 level indent
    this.indentBlock(() => {
        this.line("return name;");            // 2 levels indent
    });
});
this.line("}");                               // No indent
```

Output:
```java
public class Patient {
    private String name;
        return name;
}
```

#### Curly Blocks

Generate `{ ... }` blocks with automatic indentation and formatting:

```typescript
this.curlyBlock(["public void process()"], () => {
    this.line("System.out.println(\"Processing\");");
});
```

Output:
```java
public void process() {
    System.out.println("Processing");
}
```

#### Square Blocks

Generate `[ ... ]` blocks for arrays and collections:

```typescript
this.squareBlock(["List<String> names = new ArrayList"], () => {
    this.line('"John",');
    this.line('"Jane",');
    this.line('"Bob"');
});
```

Output:
```java
List<String> names = new ArrayList [
    "John",
    "Jane",
    "Bob"
]
```

#### Comments and Documentation

Generate single-line and multi-line comments:

```typescript
this.comment("This is a comment");

this.comment("This is a longer comment that spans multiple lines");

// Debug comments (only if withDebugComment: true)
this.debugComment("Type info:", schema);
```

Output:
```java
// This is a comment
// This is a longer comment that spans multiple lines
// Type info: { ... }
```

---

## Implementation Pattern

### Step 1: Extend the Writer Class

```typescript
import { Writer, type WriterOptions } from "@root/api/writer-generator/writer";
import type { TypeSchemaIndex } from "@root/typeschema/utils";

export interface MyLanguageOptions extends WriterOptions {
    // Add language-specific options
    packageName?: string;
    includeValidation?: boolean;
}

export class MyLanguageWriter extends Writer<MyLanguageOptions> {
    constructor(opts: MyLanguageOptions) {
        super({
            ...opts,
            tabSize: 4,                    // 4 spaces for indentation
            commentLinePrefix: "//",       // C-style comments
        });
    }

    async generate(tsIndex: TypeSchemaIndex): Promise<void> {
        // Main generation logic goes here
    }
}
```

### Step 2: Implement the `generate` Method

The `generate` method receives a `TypeSchemaIndex` as input. Use collection methods to retrieve data, group by package, then generate:

```typescript
import { groupByPackages, sortAsDeclarationSequence } from "@root/typeschema/utils";

async generate(tsIndex: TypeSchemaIndex): Promise<void> {
    // 1. Write disclaimer
    this.cat("_generated.txt", () => {
        this.generateDisclaimer();
    });

    // 2. Collect resources (or use collectComplexTypes(), collectLogicalModels(), etc.)
    const resources = tsIndex.collectResources();

    // 3. Group by package
    const byPackage = groupByPackages(resources);

    // 4. Generate files for each package
    for (const [pkgName, schemas] of Object.entries(byPackage)) {
        this.cd(this.packageToDir(pkgName), () => {
            // Sort by dependencies for proper declaration order
            const sorted = sortAsDeclarationSequence(schemas);

            for (const schema of sorted) {
                this.generateType(schema);
            }
        });
    }
}
```

### Step 3: Implement Type Generation

```typescript
private generateType(schema: TypeSchema): void {
    const fileName = `${schema.name}.java`;

    this.cat(fileName, () => {
        this.generateDisclaimer();
        this.line();

        // Package declaration
        if (this.opts.packageName) {
            this.line(`package ${this.opts.packageName};`);
            this.line();
        }

        // Imports
        this.generateImports(schema);
        this.line();

        // Class definition
        const baseClass = schema.base ? ` extends ${schema.base}` : "";
        this.curlyBlock([`public class ${schema.name}${baseClass}`], () => {
            this.generateFields(schema);
            this.generateMethods(schema);
        });
    });
}
```

---

## Next Steps

1. **Read the Source**: Review TypeScript and Python writers for more patterns
   - `src/api/writer-generator/typescript.ts`
   - `src/api/writer-generator/python.ts`

2. **Test Your Writer**: Write unit and integration tests
   - Use in-memory mode for unit tests
   - Test with real FHIR packages for integration tests
   - See [test examples](../../test/api/write-generator)

3. **Integrate with APIBuilder**: Add your writer as a chainable method

4. **Share**: Consider contributing your writer back to the project!

---

## Resources

- **TypeSchemaIndex Guide**: [typeschema-index.md](./typeschema-index.md) - Comprehensive reference for input data
- **Writer Class**: `src/api/writer-generator/writer.ts`
- **TypeSchema Definition**: `src/typeschema/types.ts`
- **Existing Writers**: `src/api/writer-generator/`
- **APIBuilder**: `src/api/builder.ts`
