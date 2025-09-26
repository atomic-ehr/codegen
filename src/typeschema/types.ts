/**
 * A code generation friendly representation of FHIR StructureDefinition and
 * FHIR Schema designed to simplify SDK resource classes/types generation.
 */

import type * as FS from "@atomic-ehr/fhirschema";

export interface PackageInfo {
  name: string;
  version: string;
}

export type RichFHIRSchema = Omit<FS.FHIRSchema, "package_meta"> & {
  package_meta: PackageInfo;
};

export const enrichFHIRSchema = (schema: FS.FHIRSchema): RichFHIRSchema => {
  return {
    ...schema,
    package_meta: {
      name: schema.package_name || schema.package_meta?.name || "undefined",
      version:
        schema.package_version || schema.package_meta?.version || "undefined",
    },
  };
};

type IdentifierBase = {
  name: string;
  package: string;
  version: string;
  url: string;
};

type PrimitiveIdentifier = { kind: "primitive-type" } & IdentifierBase;
type ComplexTypeIdentifier = { kind: "complex-type" } & IdentifierBase;
type ResourceIdentifier = { kind: "resource" } & IdentifierBase;
type ValueSetIdentifier = { kind: "value-set" } & IdentifierBase;
type NestedIdentifier = { kind: "nested" } & IdentifierBase;
type BindingIdentifier = { kind: "binding" } & IdentifierBase;
type ProfileIdentifier = { kind: "profile" } & IdentifierBase;
type LogicalIdentifier = { kind: "logical" } & IdentifierBase;

export type Identifier =
  | PrimitiveIdentifier
  | ComplexTypeIdentifier
  | ResourceIdentifier
  | NestedIdentifier
  | BindingIdentifier
  | ValueSetIdentifier
  | ProfileIdentifier
  | LogicalIdentifier;

export type TypeSchema =
  | TypeSchemaForPrimitiveType
  | TypeSchemaForResourceComplexTypeLogical
  | TypeSchemaForValueSet
  | TypeSchemaForBinding
  | TypeSchemaForProfile;

interface TypeSchemaForPrimitiveType {
  identifier: PrimitiveIdentifier;
  description?: string;
  base: Identifier;
  dependencies?: Identifier[];
}

interface TypeSchemaForProfile {
  identifier: ProfileIdentifier;
  base: Identifier;
  description?: string;
  fields?: Record<string, TypeSchemaField>;
  constraints?: Record<string, ProfileConstraint>;
  extensions?: ProfileExtension[];
  validation?: ValidationRule[];
  dependencies?: Identifier[];
  metadata?: ProfileMetadata;
  nested?: any[];
}

interface ProfileConstraint {
  min?: number;
  max?: string;
  mustSupport?: boolean;
  fixedValue?: any;
  patternValue?: any;
  binding?: {
    strength: "required" | "extensible" | "preferred" | "example";
    valueSet: string;
  };
  types?: Array<{
    code: string;
    profile?: string[];
    targetProfile?: string[];
  }>;
  slicing?: {
    discriminator: any[];
    rules: string;
    ordered?: boolean;
  };
}

interface ProfileExtension {
  path: string;
  profile: string | string[];
  min?: number;
  max?: string;
  mustSupport?: boolean;
}

interface ValidationRule {
  path: string;
  key: string;
  severity: "error" | "warning" | "information";
  human: string;
  expression?: string;
}

interface ProfileMetadata {
  publisher?: string;
  contact?: any[];
  copyright?: string;
  purpose?: string;
  experimental?: boolean;
  date?: string;
  jurisdiction?: any[];
  package?: string;
}

export interface TypeSchemaForResourceComplexTypeLogical {
  identifier: ResourceIdentifier | ComplexTypeIdentifier | LogicalIdentifier;
  base?: Identifier;
  description?: string;
  fields?: {
    [k: string]:
      | RegularField
      | PolymorphicValueXFieldDeclaration
      | PolymorphicValueXFieldInstance;
  };
  nested?: {
    identifier: NestedIdentifier;
    base: Identifier;
    fields?: {
      [k: string]:
        | RegularField
        | PolymorphicValueXFieldDeclaration
        | PolymorphicValueXFieldInstance;
    };
  }[];
  dependencies?: Identifier[];
}

export interface RegularField {
  type: Identifier;
  reference?: Identifier[];
  required?: boolean;
  excluded?: boolean;
  array?: boolean;
  binding?: BindingIdentifier;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface PolymorphicValueXFieldDeclaration {
  choices: string[];
  required?: boolean;
  excluded?: boolean;
  array?: boolean;
  min?: number;
  max?: number;
}

export interface PolymorphicValueXFieldInstance {
  choiceOf: string;
  type: Identifier;
  required?: boolean;
  excluded?: boolean;
  array?: boolean;
  reference?: Identifier[];
  binding?: BindingIdentifier;
  enum?: string[];
  min?: number;
  max?: number;
}

export interface TypeSchemaForValueSet {
  identifier: ValueSetIdentifier;
  description?: string;
  concept?: {
    code: string;
    display?: string;
    system?: string;
  }[];
  compose?: {
    [k: string]: unknown;
  };
}
export interface TypeSchemaForBinding {
  identifier: BindingIdentifier;
  description?: string;
  type?: Identifier;
  strength?: string;
  enum?: string[];
  valueset?: ValueSetIdentifier;
  dependencies?: Identifier[];
}

export type TypeSchemaField =
  | RegularField
  | PolymorphicValueXFieldDeclaration
  | PolymorphicValueXFieldInstance;

export interface TypeschemaGeneratorOptions {
  verbose?: boolean;
  logger?: import("../utils/codegen-logger").CodegenLogger;
  treeshake?: string[];
  manager?: ReturnType<typeof import("@atomic-ehr/fhir-canonical-manager").CanonicalManager> | null;
}

export function isBindingSchema(
  schema: TypeSchema,
): schema is TypeSchemaForBinding {
  return schema.identifier.kind === "binding";
}
