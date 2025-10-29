
export type CapitalizeFirst<S extends string> = S extends `${infer F}${infer R}`
    ? `${Uppercase<F>}${R}`
    : S;

export type IsPrefixed<T extends string> = `is${CapitalizeFirst<T>}`;