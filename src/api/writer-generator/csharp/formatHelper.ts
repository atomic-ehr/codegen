import { camelCase, uppercaseFirstLetter } from "../utils.ts";

const ops: Record<string, string> = {
    "!": "Not",
    "<=": "LessOrEqual",
    ">=": "GreaterOrEqual",
    "<": "Less",
    ">": "Greater",
    "=": "Equal",
    "-": "Dash",
    "+": "Plus",
    "*": "Asterisk",
    "/": "Slash",
    "%": "Percent",
    "&": "And",
    "|": "Or",
    "^": "Xor",
    "~": "Tilde",
    "?": "Question",
    ".": "Dot",
};

export function formatEnumDashHandle(entry: string): string {
    return entry
        .split("-")
        .map((part) => uppercaseFirstLetter(part))
        .join("-");
}

export function formatEnumEntryOperation(entry: string): string {
    let res: string = entry;
    for (const op in ops) res = res.replaceAll(op, ops[op] ?? "");
    return res;
}

export function formatEnumNumber(entry: string): string {
    const num = Number(entry[0]);
    if (Number.isInteger(num) && !Number.isNaN(num)) {
        return `_${entry}`;
    }
    return entry;
}

export function formatEnumEntry(entry: string): string {
    let res: string = formatEnumDashHandle(entry);
    res = formatEnumNumber(res);
    res = formatEnumEntryOperation(res);
    res = uppercaseFirstLetter(res);
    return res;
}

export function formatName(input: string): string {
    return uppercaseFirstLetter(camelCase(input.replaceAll(".", "-")));
}
