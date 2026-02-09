/**
 * A code generation friendly representation of FHIR StructureDefinition and
 * FHIR Schema designed to simplify SDK resource classes/types generation.
 */

import { createHash } from "node:crypto";
import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type * as FS from "@atomic-ehr/fhirschema";
import type { StructureDefinition, ValueSet, ValueSetCompose } from "@root/fhir-types/hl7-fhir-r4-core";

export type Name = string & { readonly __brand: unique symbol };
export type CanonicalUrl = string & { readonly __brand: unique symbol };

export const extractNameFromCanonical = (canonical: CanonicalUrl, dropFragment = true) => {
    let localName = canonical.split("/").pop();
    if (!localName) return undefined;
    if (dropFragment && localName.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (!localName) return undefined;
    if (/^\d/.test(localName)) {
        localName = `number_${localName}`;
    }
    return localName;
};

export type PkgName = string;
export type PkgVersion = string;

export interface PackageMeta {
    name: PkgName;
    version: PkgVersion;
}

export const packageMeta = (schema: TypeSchema): PackageMeta => {
    return {
        name: schema.identifier.package,
        version: schema.identifier.version,
    };
};
export const packageMetaToFhir = (packageMeta: PackageMeta) => `${packageMeta.name}#${packageMeta.version}`;
export const packageMetaToNpm = (packageMeta: PackageMeta) => `${packageMeta.name}@${packageMeta.version}`;
export const fhirToPackageMeta = (fhir: string) => {
    const [name, version] = fhir.split("#");
    if (!name) throw new Error(`Invalid FHIR package meta: ${fhir}`);
    return { name, version: version ?? "latest" };
};
export const npmToPackageMeta = (fhir: string) => {
    const [name, version] = fhir.split("@");
    if (!name) throw new Error(`Invalid FHIR package meta: ${fhir}`);
    return { name, version: version ?? "latest" };
};

export const hashSchema = (schema: TypeSchema): string => {
    const json = JSON.stringify(schema);
    return createHash("sha256").update(json).digest("hex").slice(0, 16);
};

export type RichStructureDefinition = Omit<StructureDefinition, "url"> & {
    package_name: PkgName;
    package_version: PkgVersion;
    url: CanonicalUrl;
};

export type RichFHIRSchema = Omit<FS.FHIRSchema, "package_meta" | "base" | "name" | "url"> & {
    package_meta: PackageMeta;
    name: Name;
    url: CanonicalUrl;
    base: CanonicalUrl;
};

export const enrichFHIRSchema = (schema: FS.FHIRSchema, packageMeta?: PackageMeta): RichFHIRSchema => {
    // FIXME: required params
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
    package: PkgName;
    version: PkgVersion;
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

export const isResourceIdentifier = (id: Identifier | undefined): id is ResourceIdentifier => {
    return id?.kind === "resource";
};

export const isLogicalIdentifier = (id: Identifier | undefined): id is LogicalIdentifier => {
    return id?.kind === "logical";
};

export const isComplexTypeIdentifier = (id: Identifier | undefined): id is ComplexTypeIdentifier => {
    return id?.kind === "complex-type";
};

export const isPrimitiveIdentifier = (id: Identifier | undefined): id is PrimitiveIdentifier => {
    return id?.kind === "primitive-type";
};

export const isNestedIdentifier = (id: Identifier | undefined): id is NestedIdentifier => {
    return id?.kind === "nested";
};

export const isProfileIdentifier = (id: Identifier | undefined): id is ProfileIdentifier => {
    return id?.kind === "profile";
};

export type TypeSchema =
    | RegularTypeSchema
    | PrimitiveTypeSchema
    | ValueSetTypeSchema
    | BindingTypeSchema
    | ProfileTypeSchema;

export const isSpecializationTypeSchema = (schema: TypeSchema | undefined): schema is RegularTypeSchema => {
    return (
        schema?.identifier.kind === "resource" ||
        schema?.identifier.kind === "complex-type" ||
        schema?.identifier.kind === "logical"
    );
};

export const isComplexTypeTypeSchema = (schema: TypeSchema | undefined): schema is RegularTypeSchema => {
    return schema?.identifier.kind === "complex-type";
};

export const isResourceTypeSchema = (schema: TypeSchema | undefined): schema is RegularTypeSchema => {
    return schema?.identifier.kind === "resource";
};

export const isPrimitiveTypeSchema = (schema: TypeSchema | undefined): schema is PrimitiveTypeSchema => {
    return schema?.identifier.kind === "primitive-type";
};

export const isLogicalTypeSchema = (schema: TypeSchema | undefined): schema is RegularTypeSchema => {
    return schema?.identifier.kind === "logical";
};

export const isProfileTypeSchema = (schema: TypeSchema | undefined): schema is ProfileTypeSchema => {
    return schema?.identifier.kind === "profile";
};

export function isBindingSchema(schema: TypeSchema | undefined): schema is BindingTypeSchema {
    return schema?.identifier.kind === "binding";
}

export function isValueSetTypeSchema(schema: TypeSchema | undefined): schema is ValueSetTypeSchema {
    return schema?.identifier.kind === "value-set";
}

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

export interface FieldSlicing {
    discriminator?: Array<{ type?: string; path: string }>;
    rules?: string;
    ordered?: boolean;
    slices?: Record<string, FieldSlice>;
}

export interface FieldSlice {
    min?: number;
    max?: number;
    match?: Record<string, unknown>;
    required?: string[];
    excluded?: string[];
}

export interface ExtensionSubField {
    name: string;
    url: string;
    valueType?: Identifier;
    min?: number;
    max?: string;
}

export interface ProfileExtension {
    name: string;
    path: string;
    url?: string;
    min?: number;
    max?: string;
    mustSupport?: boolean;
    valueTypes?: Identifier[];
    subExtensions?: ExtensionSubField[];
    isComplex?: boolean;
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

export interface RegularTypeSchema {
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
    enum?: EnumDefinition;
    min?: number;
    max?: number;
    slicing?: FieldSlicing;
}

export interface ChoiceFieldDeclaration {
    choices: string[];
    required?: boolean;
    excluded?: boolean;
    array?: boolean;
    min?: number;
    max?: number;
}

export interface ChoiceFieldInstance {
    choiceOf: string;
    type: Identifier;
    required?: boolean;
    excluded?: boolean;
    array?: boolean;
    reference?: Identifier[];
    binding?: BindingIdentifier;
    enum?: EnumDefinition;
    min?: number;
    max?: number;
    slicing?: FieldSlicing;
}

export type Concept = {
    code: string;
    display?: string;
    system?: string;
};

export type EnumDefinition = {
    values: string[];
    isOpen: boolean;
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
    enum?: EnumDefinition;
    valueset?: ValueSetIdentifier;
    dependencies?: Identifier[];
}

export type Field = RegularField | ChoiceFieldDeclaration | ChoiceFieldInstance;

export const isNotChoiceDeclarationField = (field: Field | undefined): field is RegularField | ChoiceFieldInstance => {
    if (!field) return false;
    return (field as ChoiceFieldDeclaration).choices === undefined;
};

export const isChoiceDeclarationField = (field: Field | undefined): field is ChoiceFieldDeclaration => {
    if (!field) return false;
    return (field as ChoiceFieldDeclaration).choices !== undefined;
};

export const isChoiceInstanceField = (field: Field | undefined): field is ChoiceFieldInstance => {
    if (!field) return false;
    return (field as ChoiceFieldInstance).choiceOf !== undefined;
};

///////////////////////////////////////////////////////////
// ValueSet
///////////////////////////////////////////////////////////

export type RichValueSet = Omit<ValueSet, "name" | "url"> & {
    package_meta: PackageMeta;
    name: Name;
    url: CanonicalUrl;
};

export const enrichValueSet = (vs: ValueSet, packageMeta: PackageMeta): RichValueSet => {
    if (!vs.url) throw new Error("ValueSet must have a URL");
    if (!vs.name) throw new Error("ValueSet must have a name");
    return {
        ...vs,
        package_meta: (vs as RichValueSet).package_meta || packageMeta,
        name: vs.name as Name,
        url: vs.url as CanonicalUrl,
    };
};

///////////////////////////////////////////////////////////

export interface TypeschemaGeneratorOptions {
    logger?: import("../utils/codegen-logger").CodegenLogger;
    treeshake?: string[];
    manager: ReturnType<typeof CanonicalManager>;
    /** Custom FHIR package registry URL */
    registry?: string;
}
