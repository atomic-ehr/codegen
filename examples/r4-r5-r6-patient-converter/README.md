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

## Current state: three releases, but one release's codes

The generated tree is gitignored, so `generated-output.test.ts` snapshots what was emitted and the `maritalStatus` binding per release. All three releases are emitted now, and all three carry R4's codes:

```ts
// all of R4, R5 and R6
maritalStatus?: CodeableConcept<("A" | "D" | "I" | "L" | "M" | "P" | "S" | "T" | "U" | "W" | "UNK" | string)>;
```

R5 retired `P` (polygamous) and added `C` (common law), so only the first line is right. R4 core bundles the HL7 terminology CodeSystems; R5 and R6 moved them out to `hl7.terminology`, and with every release loaded at once the binding resolves its CodeSystem globally — R4 is loaded too, ships its own older copy, and answers for everyone.

The snapshots in this directory are the measure of the fixes that follow: each one should show another release's own codes appearing in the output.
