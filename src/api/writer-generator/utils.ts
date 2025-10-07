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

export const uppercaseFirstLetter = (str: string): string => {
    if (!str || str.length === 0) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
};

export const uppercaseFirstLetterOfEach = (strings: string[]): string[] => {
    return strings.map((str) => uppercaseFirstLetter(str));
};
