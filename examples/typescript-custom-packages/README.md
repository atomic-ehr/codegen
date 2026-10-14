# Package Sources Example

Feeding the codegen pipeline from package sources **other than the NPM-style registry** (`.fromPackage()`). A single `generate.ts` combines two input mechanisms in one `APIBuilder`:

- **Local StructureDefinitions from disk** — `.localStructureDefinitions()`
- **Remote `.tgz` package by URL** — `.fromPackageRef()`

Both resolve against `hl7.fhir.r5.core`, so one builder covers them and everything lands in a single type tree under `./fhir-types`. Both also show tree shaking and dependency resolution against published packages.

The same `generate.ts` then runs two small focused builders that repair a broken local profile with `canonicalManager.patches` — see [3. Repairing a Profile That Widens Its Base](#3-repairing-a-profile-that-widens-its-base).

## Quick Start

```bash
# Generate the whole tree (local StructureDefinitions + remote SQL-on-FHIR .tgz package)
# and the two reference-target trees
bun run examples/typescript-custom-packages/generate.ts

# Run the local-package tests
bun test ./examples/typescript-custom-packages/
```

## Directory Structure

```
typescript-custom-packages/
├── README.md                            # This file
├── generate.ts                          # main builder (.localStructureDefinitions() + .fromPackageRef()) and two focused reference-target builders
├── structure-definitions/               # Custom StructureDefinitions for the local demo
├── reference-targets/                   # A broken profile, loaded only by the focused builders
├── profile-*.test.ts                    # Tests for the locally-generated profiles
├── reference-targets-*.test.ts          # Tests for the two ways to repair the broken profile
└── (generated output, gitignored)       # fhir-types/, fhir-types-narrow-profile/, fhir-types-extend-base/
```

---

## 1. Local StructureDefinitions

Generate TypeScript types from custom FHIR StructureDefinitions stored on disk, without
publishing them to a registry. Demonstrates:

- Loading local StructureDefinition JSON files
- Declaring a custom FHIR package and resolving dependencies against published packages (FHIR R5 core)
- Tree shaking to include only specific custom resources
- Combining local and published packages

### Adding Your StructureDefinitions

Place your FHIR StructureDefinition JSON files in `structure-definitions/`, then add them
to the `.localStructureDefinitions()` call and the tree-shake rules in `generate.ts`:

```typescript
await builder
    .localStructureDefinitions({
        package: { name: "example.folder.structures", version: "0.0.1" },
        path: Path.join(__dirname, "structure-definitions"),
        dependencies: [{ name: "hl7.fhir.r5.core", version: "5.0.0" }],
    })
    .typescript({ generateProfile: true })
    .typeSchema({
        treeShake: {
            "example.folder.structures": {
                "http://example.org/fhir/StructureDefinition/ExampleNotebook": {},
            },
        },
    })
    .outputTo("./examples/typescript-custom-packages/fhir-types")
    .generate();
```

### Combining Local and Published Packages

```typescript
await builder
    .localStructureDefinitions({
        package: { name: "example.local", version: "1.0.0" },
        path: "./my-definitions",
        dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
    })
    .fromPackage("hl7.fhir.us.core", "6.1.0") // published package alongside local
    .typescript({})
    .outputTo("./generated")
    .generate();
```

### Advanced: Using TGZ Archives from Disk

```typescript
await builder
    .localTgzPackage("./packages/my-custom-ig.tgz")
    .typescript({})
    .outputTo("./generated")
    .generate();
```

---

## 2. Remote `.tgz` Package — SQL-on-FHIR

Generate TypeScript types from a package fetched directly from a remote URL, using the
SQL-on-FHIR ViewDefinition specification as the example. Demonstrates:

- Remote package loading via `.fromPackageRef()`
- Tree shaking to include only `ViewDefinition` and its dependencies
- Explicitly adding a dependency (`hl7.fhir.r5.core`) the IG references but doesn't declare

```typescript
.fromPackage("hl7.fhir.r5.core", "5.0.0") // IG reaches R5 core but doesn't declare the dep
.fromPackageRef("https://build.fhir.org/ig/FHIR/sql-on-fhir-v2/package.tgz")
.typeSchema({
    treeShake: {
        "org.sql-on-fhir.ig": {
            "https://sql-on-fhir.org/ig/StructureDefinition/ViewDefinition": {},
        },
    },
})
```

The tree-shake rules for the IG sit alongside the local package's rules in the same
`.typeSchema()` call, and `ViewDefinition` is emitted into `./fhir-types/org-sql-on-fhir-ig/`.

Remote `.fromPackageRef()` is useful for packages not published to NPM, development/preview
versions, and custom implementation guides.

Learn more about SQL-on-FHIR: https://sql-on-fhir.org/

---

## 3. Repairing a Profile That Widens Its Base

A profile may only narrow its base ([FHIR profiling](https://hl7.org/fhir/profiling.html#using): "Any changed definitions SHALL be restrictions"). Published packages sometimes break that rule, and the generator rejects them before they reach generated code. This section shows the defect, the error, and both ways to repair the input.

### The defect

`reference-targets/widened-related-person.structuredefinition.json` restates `RelatedPerson.patient` with Patient **and Person**, but the base R5 `RelatedPerson.patient` allows only Patient:

```text
base RelatedPerson.patient:           Reference(Patient)
WidenedRelatedPerson.patient:         Reference(Patient | Person)   ← Person is not allowed by the base
```

Real packages carry the same defect: in `examples/on-the-fly/norge-r4`, `sfm-MedicationDispense` adds `sfm-MedicationStatement` to `authorizingPrescription`, and `sfm-MedicationStatement` adds itself to `basedOn`.

### Why the type check alone doesn't catch it

When the widened field is required, it lands in the profile's factory input, and `createResource` assigning it to the base resource fails `tsc` with a TS2322 that doesn't point at the cause. When the field is optional, its targets reach only `validate()`'s `validateReference` list, so the code compiles and `validate()` silently accepts a target the base forbids. The generator therefore checks this itself.

### The error

Generating the profile without a patch fails with an error that shows both target lists and prints both fixes, ready to paste:

```text
Profile reference targets exceed its base:

  package:         example.reference.targets#0.0.1
  profile:         http://example.test/StructureDefinition/widened-related-person
  base:            http://hl7.org/fhir/StructureDefinition/RelatedPerson
  element:         RelatedPerson.patient
  base targets:    http://hl7.org/fhir/StructureDefinition/Patient
  profile targets: http://hl7.org/fhir/StructureDefinition/Patient, http://hl7.org/fhir/StructureDefinition/Person

A profile may only narrow its base (https://hl7.org/fhir/profiling.html#using), so the package is invalid.

Repair it with a canonicalManager patch (inPackage, inResource, patchElement from @atomic-ehr/fhir-canonical-manager/patch), either way:

1. Narrow the profile to its base's targets:
  ...

2. Extend the base to the profile's targets:
  ...
```

### Fix 1: narrow the profile

Drop the targets the base doesn't allow from the profile. This keeps the base exactly as the FHIR specification defines it, so it is the usual choice. `generate.ts` builds `fhir-types-narrow-profile/` with:

```typescript
new APIBuilder({
    canonicalManager: {
        patches: {
            fhirResource: [
                inPackage("example.reference.targets", [
                    inResource("http://example.test/StructureDefinition/widened-related-person", [
                        patchElement("RelatedPerson.patient", (element) => ({
                            ...element,
                            type: element.type?.map((type) => ({
                                ...type,
                                targetProfile: ["http://hl7.org/fhir/StructureDefinition/Patient"],
                            })),
                        })),
                    ]),
                ]),
            ],
        },
    },
})
```

Result: the profile and the base both take `Reference<"Patient">`, and `validate()` rejects a `Person` reference.

### Fix 2: extend the base

Add the profile's extra targets to the base element instead. Use this when you need to keep data the profile allows — but it changes the base resource for every profile and every consumer of the generated types. `generate.ts` builds `fhir-types-extend-base/` with:

```typescript
new APIBuilder({
    canonicalManager: {
        patches: {
            fhirResource: [
                inPackage("hl7.fhir.r5.core", [
                    inResource("http://hl7.org/fhir/StructureDefinition/RelatedPerson", [
                        patchElement("RelatedPerson.patient", (element) => ({
                            ...element,
                            type: element.type?.map((type) => ({
                                ...type,
                                targetProfile: [
                                    "http://hl7.org/fhir/StructureDefinition/Patient",
                                    "http://hl7.org/fhir/StructureDefinition/Person",
                                ],
                            })),
                        })),
                    ]),
                ]),
            ],
        },
    },
})
```

Result: the base `RelatedPerson.patient` and the profile both take `Reference<"Patient" | "Person">`.

### How the patch works

- `inPackage(name, [...])` scopes the patch to one package, `inResource(url, [...])` to one StructureDefinition in it.
- `patchElement(elementId, fn)` rewrites that element in both the snapshot and the differential; `fn` returns the new element.
- Patches run when the package is loaded, before the generator sees it, so no workaround lives in generator code.

### Tests

- `reference-targets-narrow-profile.test.ts` and `reference-targets-extend-base.test.ts` cover one fix each: a demo, a rejected target in `validate()`, `@ts-expect-error` assertions checked by `tsc`, and a snapshot of the generated profile module.
- `test/api/write-generator/profile-reference-target-exceeds-base.test.ts` pins the error for the unpatched profile.
