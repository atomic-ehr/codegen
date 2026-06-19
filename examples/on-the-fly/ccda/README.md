# C-CDA on FHIR Example

TypeScript type generation for HL7 CDA, generated on the fly from the FHIR registry. Demonstrates **logical model promotion** (`promoteLogical`) — CDA's logical-kind StructureDefinitions are promoted to first-class resources so they generate like normal types — together with `preprocessPackage` fixes for package defects.

A single `generate.ts` pulls `hl7.cda.us.ccda@5.0.0-ballot` (US C-CDA, which depends on CDA UV Core) plus `hl7.fhir.r4.core@4.0.1`, so one `fhir-types/` tree contains the base R4 types (`hl7-fhir-r4-core/`), the CDA UV Core logical models promoted to resources (`hl7-cda-uv-core/`), and the US C-CDA profiles (`hl7-cda-us-ccda/`).

## Overview

This example demonstrates:

- Promoting CDA logical models to resources via `.typeSchema({ promoteLogical: { ... } })`
- Discovering which StructureDefinitions to promote by inspecting the `type-profile-style` extension (`generate.ts`)
- `preprocessPackage` fixes for known package defects (malformed `IVL_TS` canonical, an unavailable NLM value set on `CarePlanAct`, missing `bundle-type` codes)
- Mapping between CDA and FHIR R4 in both directions

## Generating Types

```bash
bun run examples/on-the-fly/ccda/generate.ts
```

This outputs to `./examples/on-the-fly/ccda/fhir-types/` (gitignored, regenerated on CI) along with introspection debug files (TypeSchema, FHIR schemas, StructureDefinitions, `type-tree.yaml`).

## Configuration

Edit `generate.ts` to customize generation:

```typescript
.typeSchema({ promoteLogical: { "hl7.cda.uv.core": cdaResources } })
.typescript({ withDebugComment: false })
```

`cdaResources` is computed at runtime by filtering the registry for StructureDefinitions whose `type-profile-style` extension is `"cda"`.

## Tests

- **demo-cda.test.ts** — CDA → FHIR R4 mapping (CDA `Patient`/`Observation` → FHIR `Patient`/`Observation`)
- **demo-ccda.test.ts** — FHIR R4 → C-CDA mapping (FHIR `MedicationStatement` → `MedicationActivityProfile`)

```bash
bun test ./examples/on-the-fly/ccda/
```

## Using Generated Types

Types are emitted per package; import from the package subpath rather than a top-level barrel.

```typescript
import type * as CDA from "./fhir-types/hl7-cda-uv-core";
import type * as FHIR from "./fhir-types/hl7-fhir-r4-core";
import { MedicationActivityProfile } from "./fhir-types/hl7-cda-us-ccda";

// Promoted CDA logical model used as a resource
const admin: CDA.SubstanceAdministration = {
    resourceType: "SubstanceAdministration",
    classCode: "SBADM",
    moodCode: "INT",
    statusCode: { code: "completed" },
};

// US C-CDA profile class wrapping a CDA resource
const activity = new MedicationActivityProfile(admin);
```
