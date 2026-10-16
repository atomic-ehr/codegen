# TypeSchemaIndex Guide

The `TypeSchemaIndex` is a comprehensive data structure containing all transformed FHIR definitions in TypeSchema format. It serves as the primary input to code generators and provides utilities for navigating type hierarchies, resolving references, and working with profiles and specializations.

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [TypeSchemaIndex Guide](#typeschemaindex-guide)
  - [Overview](#overview)
  - [Collection Methods](#collection-methods)
  - [Resolution Methods](#resolution-methods)
  - [Hierarchy Methods](#hierarchy-methods)
  - [Specialization Methods](#specialization-methods)
  - [Profile Methods](#profile-methods)
  - [Debug Utilities](#debug-utilities)
  - [Core Utilities Examples](#core-utilities-examples)
    - [Collection Methods](#collection-methods-1)
    - [Resolution Methods](#resolution-methods-1)
    - [Hierarchy Methods](#hierarchy-methods-1)
    - [Specialization Methods](#specialization-methods-1)
    - [Profile Methods](#profile-methods-1)
    - [Debug Utilities](#debug-utilities-1)
  - [Helper Utilities](#helper-utilities)
  - [Resources](#resources)

<!-- markdown-toc end -->

---

## Overview

Translation returns a flat collection of `TypeSchema` nodes: the root, its nested types,
terminology bindings, and value sets. A root has no `nested` property. Each nested type has
an `owner`, element `path`, `derivation`, structural `origin`, and direct `dependencies`.

```typescript
import { generateTypeSchemas, mkTypeSchemaIndex, registerFromPackageMetas } from "@atomic-ehr/codegen";

const register = await registerFromPackageMetas([{ name: "hl7.fhir.r4.core", version: "4.0.1" }]);
const { schemas } = await generateTypeSchemas(register);
const index = mkTypeSchemaIndex(schemas, { register });
const observation = index.collectResources().find((schema) => schema.identifier.name === "Observation")!;
index.resolve(observation.identifier);          // Same resolver for every schema kind
index.nestedTypesOf(observation.identifier);    // Group declarations for an output module
index.reachableFrom([observation.identifier]);  // Walk direct dependencies
index.moduleDependencies(observation);         // Dependencies across a generated module
```

`APIBuilder` uses this representation automatically. The standard translator, index,
tree shaker, logical promotion, and all writers consume flat nodes. Writers query ownership
to preserve the generated module layout; there is no embedded compatibility view or mode flag.

A profile constraining `Observation.component` gets its own node, such as
`MyObservationProfile#component`, based on `Observation#component`. Further profiles link to
the nearest ancestor constraining that path. Unchanged nested types keep the ancestor's identity.
TypeScript and Python profile writers use `typeForGeneration` to select the structural declaration
for imports while constraint lookups resolve the profile-specific node. Nested fields contain
resolved values from the FHIRSchema genealogy, rather than pure differentials. Constraints inside
ordinary datatypes and slice schemas retain their existing translation behavior.

`reachableFrom` reports missing dependency targets. External terminology placeholders in the
`missing_valuesets` package have no generated definition. Tree shaking retains reachable nested
nodes and recalculates dependencies after field selection, so removing a field also removes
otherwise unused nested definitions.

TypeSchemaIndex is created during the TypeSchema generation phase and serves as the input to all code generators (Writer implementations, Mustache templates, etc.). It organizes all FHIR schemas by canonical URL and package name, enabling efficient lookups and traversals of complex type relationships.

Why TypeSchemaIndex Matters

- **Complete Data**: Contains ALL types from the FHIR package
- **Already Transformed**: Types converted from FHIR StructureDefinition to TypeSchema format
- **Dependencies Resolved**: References between types already established
- **Organized**: Queryable by type category (resources, complex types, profiles, logical models)
- **Relationship-Aware**: Includes hierarchy, specialization, and inheritance information
- **Read-Only**: Frozen snapshot; writes go through Writer methods only
- **Queryable**: Rich set of utilities for filtering, resolving, and traversing types

---

## Collection Methods

Query schemas by type category:

```typescript
collectComplexTypes(): ComplexTypeTypeSchema[]
  Returns all complex types (datatypes, backbone elements)

collectResources(): ResourceTypeSchema[]
  Returns all FHIR resources (Patient, Observation, etc.)

collectLogicalModels(): LogicalTypeSchema[]
  Returns all logical models

collectProfiles(): ProfileTypeSchema[]
  Returns all profiles (constraints on base types)
```

---

## Resolution Methods

Look up individual schemas by identifier or URL:

```typescript
resolve(id: Identifier): TypeSchema | undefined
  Resolves by fully qualified identifier (identifier object with package, version, name, url, kind)

resolveByUrl(pkgName: PackageName, url: CanonicalUrl): TypeSchema | undefined
  Resolves by canonical URL within a specific package
```

---

## Hierarchy Methods

Work with type inheritance and base type relationships:

```typescript
resourceChildren(id: Identifier): Identifier[]
  Returns all resource types that specialize the given resource

tryHierarchy(schema: TypeSchema): TypeSchema[] | undefined
  Builds hierarchy chain from schema to base types (safe version, returns undefined if incomplete)

hierarchy(schema: TypeSchema): TypeSchema[]
  Builds hierarchy chain from schema to base types (throws if incomplete)
```

---

## Specialization Methods

Handle type specialization and profile constraints:

```typescript
findLastSpecialization(schema: TypeSchema): TypeSchema
  Finds the most specialized version of a schema

findLastSpecializationByIdentifier(id: Identifier): Identifier
  Finds the identifier of the most specialized version
```

---

## Profile Methods

Work with FHIR profiles and their constraints:

```typescript
flatProfile(schema: ProfileTypeSchema): ProfileTypeSchema
  Flattens a profile by resolving all differential constraints into a complete snapshot

isWithMetaField(profile: ProfileTypeSchema): boolean
  Checks if a profile includes the meta field
```

---

## Debug Utilities

Export type hierarchy for debugging:

```typescript
exportTree(filename: string): Promise<void>
  Exports the complete type hierarchy tree to a file
```

---

## Core Utilities Examples

### Collection Methods

```typescript
const complexTypes = tsIndex.collectComplexTypes();
const resources = tsIndex.collectResources();
const logicalModels = tsIndex.collectLogicalModels();
const profiles = tsIndex.collectProfiles();
```

### Resolution Methods

```typescript
const patientIdentifier = { package: "hl7.fhir.r4.core", version: "4.0.1", name: "Patient", url: "http://hl7.org/fhir/Patient", kind: "resource" };
const schema = tsIndex.resolve(patientIdentifier);

const schema2 = tsIndex.resolveByUrl("hl7.fhir.r4.core", "http://hl7.org/fhir/Patient");
```

### Hierarchy Methods

```typescript
const children = tsIndex.resourceChildren(patientIdentifier);
const hierarchy = tsIndex.hierarchy(patientSchema);
const safeHierarchy = tsIndex.tryHierarchy(patientSchema);
```

### Specialization Methods

```typescript
const specialized = tsIndex.findLastSpecialization(patientSchema);
const specializedId = tsIndex.findLastSpecializationByIdentifier(patientIdentifier);
```

### Profile Methods

```typescript
const flatProfile = tsIndex.flatProfile(useCorePatientProfile);
const hasMeta = tsIndex.isWithMetaField(profile);
```

### Debug Utilities

```typescript
await tsIndex.exportTree("./debug/type-tree.txt");
```

---

## Helper Utilities

Utility functions for processing schemas:

```typescript
import { groupByPackages, sortAsDeclarationSequence } from "@root/typeschema/utils";

const byPackage = groupByPackages(tsIndex.collectResources());
const sorted = sortAsDeclarationSequence(byPackage["hl7.fhir.r4.core"]);
```

---

## Resources

- **TypeSchemaIndex & Helper Utilities Implementation**: `src/typeschema/utils.ts`
- **TypeSchema Type Definition**: `src/typeschema/types.ts`
- **Writer Generator Guide**: [writer-generator.md](./writer-generator.md)
- **Mustache Generator Guide**: [mustache-generator.md](./mustache-generator.md)
- **FHIR Specification**: [https://www.hl7.org/fhir/](https://www.hl7.org/fhir/)
