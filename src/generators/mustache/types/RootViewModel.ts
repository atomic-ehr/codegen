export type RootViewModel<T> = T & {
    resources: { name: string, saveName: string }[];
    complexTypes: { name: string, saveName: string }[];
};