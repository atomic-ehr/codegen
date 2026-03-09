export type CapitalizeFirst<S extends string> = S extends `${infer F}${infer R}` ? `${Uppercase<F>}${R}` : S;

export type IsPrefixed<T extends string> = `is${CapitalizeFirst<T>}`;

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
