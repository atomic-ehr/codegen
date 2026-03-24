/**
 * A code generation friendly representation of FHIR StructureDefinition and
 * FHIR Schema designed to simplify SDK resource classes/types generation.
 */

import { createHash } from "node:crypto";
import type { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import type * as FS from "@atomic-ehr/fhirschema";
import type { StructureDefinition, ValueSet, ValueSetCompose } from "@root/fhir-types/hl7-fhir-r4-core";
import type { CodegenLog } from "@root/utils/log";

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

export type ValueConstraint = {
    kind: "pattern" | "fixed";
    type: string;
    value: FS.FHIRValue;
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

export type FHIRSchemaKind = "primitive-type" | "complex-type" | "resource" | "logical";

type RichFHIRSchemaBase = Omit<FS.FHIRSchema, "package_meta" | "base" | "name" | "url" | "derivation" | "kind"> & {
    package_meta: PackageMeta;
    name: Name;
    url: CanonicalUrl;
    base: CanonicalUrl;
    kind: FHIRSchemaKind;
};

export type RichProfileFHIRSchema = RichFHIRSchemaBase & { derivation: "constraint" };

export type RichPrimitiveFHIRSchema = RichFHIRSchemaBase & { derivation: "specialization"; kind: "primitive-type" };
export type RichComplexTypeFHIRSchema = RichFHIRSchemaBase & { derivation: "specialization"; kind: "complex-type" };
export type RichResourceFHIRSchema = RichFHIRSchemaBase & { derivation: "specialization"; kind: "resource" };
export type RichLogicalFHIRSchema = RichFHIRSchemaBase & { derivation: "specialization"; kind: "logical" };
export type RichSpecializationFHIRSchema =
    | RichPrimitiveFHIRSchema
    | RichComplexTypeFHIRSchema
    | RichResourceFHIRSchema
    | RichLogicalFHIRSchema;

export type RichFHIRSchema = RichProfileFHIRSchema | RichSpecializationFHIRSchema;

export const enrichFHIRSchema = (schema: FS.FHIRSchema, packageMeta: PackageMeta): RichFHIRSchema => {
    const derivation = schema.derivation === "constraint" ? ("constraint" as const) : ("specialization" as const);
    return {
        ...schema,
        derivation,
        kind: schema.kind as FHIRSchemaKind,
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

export type PrimitiveIdentifier = { kind: "primitive-type" } & IdentifierBase;
export type ComplexTypeIdentifier = { kind: "complex-type" } & IdentifierBase;
export type ResourceIdentifier = { kind: "resource" } & IdentifierBase;
export type ValueSetIdentifier = { kind: "value-set" } & IdentifierBase;
export type NestedIdentifier = { kind: "nested" } & IdentifierBase;
export type BindingIdentifier = { kind: "binding" } & IdentifierBase;
export type ProfileIdentifier = { kind: "profile" } & IdentifierBase;
export type LogicalIdentifier = { kind: "logical" } & IdentifierBase;

export type Identifier =
    | PrimitiveIdentifier
    | ComplexTypeIdentifier
    | ResourceIdentifier
    | BindingIdentifier
    | ValueSetIdentifier
    | ProfileIdentifier
    | LogicalIdentifier;

export type TypeIdentifier = Identifier | NestedIdentifier;

export const isResourceIdentifier = (id: TypeIdentifier | undefined): id is ResourceIdentifier => {
    return id?.kind === "resource";
};

export const isLogicalIdentifier = (id: TypeIdentifier | undefined): id is LogicalIdentifier => {
    return id?.kind === "logical";
};

export const isComplexTypeIdentifier = (id: TypeIdentifier | undefined): id is ComplexTypeIdentifier => {
    return id?.kind === "complex-type";
};

export const isPrimitiveIdentifier = (id: TypeIdentifier | undefined): id is PrimitiveIdentifier => {
    return id?.kind === "primitive-type";
};

export const isNestedIdentifier = (id: TypeIdentifier | undefined): id is NestedIdentifier => {
    return id?.kind === "nested";
};

export const isProfileIdentifier = (id: TypeIdentifier | undefined): id is ProfileIdentifier => {
    return id?.kind === "profile";
};

export const isSpecializationIdentifier = (
    id: TypeIdentifier | undefined,
): id is ResourceIdentifier | ComplexTypeIdentifier | LogicalIdentifier => {
    return isResourceIdentifier(id) || isComplexTypeIdentifier(id) || isLogicalIdentifier(id);
};

export const concatIdentifiers = <T extends TypeIdentifier = TypeIdentifier>(
    ...sources: (T[] | undefined)[]
): T[] | undefined => {
    const entries = sources
        .filter((s): s is T[] => s !== undefined)
        .flatMap((s) => s.map((id): [string, T] => [id.url, id]));
    if (entries.length === 0) return undefined;
    const deduped = Object.values(Object.fromEntries(entries) as Record<string, T>);
    return deduped.sort((a, b) => a.url.localeCompare(b.url));
};

export type TypeSchema =
    | SpecializationTypeSchema
    | PrimitiveTypeSchema
    | ValueSetTypeSchema
    | BindingTypeSchema
    | ProfileTypeSchema;

type TypeSchemaGuardInput = TypeSchema | NestedTypeSchema | undefined;

export const isNestedTypeSchema = (schema: TypeSchemaGuardInput): schema is NestedTypeSchema => {
    return schema !== undefined && isNestedIdentifier(schema.identifier);
};

export const isSpecializationTypeSchema = (schema: TypeSchemaGuardInput): schema is SpecializationTypeSchema => {
    return (
        schema?.identifier.kind === "resource" ||
        schema?.identifier.kind === "complex-type" ||
        schema?.identifier.kind === "logical"
    );
};

export const isComplexTypeTypeSchema = (schema: TypeSchemaGuardInput): schema is ComplexTypeTypeSchema => {
    return schema?.identifier.kind === "complex-type";
};

export const isResourceTypeSchema = (schema: TypeSchemaGuardInput): schema is ResourceTypeSchema => {
    return schema?.identifier.kind === "resource";
};

export const isPrimitiveTypeSchema = (schema: TypeSchemaGuardInput): schema is PrimitiveTypeSchema => {
    return schema?.identifier.kind === "primitive-type";
};

export const isLogicalTypeSchema = (schema: TypeSchemaGuardInput): schema is LogicalTypeSchema => {
    return schema?.identifier.kind === "logical";
};

export const isProfileTypeSchema = (schema: TypeSchemaGuardInput): schema is ProfileTypeSchema => {
    return schema?.identifier.kind === "profile";
};

export const isBindingSchema = (schema: TypeSchemaGuardInput): schema is BindingTypeSchema => {
    return schema?.identifier.kind === "binding";
};

export const isValueSetTypeSchema = (schema: TypeSchemaGuardInput): schema is ValueSetTypeSchema => {
    return schema?.identifier.kind === "value-set";
};

interface PrimitiveTypeSchema {
    identifier: PrimitiveIdentifier;
    description?: string;
    base: TypeIdentifier;
    dependencies?: TypeIdentifier[];
}

export interface NestedTypeSchema {
    identifier: NestedIdentifier;
    base: TypeIdentifier;
    fields: Record<string, Field>;
}

export interface ProfileTypeSchema {
    identifier: ProfileIdentifier;
    base: TypeIdentifier;
    description?: string;
    fields?: Record<string, Field>;
    extensions?: ProfileExtension[];
    dependencies?: TypeIdentifier[];
    nested?: NestedTypeSchema[];
}

export interface FieldSlicing {
    discriminator?: FS.FHIRSchemaDiscriminator[];
    rules?: string;
    ordered?: boolean;
    slices?: Record<string, FieldSlice>;
}

export type ConstrainedChoiceInfo = {
    choiceBase: string;
    variant: string;
    variantType: TypeIdentifier;
    allChoiceNames: string[];
};

export interface FieldSlice {
    min?: number;
    max?: number;
    match?: Record<string, unknown>;
    required?: string[];
    excluded?: string[];
    elements?: string[];
}

export interface ExtensionSubField {
    name: string;
    url: string;
    valueFieldType?: TypeIdentifier;
    min?: number;
    max?: string;
}

export interface ProfileExtension {
    profile?: ProfileIdentifier;
    name: string;
    path: string;
    url?: string;
    min?: number;
    max?: string;
    mustSupport?: boolean;
    valueFieldTypes?: TypeIdentifier[];
    subExtensions?: ExtensionSubField[];
    isComplex?: boolean;
}

export const extractExtensionDeps = (ext: ProfileExtension): TypeIdentifier[] => [
    ...(ext.valueFieldTypes ?? []),
    ...(ext.profile ? [ext.profile] : []),
    ...(ext.subExtensions?.flatMap((sub) => (sub.valueFieldType ? [sub.valueFieldType] : [])) ?? []),
];

type SpecializationTypeSchemaBody = {
    base?: TypeIdentifier;
    description?: string;
    fields?: { [k: string]: Field };
    nested?: NestedTypeSchema[];
    dependencies?: Identifier[];
    /** Transitive children grouped by kind (e.g. Resource → { resources: [DomainResource, Patient, …] }) */
    typeFamily?: TypeFamily;
};

export type TypeFamily = {
    resources?: ResourceIdentifier[];
    complexTypes?: ComplexTypeIdentifier[];
};

export type ResourceTypeSchema = { identifier: ResourceIdentifier } & SpecializationTypeSchemaBody;
export type ComplexTypeTypeSchema = { identifier: ComplexTypeIdentifier } & SpecializationTypeSchemaBody;
export type LogicalTypeSchema = { identifier: LogicalIdentifier } & SpecializationTypeSchemaBody;

export type SpecializationTypeSchema = ResourceTypeSchema | ComplexTypeTypeSchema | LogicalTypeSchema;

export interface RegularField {
    type: TypeIdentifier;
    reference?: TypeIdentifier[];
    required?: boolean;
    excluded?: boolean;
    array?: boolean;
    binding?: BindingIdentifier;
    enum?: EnumDefinition;
    min?: number;
    max?: number;
    slicing?: FieldSlicing;
    valueConstraint?: ValueConstraint;
    mustSupport?: boolean;
}

export interface ChoiceFieldDeclaration {
    choices: string[];
    prohibited?: string[];
    required?: boolean;
    excluded?: boolean;
    array?: boolean;
    min?: number;
    max?: number;
}

export interface ChoiceFieldInstance {
    choiceOf: string;
    type: TypeIdentifier;
    required?: boolean;
    excluded?: boolean;
    array?: boolean;
    reference?: TypeIdentifier[];
    binding?: BindingIdentifier;
    enum?: EnumDefinition;
    min?: number;
    max?: number;
    slicing?: FieldSlicing;
    valueConstraint?: ValueConstraint;
    mustSupport?: boolean;
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
    strength?: string;
    enum?: EnumDefinition;
    valueset?: ValueSetIdentifier;
    dependencies?: TypeIdentifier[];
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
    logger?: CodegenLog;
    treeshake?: string[];
    manager: ReturnType<typeof CanonicalManager>;
    /** Custom FHIR package registry URL */
    registry?: string;
}
