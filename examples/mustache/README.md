# Mustache Template-Based Generation Example

Java code generation using Mustache templates and the FHIR R4 specification.

## Overview

This example demonstrates how to generate Java classes from FHIR R4 using template-based code generation. It includes:

- Template-driven Java class generation with Mustache
- Automatic resource and complex type modeling
- Utility class generation for common operations
- Post-generation hooks for code formatting and testing
- Custom name transformations for Java conventions

## Setup

### Generate Java Types

From the project root:

```bash
cd codegen
bun install
bun run examples/mustache/mustache-java-r4-gen.ts
```

This will output to `./examples/mustache/mustache-java-r4-output/`

### Build Java Project

```bash
cd examples/mustache/mustache-java-r4-output
mvn clean package
```

## Configuration

The generation is configured via `java/config.json`. Key settings include:

**Type Mapping:**
Maps FHIR primitive types to Java types:
- `boolean` → `Boolean`
- `date` → `String`
- `dateTime` → `OffsetDateTime`
- `decimal` → `BigDecimal`
- `integer` → `Integer`

**Name Transformations:**
Applies Java naming conventions:
- Enum values: `<=` → `LESS_OR_EQUAL`
- Types: Add `DTO` suffix
- Fields: Rename reserved words

**Post-Generation Hooks:**
- Run Spotless for code formatting
- Execute Maven tests

## Template Structure

### Templates

Located in `java/templates/`:

- `model/resource_or_complex_type.mustache` - Main template for resources and complex types
- `model/utils/*.mustache` - Utility class templates
- `annotated_type.mustache` - Type with annotations
- `plain_type.mustache` - Simple type definition
- `primitive_wrapped_plain_type.mustache` - Wrapped primitive types

### Static Files

Located in `java/static/`:

- `pom.xml` - Maven project configuration
- `model/src/` - Base Java project structure

## Using Generated Types

### Create a Resource

```java
Patient patient = new Patient()
    .setResourceType("Patient")
    .setId("patient-1")
    .setGender("male");
```

### Add Extensions

```java
patient.getExtension().add(new Extension()
    .setUrl("http://example.com/extension")
    .setValue(new StringType("value")));
```

### Serialization

```java
ObjectMapper mapper = new ObjectMapper();
String json = mapper.writeValueAsString(patient);
Patient deserialized = mapper.readValue(json, Patient.class);
```

## Customization

### Change Output Package

Edit `java/config.json` and update the `package` property in renderings:

```json
"properties": {
  "package": "com.mycompany.fhir.models"
}
```

### Filter Specific Resources

Customize which resources to generate via whitelist/blacklist in config:

```json
"filters": {
  "resource": {
    "whitelist": ["Patient", "Observation"]
  }
}
```

### Add Post-Generation Steps

Add hooks to run additional tools after generation:

```json
"hooks": {
  "afterGenerate": [
    {"cmd": "mvn", "args": ["clean", "compile"]}
  ]
}
```

## Template Variables

Templates have access to the following context:

**TypeViewModel:**
- `name` - Resource or type name
- `saveName` - Name safe for use as Java class name
- `description` - FHIR description
- `baseType` - Parent type if any
- `fields` - Array of fields

**FieldViewModel:**
- `name` - Field name
- `saveName` - Safe field name
- `type` - Field type
- `isArray` - Whether field is a list
- `required` - Whether field is required
- `description` - Field description

**Special Variables:**
- `meta.timestamp` - Generation timestamp
- `meta.generator` - Generator identification
- `properties` - Custom properties from config

## Next Steps

- See [examples/](../) overview for other language examples
- Check [../../docs/guides/mustache-generator.md](../../docs/guides/mustache-generator.md) for detailed Mustache template documentation
- Review `java/templates/` for template examples