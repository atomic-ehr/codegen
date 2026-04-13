import { pascalCase, snakeCase, uppercaseFirstLetterOfEach } from "@root/api/writer-generator/utils";
import type { TypeIdentifier } from "@typeschema/types.ts";

export const PRIMITIVE_TYPE_MAP: Record<string, string> = {
    boolean: "bool",
    instant: "str",
    time: "str",
    date: "str",
    dateTime: "str",
    decimal: "float",
    integer: "int",
    unsignedInt: "int",
    positiveInt: "PositiveInt",
    integer64: "int",
    base64Binary: "str",
    uri: "str",
    url: "str",
    canonical: "str",
    oid: "str",
    uuid: "str",
    string: "str",
    code: "str",
    markdown: "str",
    id: "str",
    xhtml: "str",
};

export const PYTHON_KEYWORDS = new Set([
    "False",
    "None",
    "True",
    "and",
    "as",
    "assert",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "try",
    "while",
    "with",
    "yield",
]);

export const fixReservedWords = (name: string): string => {
    return PYTHON_KEYWORDS.has(name) ? `${name}_` : name;
};

export const canonicalToName = (canonical: string | undefined, dropFragment = true) => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (!localName) return undefined;
    if (dropFragment && localName.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (!localName) return undefined;
    if (/^\d/.test(localName)) {
        localName = `number_${localName}`;
    }
    return snakeCase(localName);
};

export const deriveResourceName = (id: TypeIdentifier): string => {
    if (id.kind === "nested") {
        const url = id.url;
        const path = canonicalToName(url, false);
        if (!path) return "";
        const [resourceName, fragment] = path.split("#");
        const name = uppercaseFirstLetterOfEach((fragment ?? "").split(".")).join("");
        return pascalCase([resourceName, name].join(""));
    }
    return pascalCase(id.name);
};

const buildPyPackageName = (packageName: string): string => {
    const parts = packageName ? [snakeCase(packageName)] : [""];
    return parts.join(".");
};

export const pyFhirPackageByName = (rootPackageName: string, name: string): string =>
    [rootPackageName, buildPyPackageName(name)].join(".");

export const pyFhirPackage = (rootPackageName: string, identifier: TypeIdentifier): string =>
    pyFhirPackageByName(rootPackageName, identifier.package);

export const pyPackage = (rootPackageName: string, identifier: TypeIdentifier): string => {
    if (identifier.kind === "complex-type") {
        return `${pyFhirPackage(rootPackageName, identifier)}.base`;
    }
    if (identifier.kind === "resource") {
        return [pyFhirPackage(rootPackageName, identifier), snakeCase(identifier.name)].join(".");
    }
    return pyFhirPackage(rootPackageName, identifier);
};
