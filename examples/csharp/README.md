# C# Example

Type-safe C# class generation with Aidbox FHIR server integration and comprehensive testing.

## Overview

This example demonstrates how to generate C# classes from the FHIR R4 specification. It includes:

- Full FHIR R4 resource type definitions as C# classes
- Namespace organization for clean code structure
- Integration tests with Aidbox FHIR server
- Type-safe resource operations (Create, Read, Update, Delete)

## Setup

### Generate C# Types

From the project root:

```bash
cd codegen
bun install
bun run examples/csharp/generate.ts
```

This will output to `./examples/csharp/generated/`

### Install .NET Dependencies

```bash
cd examples/csharp
dotnet restore
```

### Start Aidbox Server (for testing)

```bash
curl -JO https://aidbox.app/runme && docker compose up
```

This will start Aidbox FHIR server on `http://localhost:8080`

## Configuration

Edit `generate.ts` to customize:

```typescript
.csharp({
    rootNamespace: "FhirTypes",
})
```

## Testing with Aidbox

### Configuration

1. Get your Aidbox credentials from `docker-compose.yaml`:
   - Look for `BOX_ROOT_CLIENT_SECRET` value
   - Update the password in `TestSdk.cs`:

```csharp
private const string Password = "your-secret-here";
```

2. Ensure Aidbox is running:

```bash
docker compose up
```

### Running Tests

Run all tests:

```bash
dotnet test
```

## Using Generated Types

### Create Resources

```csharp
using FhirTypes;

var patient = new Patient
{
    ResourceType = "Patient",
    Id = "patient-1",
    Name = new List<HumanName>
    {
        new HumanName
        {
            Use = "official",
            Family = "Doe",
            Given = new List<string> { "John" }
        }
    },
    Gender = "male",
    BirthDate = "1990-01-01"
};
```

### Serialization

```csharp
using System.Text.Json;

var options = new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
};

var json = JsonSerializer.Serialize(patient, options);
var deserialized = JsonSerializer.Deserialize<Patient>(json, options);
```
