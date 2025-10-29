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
    "xhtml"
] as const;

export type PrimitiveType = (typeof PRIMITIVE_TYPES)[number];