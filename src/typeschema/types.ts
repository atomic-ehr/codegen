/**
 * A code generation friendly representation of FHIR StructureDefinition and
 * FHIR Schema designed to simplify SDK resource classes/types generation.
 */

import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type * as FS from "@atomic-ehr/fhirschema";

export type Name = string & { readonly __brand: unique symbol };
export type CanonicalUrl = string & { readonly __brand: unique symbol };

export interface PackageMeta {
    name: string;
    version: string;
}

export const packageMetaToFhir = (packageMeta: PackageMeta) => `${packageMeta.name}#${packageMeta.version}`;
export const packageMetaToNpm = (packageMeta: PackageMeta) => `${packageMeta.name}@${packageMeta.version}`;

export type RichFHIRSchema = Omit<FS.FHIRSchema, "package_meta" | "base" | "name" | "url"> & {
    package_meta: PackageMeta;
    name: Name;
    url: CanonicalUrl;
    base: CanonicalUrl;
};

export const enrichFHIRSchema = (schema: FS.FHIRSchema, packageMeta?: PackageMeta): RichFHIRSchema => {
    if (!packageMeta) {
        packageMeta = { name: "undefined", version: "undefined" };
    }
    return {
        ...schema,
        package_meta: schema.package_meta || packageMeta,
        name: schema.name as Name,
        url: schema.url as CanonicalUrl,
        base: schema.base as CanonicalUrl,
    };
};

type IdentifierBase = {
    name: Name;
    url: CanonicalUrl;
    package: string;
    version: string;
};

type PrimitiveIdentifier = { kind: "primitive-type" } & IdentifierBase;
type ComplexTypeIdentifier = { kind: "complex-type" } & IdentifierBase;
type ResourceIdentifier = { kind: "resource" } & IdentifierBase;
export type ValueSetIdentifier = { kind: "value-set" } & IdentifierBase;
export type NestedIdentifier = { kind: "nested" } & IdentifierBase;
export type BindingIdentifier = { kind: "binding" } & IdentifierBase;
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
    | RegularTypeSchema
    | PrimitiveTypeSchema
    | ValueSetTypeSchema
    | BindingTypeSchema
    | ProfileTypeSchema;

interface PrimitiveTypeSchema {
    identifier: PrimitiveIdentifier;
    description?: string;
    base: Identifier;
    dependencies?: Identifier[];
}

export interface NestedType {
    identifier: NestedIdentifier;
    base: Identifier;
    fields: Record<string, Field>;
}

export interface ProfileTypeSchema {
    identifier: ProfileIdentifier;
    base: Identifier;
    description?: string;
    fields?: Record<string, Field>;
    constraints?: Record<string, ProfileConstraint>;
    extensions?: ProfileExtension[];
    validation?: ValidationRule[];
    dependencies?: Identifier[];
    metadata?: ProfileMetadata;
    nested?: NestedType[];
}

export interface ProfileConstraint {
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

export interface ProfileExtension {
    path: string;
    profile: string | string[];
    min?: number;
    max?: string;
    mustSupport?: boolean;
}

export interface ValidationRule {
    path: string;
    key: string;
    severity: "error" | "warning" | "information";
    human: string;
    expression?: string;
}

export interface ProfileMetadata {
    publisher?: string;
    contact?: any[];
    copyright?: string;
    purpose?: string;
    experimental?: boolean;
    date?: string;
    jurisdiction?: any[];
    package?: string;
}

interface RegularTypeSchema {
    // TODO: restrict to ResourceIdentifier | ComplexTypeIdentifier | LogicalIdentifier
    identifier: Identifier;
    base?: Identifier;
    description?: string;
    fields?: { [k: string]: Field };
    nested?: NestedType[];
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

export interface ChoiceFieldDeclaration {
    choices: string[];
    required?: boolean;
    excluded?: boolean;
    array?: boolean;
    min?: number;
    max?: number;
}

interface ChoiceFieldInstance {
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

export type Concept = {
    code: string;
    display?: string;
    system?: string;
};

export interface ValueSetTypeSchema {
    identifier: ValueSetIdentifier;
    description?: string;
    concept?: Concept[];
    compose?: ValueSetCompose;
}

export interface BindingTypeSchema {
    identifier: BindingIdentifier;
    description?: string;
    type?: Identifier;
    strength?: string;
    enum?: string[];
    valueset?: ValueSetIdentifier;
    dependencies?: Identifier[];
}

export type Field = RegularField | ChoiceFieldDeclaration | ChoiceFieldInstance;

export interface TypeschemaGeneratorOptions {
    verbose?: boolean;
    logger?: import("../utils/codegen-logger").CodegenLogger;
    treeshake?: string[];
    manager?: ReturnType<typeof CanonicalManager> | null;
}

export function isBindingSchema(schema: TypeSchema): schema is BindingTypeSchema {
    return schema.identifier.kind === "binding";
}

export type TypeschemaParserOptions = {
    format?: "auto" | "ndjson" | "json";
    validate?: boolean;
    strict?: boolean;
};

///////////////////////////////////////////////////////////
// ValueSet
///////////////////////////////////////////////////////////

export type ValueSet = {
    resourceType: "ValueSet";
    id: string;
    name?: string;
    url?: string;
    description?: string;
    compose?: ValueSetCompose;
    expansion?: {
        contains: Concept[];
    };
    experimental?: boolean;
    immutable?: boolean;
    extension?: any[];
    status?: string;
    identifier?: any[];
    title?: string;
    publisher?: string;
    version?: string;
    meta?: any;
    date?: string;
    contact?: any;
};

type ValueSetCompose = {
    include: {
        concept?: Concept[];
        system?: string;
        filter?: {}[];
    }[];
};

export type CodeSystem = {
    concept: CodeSystemConcept[];
};

export type CodeSystemConcept = {
    concept: CodeSystemConcept[];
    code: string;
    display: string;
};

export type RichValueSet = Omit<ValueSet, "name" | "url"> & {
    package_meta: PackageMeta;
    name?: Name;
    url?: CanonicalUrl;
};
