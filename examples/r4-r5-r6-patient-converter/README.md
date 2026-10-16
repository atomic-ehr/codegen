# R4 → R5 → R6 Patient converter

Generates the `Patient` type tree for three FHIR releases side by side and converts a resource up the chain: R4 → R5 → R6.

```bash
make test-r4-r5-r6-patient-converter-example
```

## Layout

`generate.ts` is a **single** `APIBuilder` that loads all three releases and tree-shakes `Patient` out of each:

| Package                          | Output                        |
| -------------------------------- | ----------------------------- |
| `hl7.fhir.r4.core@4.0.1`         | `fhir-types/hl7-fhir-r4-core` |
| `hl7.fhir.r5.core@5.0.0`         | `fhir-types/hl7-fhir-r5-core` |
| `hl7.fhir.r6.core@6.0.0-ballot2` | `fhir-types/hl7-fhir-r6-core` |

The identical type names (`Patient`, `HumanName`, `Coding`, …) do not collide, because the writer already emits one directory per package.

## What actually changes between the releases

### `Patient` itself is almost frozen

The `Patient` interface has the same 20 fields with the same cardinalities in all three releases. Across R4 → R5 → R6 exactly one thing changes on the resource — R5 added `C` (common law) to the marital-status binding:

```ts
// R4
maritalStatus?: CodeableConcept<("A"|"D"|"I"|"L"|"M"|    "P"|"S"|"T"|"U"|"W"|"UNK"|string)>;
// R5 and R6
maritalStatus?: CodeableConcept<("A"|"D"|"I"|"L"|"M"|"C"|"P"|    "T"|"U"|"S"|"W"|"UNK"|string)>;
```

### The backbone types

`PatientLink` is byte-identical in all three.

`PatientCommunication` differs only in its binding: R4 emits a 57-code union for `language`, R5 and R6 leave it open. That is a threshold artifact rather than a spec change — the R5 valueset widened to all of BCP-47, and codegen drops enums over 100 codes.

`PatientContact` is unchanged R4 → R5. R6 adds three fields and keeps the one they supersede:

```ts
+ additionalAddress?: Address[];
+ additionalName?: HumanName[];
+ role?: CodeableConcept<("WIT"|"NOT"|"ECON"|"NOK"|"GUARD"|…|string)>[];
  relationship?: CodeableConcept[];   // still present, now superseded by role
```

Because `relationship` survives in R6, the converter moves values onto `role` rather than renaming a field.

### The datatypes around it are where the churn is

This is the asymmetry that shapes the converters:

| | files differing | real shape changes |
| --- | --- | --- |
| R5 → R6 | 2 | `Availability` (gains `period`), `Patient` |
| R4 → R5 | 31 of 38 | 15 |

R5 → R6 is nearly a no-op. R4 → R5 rewrites the datatype layer, in two flavours.

Cosmetic, 16 files: R4 datatypes `extends Element`, R5 `extends DataType`; `Resource` gains `extends Base`. No fields move — `Address`, `Coding`, `HumanName`, `Identifier`, `Period`, `Ratio`, `Reference` and `Meta` are otherwise identical.

Real, 15 files. The ones that matter here:

```ts
// Dosage — breaking in both directions
- asNeededBoolean? / asNeededCodeableConcept?  →  asNeeded?: boolean / asNeededFor?: CodeableConcept[]
- maxDosePerPeriod?: Ratio                     →  Ratio[]

// SampledData — a required field replaced by a different required field
- period: number                               →  interval?: number + intervalUnit: string
                                               +  codeMap?, offsets?

// Signature — required fields relaxed
- type, when, who required                     →  all optional

// Extension — the value[x] set grew
+ valueAvailability, valueCodeableReference, valueExtendedContactDetail,
+ valueInteger64, valueRatioRange
- valueContributor                                (Contributor was deleted in R5)

// Attachment  gains height / width / frames / duration / pages
// Quantity     comparator gains "ad"
// Expression   language became optional
```

### Why R4 → R5 will not compile but R5 → R6 is free

`Extension` inlines every `value[x]` variant, and every element carries `extension?: Extension[]`. So the `Dosage` and `SampledData` breaks above reach *every* R4 datatype through `Extension`, making all of them unassignable to their R5 twins — including the ones that are byte-identical apart from the base-class rename. That is what `carry<T>()` in the test exists for.

R5 → R6 has no such break: `Availability.period` is an addition, and additions stay assignable.

One caveat on every binding union above: it reflects the terminology package that was loaded, not something intrinsic to the release. See below.

## Terminology across releases

R4 core bundles the HL7 terminology CodeSystems; R5 and R6 moved them out to `hl7.terminology` without declaring a dependency on it. Two things follow.

First, `hl7.terminology` has to be loaded, or a binding like `Patient.maritalStatus` expands to nothing and the field degrades from a code union to a bare `CodeableConcept`.

Second — and this is the part that only bites when several releases share one builder — loading it is not enough. The same THO canonical is now provided by both `hl7.fhir.r4.core` (an older bundled copy) and `hl7.terminology`. CodeSystem resolution runs against the package that defines the ValueSet, so each release has to be able to reach the terminology package through its *own* closure. R5 and R6 declare no such dependency, so the example adds one at the loader:

```ts
patches: {
    packageJson: [inPackage("hl7.fhir.r5.core", [ensureDependency({ "hl7.terminology": "6.0.2" })])],
}
```

Without it, R5 and R6 silently inherit R4's marital-status codes. With it, each release keeps its own. `patient-conversion.test.ts` asserts that directly against the generated files.

The patch does not replace the `.fromPackage("hl7.terminology", "6.0.2")` root, it complements it: the patch adds a dependency *edge*, and `.fromPackage` is what installs and indexes the package. Drop the latter and the traversal follows the edge into a package that was never loaded (`Package hl7.terminology not found`).

Both releases share one terminology version because two versions of a package cannot be loaded together — the schema index is keyed by package name. `6.0.2` is what R6 ballot2 references; R5 references `5.1.0`, but the marital-status codes are identical across `5.1.0`/`6.0.1`/`6.0.2`, so the newer one covers both. The 6.x line is preferable anyway: THO `5.1.0` declares a dependency on `hl7.fhir.r4.core`, which would drag R4 core into R5's and R6's closures for no benefit.

## What the tests show

The generated tree is gitignored, so `generated-output.test.ts` snapshots what was emitted — every module by release, and the `maritalStatus` binding line per release. Those snapshots are the committed record that all three releases come out and that each keeps its own terminology.

`patient-conversion.test.ts` holds the two converters plus assertions about what the generated types allow. `patientR5ToR6` is a spread that moves `relationship` onto `role`; `patientR4ToR5` has to go through `carry<T>()`, for the reason above.

The incompatibility is not a codegen defect and must not be "fixed" in the generator: making R4 types assignable to R5 types would let a caller pass an R4 `Dosage` where an R5 `Dosage` is required. The test pins both root causes separately with `@ts-expect-error`, so a future release that removes one break does not leave the assertion silently propped up by the other.

The `@ts-expect-error` directives are real assertions: the Makefile target runs `tsc --project` over the generated code *and* the test, so a directive that stops erroring fails the build.

## Tree-shake package keys

Tree-shake roots are keyed by package name, optionally version-qualified:

```ts
.typeSchema({
    treeShake: {
        "hl7.fhir.r4.core#4.0.1": { "http://hl7.org/fhir/StructureDefinition/Patient": {} },
        "hl7.fhir.r5.core#5.0.0": { "http://hl7.org/fhir/StructureDefinition/Patient": {} },
        "hl7.fhir.r6.core#6.0.0-ballot2": { "http://hl7.org/fhir/StructureDefinition/Patient": {} },
    },
})
```

The version is an assertion, not a selector — it must match a loaded package. It earns its keep here, where all three releases provide the same canonical and each key has to say which one roots its shake. A root that does not resolve in the named package is an error, not a fallback to whichever package happens to contain the URL.
