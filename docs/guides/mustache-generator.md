# Creating Custom Code Generators with Mustache Templates

This guide explains how to build a custom code generator using Mustache templates in Atomic EHR Codegen. Unlike the `Writer` class which requires implementing TypeScript code, the Mustache generator uses template files, making it ideal for generating any language or format without programming.

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [Creating Custom Code Generators with Mustache Templates](#creating-custom-code-generators-with-mustache-templates)
  - [Architecture Overview](#architecture-overview)
  - [Template Project Structure](#template-project-structure)
    - [Configuration File](#configuration-file)
      - [Rendering](#rendering)
      - [Name Transformations](#name-transformations)
      - [Unsafe Character Pattern](#unsafe-character-pattern)
      - [Hook Execution Control](#hook-execution-control)
      - [Post-Generation Hooks](#post-generation-hooks)
    - [Template Files](#template-files)
      - [Template Input](#template-input)
        - [TypeViewModel](#typeviewmodel)
        - [FieldViewModel](#fieldviewmodel)
        - [EnumViewModel](#enumviewmodel)
    - [Writing Mustache Templates](#writing-mustache-templates)
      - [Template Syntax](#template-syntax)
      - [Case Conversion Lambdas](#case-conversion-lambdas)
      - [Name Safety Lambdas](#name-safety-lambdas)
      - [Special Variables](#special-variables)
    - [Static Files](#static-files)
  - [Debugging & Testing](#debugging--testing)
    - [Enable Debug Output](#enable-debug-output)
    - [Inspect Generated Models](#inspect-generated-models)
    - [Validate Templates](#validate-templates)
  - [Resources](#resources)

<!-- markdown-toc end -->

---

## Architecture Overview

The Mustache code generation pipeline is part of the three-stage system:

```text
Register extends CanonicalManager (FHIR Package retrieval and FHIR Schema generation)
    ↓
TypeSchemaIndex (Type Schema generation and management)
    ↓
MustacheGenerator (Template-based generation) ← [User template project]
    ↓
Generated Code
```

For comprehensive documentation on `TypeSchemaIndex` structure, utilities, and usage, see the [TypeSchemaIndex Guide](./typeschema-index.md).

The template-based generation consists of two main components:

1. `ViewModelFactory`

    Transforms TypeSchema data into template-friendly structures.

    - Converts FHIR types to ViewModels
    - Applies case conversion and name transformations
    - Resolves type dependencies
    - Handles nested types and enums

2. `MustacheGenerator`

    Renders templates with ViewModel data.

    - Loads and caches template files
    - Processes configuration (filters, rendering rules)
    - Manages file output with directory hierarchy
    - Executes post-generation hooks

---

## Template Project Structure

A Mustache template project follows this layout:

```
my-template/
├── config.json                 # Generator configuration
├── templates/                  # Mustache template files
│   ├── resource.mustache       # Template for resources
│   ├── complex-type.mustache   # Template for complex types
│   ├── utility.mustache        # Template for utility/shared files
│   └── partials/               # Reusable template fragments
│       ├── header.mustache
│       ├── imports.mustache
│       └── field-definition.mustache
├── static/                     # Static files copied as-is
│   ├── package.json
│   ├── tsconfig.json
│   ├── README.md
│   └── .gitignore
└── README.md                   # Documentation for your template
```

### Configuration File

The `config.json` file defines how types are rendered and processed:

```jsonc
{
  // Enable debug output in templates: "OFF" | "FORMATTED" | "COMPACT"
  "debug": "OFF",

  // Metadata injected into all templates
  "meta": {
    "generator": "My FHIR Code Generator v1.0"
  },

  // Define how each type category is generated (resource, complexType, utility)
  "renderings": {
    "resource": [
      {
        "source": "resource.mustache",
        "path": "models",
        "fileNameFormat": "%s.ts",
        "filter": {
          "whitelist": ["Patient", "Observation"],
          "blacklist": []
        }
      }
    ],
    "complexType": [
      {
        "source": "type.mustache",
        "path": "types",
        "fileNameFormat": "%s.ts"
      }
    ],
    "utility": [
      {
        "source": "index.mustache",
        "path": ".",
        "fileNameFormat": "index.ts"
      }
    ]
  },

  // Reserved words to escape in names
  "keywords": ["class", "interface", "type", "const", "let", "var"],

  // Map FHIR types to target language types
  "primitiveTypeMap": {
    "string": "string",
    "boolean": "boolean",
    "integer": "number",
    "decimal": "number",
    "date": "Date",
    "dateTime": "Date",
    "time": "string"
  },

  // Name transformation rules for types, fields, and enums
  "nameTransformations": {
    "type": [],
    "field": [],
    "enum": []
  },

  // Pattern for unsafe characters to replace in names
  "unsaveCharacterPattern": "[^a-zA-Z0-9_]",

  // Whether to execute post-generation hooks
  "shouldRunHooks": true,

  // Commands to run after generation
  "hooks": {
    "afterGenerate": [
      {
        "cmd": "prettier",
        "args": ["--write", "."]
      }
    ]
  }
}
```

#### Rendering

Each rendering defines output for one template:

```typescript
type Rendering = {
  source: string;                    // Template file (relative to templates/)
  path: string;                      // Output directory (relative to outputDir)
  fileNameFormat: string;            // Output filename with %s for model.saveName
  filter?: FilterType;               // Optional whitelist/blacklist
  properties?: Record<string, any>;  // Custom properties for this rendering
};
```

The `fileNameFormat` uses `%s` as a placeholder for the model's safe name:
- `"%s.ts"` with model "Patient" → `Patient.ts`
- `"%s.model.ts"` → `Patient.model.ts`


`Filter` allows performing rendering-level filters.

Apply different filters per rendering:

```json
{
  "renderings": {
    "resource": [
      {
        "source": "resource.mustache",
        "fileNameFormat": "%s.ts",
        "filter": {
          "whitelist": ["Patient"]
        }
      },
      {
        "source": "resource.builder.mustache",
        "fileNameFormat": "%sBuilder.ts",
        "filter": {
          "whitelist": ["Patient", "Observation"]
        }
      }
    ]
  }
}
```

**Filter Logic:**
- Empty whitelist and blacklist: process all types
- Whitelist specified: only process matching types
- Blacklist specified: process all except matching types
- Both specified: whitelist checked first, then blacklist

**Pattern Examples:**

```json
{
  "whitelist": [
    "Patient",              {{! Exact match }}
    "^Observation.*",       {{! Starts with }}
    ".*Bundle$",            {{! Ends with }}
    ".*Element.*"           {{! Contains }}
  ],
  "blacklist": [
    "_.*",                  {{! Internal types }}
    ".*Meta"                {{! Meta types }}
  ]
}
```


#### Name Transformations

The `nameTransformations` option applies transformation rules to identifiers:

```json
{
  "nameTransformations": {
    "type": [
      { "pattern": "^CodeableConcept$", "replacement": "Coding" },
      { "pattern": "^Period$", "replacement": "DateRange" }
    ],
    "field": [
      { "pattern": "^resourceType$", "replacement": "type" }
    ],
    "enum": [
      { "pattern": "^(active|inactive)$", "replacement": "Status" }
    ]
  }
}
```

Each category (`type`, `field`, `enum`) accepts an array of transformation rules.

#### Unsafe Character Pattern

The `unsaveCharacterPattern` specifies which characters should be escaped or removed from identifiers:

```json
{
  "unsaveCharacterPattern": "[^a-zA-Z0-9_]"
}
```

This pattern matches invalid characters that may appear in FHIR names but aren't valid in your target language. Matching characters are replaced with underscores.

#### Hook Execution Control

The `shouldRunHooks` flag determines whether post-generation hooks are executed:

```json
{
  "shouldRunHooks": true
}
```

Set to `false` to skip hook execution (useful for debugging or dry runs).

#### Post-Generation Hooks

Hooks execute commands after all files are generated. Use them for formatting, linting, or building.

```json
{
  "hooks": {
    "afterGenerate": [
      {
        "cmd": "prettier",
        "args": ["--write", "."]
      },
      {
        "cmd": "eslint",
        "args": ["--fix", "."]
      }
    ]
  }
}
```

**Hook Execution:**
- Runs sequentially in order
- Working directory is the output directory
- Output is shown to the user
- Aborts generation if any hook fails

### Template Files

Each `.mustache` file receives a ViewModel and renders output:

```mustache
{{! templates/resource.mustache }}
{{> partials/header }}

export interface {{#lambda.pascalCase}}{{model.name}}{{/lambda.pascalCase}} {
  {{#model.fields}}
  {{#lambda.camelCase}}{{name}}{{/lambda.camelCase}}{{^isRequired}}?{{/isRequired}}: {{typeName}};
  {{/model.fields}}
}
```

Partials are reusable template fragments included via `{{> partials/name }}`:

```mustache
{{! templates/partials/header.mustache }}
/**
 * Generated by {{meta.generator}}
 * {{meta.timestamp}}
 * DO NOT EDIT - This file is autogenerated
 */
```

Use partials to:
- Share common headers and imports
- Reduce template duplication
- Organize complex generation logic

#### Template Input

ViewModels transform TypeSchema into template-friendly data structures. The `ViewModelFactory` creates them automatically.

##### TypeViewModel

Represents a FHIR resource or complex type:

```typescript
{
  name: string;                          // "Patient"
  saveName: string;                      // Escaped if keyword
  schema: TypeSchema;                    // Original FHIR definition

  fields: FieldViewModel[];              // Properties/fields
  dependencies: {
    resources: NamedViewModel[];         // Referenced resources
    complexTypes: NamedViewModel[];      // Referenced types
  };

  nestedComplexTypes: TypeViewModel[];   // Nested types
  nestedEnums: EnumViewModel[];          // Value set enums

  hasFields: boolean;
  hasNestedComplexTypes: boolean;
  hasNestedEnums: boolean;
  isNested: boolean;
  isComplexType: Record<string, boolean>;
  isResource: Record<string, boolean>;
}
```

Access in templates:

```mustache
{{model.name}}                 {{! Type name }}
{{model.saveName}}             {{! Safe identifier }}
{{#model.fields}}              {{! Iterate fields }}
  {{name}}
  {{typeName}}
  {{isRequired}}
{{/model.fields}}
```

##### FieldViewModel

Represents a field within a type:

```typescript
{
  name: string;                          // "identifier"
  saveName: string;                      // Escaped name
  owner: NamedViewModel;                 // Parent type

  typeName: string;                      // "Identifier | CodeableConcept"

  isArray: boolean;                      // true if cardinality > 1
  isRequired: boolean;                   // true if min cardinality > 0
  isEnum: boolean;                       // true if bound to value set

  isSizeConstrained: boolean;
  min?: number;                          // Minimum length/count
  max?: number;                          // Maximum length/count

  isPrimitive: {
    isString?: boolean;
    isBoolean?: boolean;
    isInteger?: boolean;
    isDate?: boolean;
  };
  isComplexType: { isIdentifier?: boolean; ... };
  isResource: { isPatient?: boolean; ... };
}
```

Access in templates:

```mustache
{{#model.fields}}
  {{#isRequired}}required{{/isRequired}}
  {{#isArray}}list{{/isArray}}
  {{#isPrimitive.isString}}string type{{/isPrimitive.isString}}
{{/model.fields}}
```

##### EnumViewModel

Represents a value set binding:

```typescript
{
  name: string;                          // "PatientStatus"
  saveName: string;                      // Safe identifier

  values: [
    { name: "active", saveName: "Active" },
    { name: "inactive", saveName: "Inactive" },
    { name: "entered-in-error", saveName: "EnteredInError" }
  ];
}
```

Access in templates:

```mustache
{{#model.nestedEnums}}
export enum {{#lambda.pascalCase}}{{name}}{{/lambda.pascalCase}} {
  {{#values}}
  {{saveName}} = "{{name}}",
  {{/values}}
}
{{/model.nestedEnums}}
```

### Writing Mustache Templates

#### Template Syntax

Mustache uses `{{variable}}` syntax for data binding:

```mustache
{{variable}}                   {{! Output variable }}
{{#section}}...{{/section}}    {{! Section (if true or iterate array) }}
{{^section}}...{{/section}}    {{! Inverted (if false) }}
{{#lambda}}text{{/lambda}}     {{! Lambda (transformation) }}
{{> partials/name }}           {{! Include partial }}
{{! comment }}                 {{! Comment (not output) }}
{{{variable}}}                 {{! Unescaped output }}
```

#### Case Conversion Lambdas

Transform text case within templates:

```mustache
{{#lambda.camelCase}}Patient Name{{/lambda.camelCase}}
{{! Output: patientName }}

{{#lambda.pascalCase}}patient name{{/lambda.pascalCase}}
{{! Output: PatientName }}

{{#lambda.snakeCase}}Patient Name{{/lambda.snakeCase}}
{{! Output: patient_name }}

{{#lambda.kebabCase}}Patient Name{{/lambda.kebabCase}}
{{! Output: patient-name }}

{{#lambda.lowerCase}}PATIENT NAME{{/lambda.lowerCase}}
{{! Output: patient name }}

{{#lambda.upperCase}}patient name{{/lambda.upperCase}}
{{! Output: PATIENT NAME }}
```

#### Name Safety Lambdas

Apply name transformations and keyword escaping:

```mustache
{{#lambda.saveTypeName}}{{model.name}}{{/lambda.saveTypeName}}
{{! Applies keyword escaping and type name rules }}

{{#lambda.saveFieldName}}{{field.name}}{{/lambda.saveFieldName}}
{{! Escapes reserved words for field names }}

{{#lambda.saveEnumValueName}}{{value.name}}{{/lambda.saveEnumValueName}}
{{! Creates safe enum value identifiers }}
```

#### Special Variables

Available in every template:

```mustache
{{meta.timestamp}}       {{! ISO 8601 timestamp }}
{{meta.generator}}       {{! Generator name from config }}
{{properties.*}}         {{! Custom properties from rendering config }}
```

**List Context Variables** (when iterating arrays):

```mustache
{{#model.fields}}
  {{-index}}             {{! 0-based position }}
  {{-length}}            {{! Total count }}
  {{-first}}             {{! true if first item }}
  {{-last}}              {{! true if last item }}
{{/model.fields}}
```

### Static Files

Files in the `static/` directory are copied to output unchanged:
- Build configuration (tsconfig.json, go.mod, Cargo.toml, etc.)
- Package manifests (package.json, setup.py, etc.)
- Documentation (README.md)
- Ignore files (.gitignore, .dockerignore, etc.)

---

## Debugging & Testing

### Enable Debug Output

Set `debug` in config.json:

```json
{
  "debug": "FORMATTED"
}
```

This injects a `{{debug}}` variable in templates with the full model structure. Use in templates:

```mustache
<pre>
{{debug}}
</pre>
```

**Debug Modes:**
- `"OFF"`: No debug info (default)
- `"FORMATTED"`: Pretty-printed JSON
- `"COMPACT"`: Minified JSON

### Inspect Generated Models

Use in-memory generation to inspect ViewModels:

```typescript
import { createGenerator } from "@atomic-ehr/codegen";

const generator = createGenerator("./my-template", {
  outputDir: "/tmp/test",
  inMemoryOnly: true
});

const tsIndex = await builder.build();
await generator.generate(tsIndex);

const files = generator.writtenFiles();
console.log(files[0].content);
```

### Validate Templates

Check Mustache syntax:

```typescript
import Mustache from "mustache";

const template = fs.readFileSync("templates/resource.mustache", "utf-8");
const model = { /* sample ViewModel */ };

try {
  const output = Mustache.render(template, model);
  console.log("Template is valid");
} catch (e) {
  console.error("Template error:", e.message);
}
```

---

## Resources

- **TypeSchemaIndex Guide**: [typeschema-index.md](./typeschema-index.md) - Input data structure and utilities
- **Writer Generator Guide**: [writer-generator.md](./writer-generator.md) - Building custom code generators with TypeScript
