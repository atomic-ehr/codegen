import {
    extractExtensionDeps,
    type Field,
    type Identifier,
    isChoiceDeclarationField,
    type ProfileExtension,
} from "../types";

/** Direct graph edges only; nested definitions carry their own dependencies. */
export const extractDependencies = (
    identifier: Identifier,
    base: Identifier | undefined,
    fields: Record<string, Field> | undefined,
    extensions?: ProfileExtension[],
): Identifier[] | undefined => {
    const deps: Identifier[] = base ? [base] : [];
    for (const field of Object.values(fields ?? {})) {
        if (isChoiceDeclarationField(field)) continue;
        if (field.type) deps.push(field.type);
        if (field.binding) deps.push(field.binding);
    }
    deps.push(...(extensions ?? []).flatMap(extractExtensionDeps));
    const key = (id: Identifier) => JSON.stringify([id.package, id.version, id.kind, id.url]);
    const unique = Object.values(
        Object.fromEntries(deps.filter((dep) => key(dep) !== key(identifier)).map((dep) => [key(dep), dep])),
    );
    return unique.length ? unique.sort((a, b) => a.url.localeCompare(b.url)) : undefined;
};
