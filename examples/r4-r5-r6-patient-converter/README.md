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

## What the snapshots show

The generated tree is gitignored, so `generated-output.test.ts` snapshots what was emitted and the `maritalStatus` binding per release. Each release now answers with its own terminology:

```ts
// R4 — core bundles the HL7 terminology CodeSystems
maritalStatus?: CodeableConcept<("A" | "D" | "I" | "L" | "M" |       "P" | "S" | "T" | "U" | "W" | "UNK" | string)>;
// R5 and R6 — resolved from hl7.terminology, which adds "C" (common law)
maritalStatus?: CodeableConcept<("A" | "D" | "I" | "L" | "M" | "C" | "P" | "T" | "U" | "S" | "W" | "UNK" | string)>;
```

R5 and R6 moved these CodeSystems out of core into `hl7.terminology` and declare no dependency on it — neither ships a `dependencies` field at all, because HL7 wires THO in through the publisher rather than through package metadata. `generate.ts` supplies that edge with `ensureDependency`, and the binding then resolves through the closure of the package that defines the ValueSet instead of globally, where R4's own older copy would answer for everyone.
