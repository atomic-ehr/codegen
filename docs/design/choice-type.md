# Choice Type Representation

FHIR's [Choice of Datatypes](https://build.fhir.org/formats.html#choice) pattern enables a field to contain one of several possible types. Type Schema supports two representation approaches, each optimized for different programming language paradigms and code generation strategies.

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [Choice Type Representation](#choice-type-representation)
  - [Type Schema](#type-schema)
  - [Flat Choice Type Representation](#flat-choice-type-representation)
    - [TypeScript](#typescript)
    - [Java](#java)
    - [Python](#python)
  - [Hierarchical Representation via Sum Type](#hierarchical-representation-via-sum-type)
    - [TypeScript](#typescript-1)
    - [Haskell](#haskell)
  - [Implementation Considerations](#implementation-considerations)

<!-- markdown-toc end -->

## Type Schema

Part of the [Patient resource](https://www.hl7.org/fhir/patient.html).

```json
{
  "fields": {
    "deceased": {
      "choices": ["deceasedBoolean", "deceasedDateTime"],
      "required": false
    },
    "deceasedBoolean": {
      "choiceOf": "deceased",
      "type": {
        "kind": "primitive-type",
        "url": "http://hl7.org/fhir/StructureDefinition/boolean",
        "name": "boolean",
        "package": "hl7.fhir.r4.core",
        "version": "4.0.1"
      }
    },
    "deceasedDateTime": {
      "choiceOf": "deceased",
      "type": {
        "kind": "primitive-type",
        "url": "http://hl7.org/fhir/StructureDefinition/dateTime",
        "name": "dateTime",
        "package": "hl7.fhir.r4.core",
        "version": "4.0.1"
      }
    }
  }
}
```

## Flat Choice Type Representation

The flat representation maps each choice variant to separate fields in the containing class. This approach works well with languages that use nominal typing and traditional object-oriented patterns:

### TypeScript

```typescript
class Patient {
  private deceasedBoolean: boolean | null = null;
  private deceasedDateTime: string | null = null;

  isValid(): boolean {
    const deceasedFieldsSet = [
      this.deceasedBoolean,
      this.deceasedDateTime
    ].filter(x => x !== null).length;

    const deceasedValid = deceasedFieldsSet <= 1;

    return deceasedValid && true; // other validations
  }
}
```

### Java

```java
public class Patient {
    private Boolean deceasedBoolean;
    private String deceasedDateTime;

    public boolean isValid() {
        // Either both null or exactly one non-null
        boolean deceasedValid =
            (deceasedBoolean == null && deceasedDateTime == null) ||
            (deceasedBoolean != null && deceasedDateTime == null) ||
            (deceasedBoolean == null && deceasedDateTime != null);

        return deceasedValid && true; // other validations
    }
}
```

### Python

```python
class Patient:
    def __init__(self):
        self.deceased_boolean = None
        self.deceased_date_time = None

    def is_valid(self):
        """Check if the Patient resource is valid"""
        deceased_fields_set = sum(
            x is not None for x in [self.deceased_boolean, self.deceased_date_time]
        )
        deceased_valid = deceased_fields_set <= 1

        return deceased_valid and True  # other validations
```

## Hierarchical Representation via Sum Type

The hierarchical approach models choice types as nested structures using sum types or discriminated unions, providing stronger type safety in languages that support these features:

### TypeScript

```typescript
// Define a discriminated union for the Deceased choice type
type Deceased =  | { type: 'boolean', value: boolean }
  | { type: 'dateTime', value: string };

class Patient {
  // Use the union type for the choice field
  private deceased: Deceased | null = null;

  isValid(): boolean {
    return true; // No additional validation needed as the type system enforces the constraint
  }
}
```

### Haskell

```haskell
data Deceased
  = DeceasedBoolean Bool
  | DeceasedDateTime String


data Patient = Patient
  { deceased :: Maybe Deceased
  }
```

## Implementation Considerations

When choosing a representation strategy for code generation:

1. **Language capabilities**: Match the strategy to the target language's type system and idioms
2. **Type safety**: Hierarchical approaches provide compile-time safety in languages with algebraic data types (Rust, Haskell, Swift, TypeScript)
3. **Simplicity**: Flat representations may be more intuitive in languages like Java, C#, or Python
4. **Validation**: Flat representations require explicit validation logic, while hierarchical ones may enforce constraints through types
5. **JSON mapping**: Consider how each approach handles serialization/deserialization between JSON and your language's objects
6. **Developer experience**: Choose what feels most natural for developers in your target language ecosystem
