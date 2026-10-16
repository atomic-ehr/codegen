import {
    extractExtensionDeps,
    type Field,
    isChoiceDeclarationField,
    type ProfileExtension,
    type TypeIdentifier,
} from "../types";

/** Direct graph edges only; nested definitions carry their own dependencies. */
export const extractDependencies = (
    identifier: TypeIdentifier,
    base: TypeIdentifier | undefined,
    fields: Record<string, Field> | undefined,
    extensions?: ProfileExtension[],
): TypeIdentifier[] | undefined => {
    const deps: TypeIdentifier[] = base ? [base] : [];
    for (const field of Object.values(fields ?? {})) {
        if (isChoiceDeclarationField(field)) continue;
        if (field.type) deps.push(field.type);
        if (field.binding) deps.push(field.binding);
    }
    deps.push(...(extensions ?? []).flatMap(extractExtensionDeps));
    const key = (id: TypeIdentifier) => JSON.stringify([id.package, id.version, id.kind, id.url]);
    const unique = new Map(deps.filter((dep) => key(dep) !== key(identifier)).map((dep) => [key(dep), dep]));
    return unique.size ? [...unique.values()].sort((a, b) => a.url.localeCompare(b.url)) : undefined;
};
export const extractProfileDependencies = extractDependencies;
