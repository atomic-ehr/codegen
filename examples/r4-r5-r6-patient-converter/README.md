# R4 → R5 → R6 Patient converter

Generates the `Patient` type tree for three FHIR releases side by side, from a **single** `APIBuilder`, so a resource can be carried up the chain: R4 → R5 → R6.

```bash
make test-r4-r5-r6-patient-converter-example
```

## Layout

`generate.ts` loads all three releases and tree-shakes `Patient` out of each:

| Package                          | Output                        |
| -------------------------------- | ----------------------------- |
| `hl7.fhir.r4.core@4.0.1`         | `fhir-types/hl7-fhir-r4-core` |
| `hl7.fhir.r5.core@5.0.0`         | `fhir-types/hl7-fhir-r5-core` |
| `hl7.fhir.r6.core@6.0.0-ballot2` | `fhir-types/hl7-fhir-r6-core` |

The identical type names (`Patient`, `HumanName`, `Coding`, …) do not collide, because the writer already emits one directory per package.

## Current state: only R4 comes out

The generated tree is gitignored, so `generated-output.test.ts` snapshots what was emitted — and today that is R4 alone. Generation reports success while the R5 and R6 roots quietly resolve to nothing:

```
! ts: Type '…/StructureDefinition/Patient' not found in 'hl7.fhir.r4.core#4.0.1'
! ts: Type '…/StructureDefinition/Patient' fallback to package hl7.fhir.r4.core
! ts: Type '…/StructureDefinition/Patient' not found in 'hl7.fhir.r5.core#5.0.0'
! ts: Type '…/StructureDefinition/Patient' not found in 'hl7.fhir.r6.core#6.0.0-ballot2'
```

All three releases provide that canonical, so each tree-shake key has to say which release roots it — and the documented `name#version` form never matches the schema index, which is keyed by bare package name. The key misses, the resolver falls back to whichever package sorts first, and R4 answers for everyone.

The snapshots in this directory are the measure of the fixes that follow: each one should show another release, or another release's own codes, appearing in the output.
