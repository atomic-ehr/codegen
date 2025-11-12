# FHIR Slices Representation

Working issue: [#24](https://github.com/fhir-schema/fhir-schema-codegen/issues/24)

## Slicing

Slicing is an approach to work with arrays in FHIR. It allows defining a `view` on the array and constraints on them. Let's examine the `us-core-blood-pressure` example:

- Built on top of the generic `Observation` resource which contains a `component` array field. This field contains multiple `Observation.component` elements.
- `us-core-blood-pressure` defines the specific `Observation` type for blood pressure measurements which includes a set of slices on the `Observation.component` field:
  - `systolic` slice for systolic blood pressure
  - `diastolic` slice for diastolic blood pressure

Let's describe several levels of slice support in SDK:

1. **No support**. We don't provide any slice-specific behavior in SDK, so users should work with `Observation.component` manually. Validation is external.
2. **Lens**. We provide functions to get/set values in specific slices. It is a generic `Observation.component`, but with some predefined values and guards.
3. **Refine**. We provide types to represent slice elements (and maybe hide `non_sliced` access).

Because the first item is not a focus point, let's examine in detail only the second and third items. I'll present them as corner options, so we have a lot of tradeoffs between them.

Common part with `Observation` (from Python SDK, cropped):

```python
class ObservationComponent(BackboneElement): pass

class Observation(DomainResource):
    component: PyList[ObservationComponent] | None = Field(None, alias="component", serialization_alias="component")
```

### Lens

```python
class UsCoreBloodPressure(Observation):
    @property
    def systolic(self) -> ObservationComponent: pass
    @systolic.setter
    def set_systolic(self, value: ObservationComponent) -> None: pass

    @property
    def diastolic(self) -> ObservationComponent: pass
    @diastolic.setter
    def set_diastolic(self, value: ObservationComponent) -> None: pass
```

Types of properties:

- zero or one element
- one or more elements
- zero or more elements

Underlying data representation is equal to `Observation`.

```python
observation = UsCoreBloodPressure(
    code=CodeableConcept(coding=[{"system": "http://loinc.org", "code": "85354-9"}]),
    status="final",
    component=[
        ObservationComponent(
            code=CodeableConcept(coding=[{"system": "http://loinc.org", "code": "8480-6"}]),
            value_quantity=Quantity(value=120, unit="mmHg", system="http://unitsofmeasure.org", code="mm[Hg]"),
        ),
        ObservationComponent(
            code=CodeableConcept(coding=[{"system": "http://loinc.org", "code": "8462-4"}]),
            value_quantity=Quantity(value=80, unit="mmHg", system="http://unitsofmeasure.org", code="mm[Hg]"),
        ),
    ],
)

bloodPressure2 = UsCoreBloodPressure()
bloodPressure2.systolic = ObservationComponent(
    # code will be set automatically
    valueQuantity=Quantity(value=120, unit="mmHg")
)
bloodPressure2.diastolic = ObservationComponent(
    # code will be set automatically
    valueQuantity=Quantity(value=80, unit="mmHg"))
```

Advantages:

- Not invasive implementation
- Doesn't need a lot of types

Disadvantages:

- Looks very unsafe from type perspective
- Builder pattern or broken visible state, requires knowledge on internal representation, very limited validation

### Refine

```python
class UsCoreBloodPressure_Slice_Distolic(ObservationComponent):
    @classmethod
    def from_observation(cls, observation: Observation) -> UsCoreBloodPressure_Slice_Distolic: pass
    def to_observation(self) -> ObservationComponent: pass

class UsCoreBloodPressureSistollicSlice(ObservationComponent):
    @classmethod
    def from_observation(cls, observation: Observation) -> UsCoreBloodPressureSistollicSlice: pass
    def to_observation(self) -> ObservationComponent: pass

class UsCoreBloodPressure(Observation):
    def get_systolic(self) -> UsCoreBloodPressure_Slice_Distolic | None: pass
    def set_systolic(self, value: UsCoreBloodPressure_Slice_Distolic) -> None: pass
    def get_diastolic(self) -> UsCoreBloodPressureSistollicSlice | None: pass
    def set_diastolic(self, value: UsCoreBloodPressureSistollicSlice) -> None: pass
```

## Run-Elements

- Slice selection:
    - `ElementDefinition.slicing.discriminator.type` -- engine for each [discriminator type](https://build.fhir.org/valueset-discriminator-type.html)
    - `ElementDefinition.slicing.discriminator.path` -- [Restricted Subset ("Simple") of FHIRPath](https://build.fhir.org/fhirpath.html#simple)
- Slice Order/Shape
- Slice validation:
    - `ElementDefinition.slicing.rules` -- is open or closed set ([all rules](http://hl7.org/fhir/ValueSet/resource-slicing-rules))
    - etc.