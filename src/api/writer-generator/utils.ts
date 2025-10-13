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


export function deepEqual<T>(obj1: T, obj2: T): boolean {
  if (obj1 === obj2) return true;

  if (obj1 === null || obj2 === null ||
      typeof obj1 !== 'object' || typeof obj2 !== 'object') {
    return false;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false;
    return obj1.every((item, index) => deepEqual(item, obj2[index]));
  }

  if (Array.isArray(obj1) || Array.isArray(obj2)) {
    return false;
  }

  const keys1 = Object.keys(obj1) as (keyof T)[];
  const keys2 = Object.keys(obj2) as (keyof T)[];

  if (keys1.length !== keys2.length) return false;

  return keys1.every(key =>
    keys2.includes(key) && deepEqual(obj1[key], obj2[key])
  );
}