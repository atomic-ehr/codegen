export const words = (s: string) => {
    return s.split(/(?<=[a-z])(?=[A-Z])|[-_.\s]/).filter(Boolean);
};

export const kebabCase = (s: string) => {
    return words(s)
        .map((s) => s.toLowerCase())
        .join("-");
};

export const capitalCase = (s: string) => {
    if (s.length === 0) throw new Error("Empty string");
    return s[0]?.toUpperCase() + s.substring(1).toLowerCase();
};

export const camelCase = (s: string) => {
    if (s.length === 0) throw new Error("Empty string");
    const [first, ...rest] = words(s);
    return [first?.toLowerCase(), ...rest.map(capitalCase)].join("");
};

export const pascalCase = (s: string) => {
    return words(s).map(capitalCase).join("");
};

export const snakeCase = (s: string) => {
    return words(s)
        .map((s) => s.toLowerCase())
        .join("_");
};

export const canonicalToName = (canonical: string | undefined) => {
    if (!canonical) return undefined;
    let localName = canonical.split("/").pop();
    if (localName?.includes("#")) {
        localName = localName.split("#")[0];
    }
    if (/^\d/.test(localName ?? "")) {
        localName = `number_${localName}`;
    }
    return localName;
};
