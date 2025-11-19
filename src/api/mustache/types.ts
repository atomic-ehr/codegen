import type { IsPrefixed } from "@mustache/UtilityTypes";
import type { Field, NestedType, TypeSchema } from "@typeschema/types";

export type DebugMixin = {
    debug: string;
};

export type EnumValueViewModel = {
    name: string;
    saveName: string;
};

export type EnumViewModel = NamedViewModel & {
    values: EnumValueViewModel[];
};

export type FieldViewModel = {
    owner: NamedViewModel;

    schema: Field;
    name: string;
    saveName: string;

    typeName: string;

    isSizeConstrained: boolean;
    min?: number;
    max?: number;

    isArray: boolean;
    isRequired: boolean;
    isEnum: boolean;

    isPrimitive: Record<IsPrefixed<PrimitiveType>, boolean> | false;
    isComplexType: Record<IsPrefixed<string>, boolean> | false;
    isResource: Record<IsPrefixed<string>, boolean> | false;

    isCode: boolean;
    isIdentifier: boolean;
    isReference: boolean;
};

export type FilterType = {
    whitelist?: (string | RegExp)[];
    blacklist?: (string | RegExp)[];
};

export type HookType = {
    cmd: string;
    args?: string[];
};

export type LambdaMixin = {
    lambda: {
        saveEnumValueName: () => (text: string, render: (input: string) => string) => string;
        saveFieldName: () => (text: string, render: (input: string) => string) => string;
        saveTypeName: () => (text: string, render: (input: string) => string) => string;

        camelCase: () => (text: string, render: (input: string) => string) => string;
        snakeCase: () => (text: string, render: (input: string) => string) => string;
        pascalCase: () => (text: string, render: (input: string) => string) => string;
        kebabCase: () => (text: string, render: (input: string) => string) => string;
        lowerCase: () => (text: string, render: (input: string) => string) => string;
        upperCase: () => (text: string, render: (input: string) => string) => string;
    };
};

export type ListElementInformationMixin = {
    "-index": number;
    "-length": number;
    "-last": boolean;
    "-first": boolean;
};

export type NamedViewModel = {
    name: string;
    saveName: string;
};

export const PRIMITIVE_TYPES = [
    "boolean",
    "instant",
    "time",
    "date",
    "dateTime",

    "decimal",
    "integer",
    "unsignedInt",
    "positiveInt",
    "integer64",
    "base64Binary",

    "uri",
    "url",
    "canonical",
    "oid",
    "uuid",

    "string",
    "code",
    "markdown",
    "id",
    "xhtml",
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];

export type Rendering = {
    source: string;
    fileNameFormat: string;
    path: string;
    filter?: FilterType;
    properties?: Record<string, any>;
};

export type ResolvedTypeViewModel = TypeViewModel & {
    allFields: FieldViewModel[];
    inheritedFields: FieldViewModel[];
    parents: TypeViewModel[];
    children: TypeViewModel[];

    hasChildren: boolean;
    hasParents: boolean;
    hasInheritedFields: boolean;
};

export type RootViewModel<T> = T & {
    resources: { name: string; saveName: string }[];
    complexTypes: { name: string; saveName: string }[];
};

export type TypeViewModel = NamedViewModel & {
    schema: TypeSchema | NestedType;
    fields: FieldViewModel[];

    dependencies: {
        resources: NamedViewModel[];
        complexTypes: NamedViewModel[];
    };

    hasFields: boolean;
    hasNestedComplexTypes: boolean;
    hasNestedEnums: boolean;

    isNested: boolean;
    isComplexType: Record<IsPrefixed<string>, boolean> | false;
    isResource: Record<IsPrefixed<string>, boolean> | false;

    nestedComplexTypes: ResolvedTypeViewModel[];
    nestedEnums: EnumViewModel[];
};

export type View<T extends ViewModel> = LambdaMixin & {
    model: T;
    meta: {
        timestamp: string;
        generator: string;
    };
    properties: Record<string, unknown>;
};

export type ViewModel = Record<string, unknown>;
