# C# SDK with Aidbox

A type-safe C# SDK for interacting with Aidbox FHIR server, generated from FHIR R4 specifications. The SDK provides strongly-typed classes for all FHIR resources and a synchronous client for server communication.

## Quick Start

1. Install dependencies:
```bash
dotnet restore
```

2. Start Aidbox server:
```bash
curl -JO https://aidbox.app/runme && docker compose up
```

3. Get license (first run only):
   - Open http://localhost:8888
   - Follow setup instructions

## Testing Code using Aidbox

### Configuration

1. **Get your Aidbox credentials** from `docker-compose.yaml`:
   - Look for `BOX_ROOT_CLIENT_SECRET` value
   - Update the password in `TestSdk.cs`:
```csharp
   private const string Password = "your-secret-here";
```

2. **Ensure Aidbox is running**:
```bash
   docker compose up
```
   - FHIR server should be accessible at `http://localhost:8080`

### Running Tests

Run all tests:
```bash
dotnet test
```

### Available Tests

The test suite includes comprehensive CRUD operations:

- **TestCreatePatient** - Creates a new patient resource
- **TestReadPatient** - Retrieves an existing patient by ID
- **TestUpdatePatient** - Updates patient information
- **TestDeletePatient** - Deletes a patient and verifies removal
- **TestSearchPatient** - Searches for patients by name
- **TestJsonSerialization** - Validates JSON serialization/deserialization
- **TestResourceMapping** - Verifies resource type mapping
- **TestEnumFields** - Tests enum field definitions across resources

## Usage

### SDK Generation

At the current state code generation can be configured and performed using APIBuilder:
``` typescript
import { APIBuilder } from "../../src";

const builder = new APIBuilder()
        .verbose()
        .throwException()
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .csharp("SuperNameSpace", "src/api/writer-generator/csharp/staticFiles")
        .outputTo("./examples/csharp/generated")
        .cleanOutput(true);

await builder.generate();
```

### Working with FHIR Resources

The SDK provides strongly-typed classes for all FHIR resources. Here's an example of creating a Patient:
```csharp
using CSharpSDK.Client;

// Initialize client
var client = new Client(
    url: "http://localhost:8080/fhir",
    auth: new Auth
    {
        Method = AuthMethods.BASIC,
        Credentials = new AuthCredentials
        {
            Username = "root",
            Password = "your-secret-here"
        }
    }
);

// Create a patient
var patient = new Patient
{
    Name = [new HumanName { Given = ["John"], Family = "Doe" }],
    Gender = AdministrativeGenderEnum.Male,
    BirthDate = "1990-01-01"
};

var (result, error) = client.Create(patient).Result;
if (error == null)
{
    Console.WriteLine($"Patient created with ID: {result.Id}");
}

// Read a patient
var (readPatient, readError) = client.Read<Patient>(result.Id).Result;

// Update a patient
readPatient.BirthDate = "1990-02-01";
var (updated, updateError) = client.Update(readPatient).Result;

// Search for patients
var (searchResults, searchError) = client.Search<Patient>("name=Doe").Result;

// Delete a patient
var deleteError = client.Delete<Patient>(result.Id).Result.error;
```

## How This SDK Was Generated

This SDK was automatically generated using the FHIR Schema Codegen tool. The generation process:

1. Reads FHIR R4 resource definitions
2. Generates C# classes for each FHIR resource
3. Creates a type-safe client for interacting with the Aidbox server

## Development

### Required NuGet Packages
```xml
<PackageReference Include="Microsoft.NET.Test.Sdk" Version="18.0.0" />
<PackageReference Include="NUnit" Version="4.4.0" />
<PackageReference Include="NUnit3TestAdapter" Version="4.6.0" />
```

### Local Development

1. Restore dependencies:
```bash
dotnet restore
```

2. Build the project:
```bash
dotnet build
```

3. Run tests:
```bash
dotnet test
```