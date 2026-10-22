# TypeSchemaIndex Guide

The `TypeSchemaIndex` is a comprehensive data structure containing all transformed FHIR definitions in TypeSchema format. It serves as the primary input to code generators and provides utilities for navigating type hierarchies, resolving references, and working with profiles and specializations.

<!-- markdown-toc start - Don't edit this section. Run M-x markdown-toc-refresh-toc -->
**Table of Contents**

- [TypeSchemaIndex Guide](#typeschemaindex-guide)
  - [Overview](#overview)
  - [Collection Methods](#collection-methods)
  - [Resolution Methods](#resolution-methods)
  - [Nested Type Methods](#nested-type-methods)
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

Translation returns a flat collection of `TypeSchema` nodes: resources, complex types, logical models, profiles, nested types, bindings and value sets. A nested type (a FHIR backbone element such as `Observation.component`) is a node of its own: `kind: "nested"` when a resource, complex type or logical model declares it, `kind: "profile-nested"` for a profile's own copy. It names the schema it is declared in (`declaredIn`) and its element `path`, says whether it comes from a specialization or a constraint (`derivation`), and lists its own direct `dependencies`. A schema with a field of the nested type lists it among its dependencies: the declaring schema for a top-level element such as `Questionnaire#item`, the enclosing nested type for a deeper one such as `Questionnaire#item.enableWhen`. `index.nestedTypesOf(declaredIn)` returns all of them.

> **Before nested types became nodes** (up to 0.0.23), a root schema carried its nested types in a `nested` array and its `dependencies` merged the dependencies of its nested types. To get that view from current output, group `kind: "nested"` and `kind: "profile-nested"` nodes by `declaredIn`, or call `index.nestedTypesOf(schema)`, `index.profileNestedTypesOf(profile)` and `index.moduleDependencies(schema)`.

```typescript
import { generateTypeSchemas, mkTypeSchemaIndex, registerFromPackageMetas } from "@atomic-ehr/codegen";

const register = await registerFromPackageMetas([{ name: "hl7.fhir.r4.core", version: "4.0.1" }], {});
const { schemas } = await generateTypeSchemas(register);
const index = mkTypeSchemaIndex(schemas, { register });
const observation = index.collectResources().find((schema) => schema.identifier.name === "Observation")!;
index.resolve(observation.identifier);          // One resolver for every schema kind, nested types included
index.nestedTypesOf(observation.identifier);    // Observation#component, Observation#referenceRange
index.reachableFrom([observation.identifier]);  // Everything reachable through direct dependencies
index.moduleDependencies(observation);         // Dependencies of the generated module: the schema and its nested types
```

Writers emit the nested types returned by `nestedTypesOf` into the module of the schema they are declared in.

A profile that constrains a nested type gets its own `profile-nested` node under the profile's url, such as `MyObservationProfile#component`, based on `Observation#component`. Profile fields point at the node of the nearest profile that constrains that path (the profile itself or an ancestor), or at the specialization's node when none does. The profile's node records that specialization node as its `specialization`; `specializationOf` returns it, so generated code names and imports the structural type while constraint lookups read the profile's node. Fields of a profile's nested node hold values resolved from the FHIRSchema genealogy, not only the differential.

Tree shaking keeps the nested nodes reachable from the kept schemas and recomputes dependencies after field selection, so dropping a field also drops nested types only that field used. The IR report lists skipped root schemas only; a nested type goes with the schema it is declared in.

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
  Returns all complex types (datatypes)

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
  Resolves by fully qualified identifier (identifier object with package, version, name, url, kind), nested types included

resolveByUrl(pkgName: PackageName, url: CanonicalUrl): TypeSchema | undefined
  Resolves by canonical URL as seen from a package. `pkgName` is a bare package name;
  resolution goes through the register's resolution tree, so the URL may be declared by
  that package or by any of its dependencies. If the name matches nothing, it warns and
  falls back to an arbitrary package containing the URL rather than returning undefined.

resolveRoot(pkgKey: string, url: CanonicalUrl): TypeSchema
  Strict variant used for tree-shake roots. `pkgKey` is "name" or "name#version"; the
  version is asserted against the loaded packages. There is no cross-package fallback —
  a URL the named package neither owns nor reaches through its dependencies throws.
```

---

## Nested Type Methods

Work with nested types and the schemas that declare them:

```typescript
nestedTypesOf(declaredIn: Identifier): NestedTypeSchema[]
  Returns the nested types a resource, complex type or logical model declares, sorted by url

profileNestedTypesOf(profile: ProfileIdentifier): ProfileNestedTypeSchema[]
  Returns a profile's own nested types, sorted by url

moduleDependencies(schema: TypeSchema): Identifier[]
  Returns the dependencies of a schema together with those of its nested types

specializationOf(id: Identifier): Identifier
  Returns the specialization of a profile's nested node (the specialization's nested type it constrains), any other id unchanged; generated code names and imports the specialization

reachableFrom(roots: Identifier[]): TypeSchema[]
  Returns every schema reachable from the roots through direct dependencies, up to bindings (a binding's value set is not followed); throws when a dependency is not in the index
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
const patientIdentifier = { package: "hl7.fhir.r4.core", version: "4.0.1", name: "Patient", url: "http://hl7.org/fhir/StructureDefinition/Patient", kind: "resource" };
const schema = tsIndex.resolve(patientIdentifier);

const schema2 = tsIndex.resolveByUrl("hl7.fhir.r4.core", "http://hl7.org/fhir/StructureDefinition/Patient");
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
