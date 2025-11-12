# Basic FHIR Profiles Representation

Scope: This document covers only the basic representation of the relationship between profiles and resources. Profile specific constraints are not represented in this document.

## Profile Example

Let's see an example of a profile for `bodyweight` from R4. That profile is defined by the following StructureDefinitions:

1. Constraint: <http://hl7.org/fhir/StructureDefinition/bodyweight>
2. Constraint: <http://hl7.org/fhir/StructureDefinition/vitalsigns>
3. Specialization: <http://hl7.org/fhir/StructureDefinition/Observation>
4. Specialization: <http://hl7.org/fhir/StructureDefinition/DomainResource>
5. Specialization: <http://hl7.org/fhir/StructureDefinition/Resource>

[^universal]: Here, **universal** means that the data structure of the last specialization (`Observation`) should be able to represent all "Profiled" resources.

Constraints define:
- Additional constraints, e.g., `bodyweight` requires that coding should contain `BodyWeightCode`
- Named *virtual* fields defined by slices to access array elements, e.g., in `Observation` we have an array of `Categories`, in `vitalsigns` we have a `VSCat` slice which should contain a fixed value [^slice-as-interface].

[^slice-as-interface]: For a better example, see the us-core-package and `USCoreBloodPressure` profile, which defines `systolic` and `diastolic` fields.

Example of the resource:

```jsonc
{
  "meta": {
    "profile": [
      // implicitly: "http://hl7.org/fhir/StructureDefinition/vitalsigns",
      "http://hl7.org/fhir/StructureDefinition/bodyweight"
    ]
  },
  "resourceType": "Observation",
  "id": "example-genetics-1",
  "effectiveDateTime": "2020-10-10",
  "status": "final",
  "category": [
    {"coding": [{"code": "vital-signs", "system": "http://terminology.hl7.org/CodeSystem/observation-category"}]}
  ],
  "code": {"coding": [{"code": "29463-7", "system": "http://loinc.org"}]},
  "valueCodeableConcept": {"coding": [{"code": "10828004", "system": "http://snomed.info/sct"}]},
  "subject": {"reference": "Patient/pt-1"}
}
```

## SDK Design Questions

### Interaction between the resource and profiles

Problem: resource (`Observation`) and profile (`bodyweight`) can be related to each other by:

1. `subclass`: profile is a subclass of resource.
    - **Advantage**:
        - full access to the resource and profile interface at same time
        - polymorphism between profiles and resource.
    - **Disadvantage**:
        - inconsistencies between resource and profile can be resolved only at runtime (e.g. forbidden fields)
        - switching between multiple profiles.
2. `link`: profile is linked to resource where profile is an adaptor to resource file.
    - **Advantage**:
        - fully independent interfaces and separation of concern,
    - **Disadvantage**:
        - lack of polymorphism between profiles and resources,
            - don't need to partly implement resource API in profile type (use only mentioned in profile things)
        - data inconsistencies (edit profile then resource and break profile).

<!-- HAPI use link -->

### Interactions between inheritance profiles

Problem: if we have several levels of profiles on top of the resource how they should be related (e.g. `bodyweight`, `vitalsigns`)?

- the same arguments as for *Interaction between the resource and profiles* are applicable.
- plus polymorphism between profiles.

### JSON -> object conversion and Profile

Arbitrary JSON can be converted to:

1. Resource type, independently from the profiles.
1. Profile type.
    - Multiple profiles.
    - `*void` in `GET /Observation/1234`

### Mutable/Immutable Representation

In both cases of *Interaction between the resource and profiles* we need to cast object types/classes between different profiles/resource.

- It can't be represented as a single type because different profiles can overlap each other in a bad way.

## Type Schema Representation

Type Schema representation for profiles. Profiles should have separated `kind = constraint`.

How to represent profile entities:

1. `difference`:
    - more Type Schema consistency: resource representation more oriented on inheritance.
    - during codegen we need to traverse the inheritance tree to find the correct profile element.
1. `snapshot`:
    - better approach for `link` and code generation (one pass through);
    - worse for `subtypes`;
    - Type Schema consistency: resource representation more oriented on inheritance.

Current solution: to collect all profile elements we need to traverse the inheritance tree and collect first find description.

## Snippets

```python
class ObservationComponent(Observation): pass

class Observation(DomainResource): pass
class UsCoreBloodPressure(Observation): pass

# Create Observation
obs1 = Observation(...)
pressure1 = obs1.attachProfile(UsCoreBloodPressure)
pressure1 = obs1.profile.UsCoreBloodPressure

# Create UsCoreBloodPressure directly
pressure2 = UsCoreBloodPressure(...)
pressure2.diastolic = Quantity(...)
obs2 = pressure2.resource
```

### (`effective`) `Observation` -> `vitalsigns` -> `bodyweight`

```typescript
export interface Observation extends DomainResource {
    // "effective" : {
    //   "excluded" : false,
    //   "choices" : [ "effectiveDateTime", "effectivePeriod", "effectiveTiming", "effectiveInstant" ],
    //   "array" : false,
    //   "required" : false
    // },
    // "effectiveDateTime" : {
    //   "excluded" : false,
    //   "type" : {
    //     "kind" : "primitive-type",
    //     "package" : "hl7.fhir.r4.core",
    //     "version" : "4.0.1",
    //     "name" : "dateTime",
    //     "url" : "http://hl7.org/fhir/StructureDefinition/dateTime"
    //   },
    //   "array" : false,
    //   "choiceOf" : "effective",
    //   "required" : false
    // },
    // ...
    effectiveDateTime?: string;
    effectiveInstant?: string;
    effectivePeriod?: Period;
    effectiveTiming?: Timing;
}

export interface ObservationVital extends Profile {
    // Difference:
    // 1. `effectiveTiming`, `effectiveInstant` removed
    // 2. `effective` should be required fields
    //
    // "effective" : {
    //   "excluded" : false,
    //   "choices" : [ "effectiveDateTime", "effectivePeriod" ],
    //   "array" : false,
    //   "required" : true
    // },
    // "effectiveDateTime" : {
    //   "excluded" : false,
    //   "type" : {
    //     "kind" : "primitive-type",
    //     "package" : "hl7.fhir.r4.core",
    //     "version" : "4.0.1",
    //     "name" : "dateTime",
    //     "url" : "http://hl7.org/fhir/StructureDefinition/dateTime"
    //   },
    //   "array" : false,
    //   "choiceOf" : "effective",
    //   "required" : false
    // },
    effectiveDateTime?: string;
    effectivePeriod?: Period;
}

export interface Observation_bodyweight extends DomainResource {
    effectiveDateTime?: string;
    effectivePeriod?: Period;
}
```
