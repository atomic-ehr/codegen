type CollisionSource = {
    sourceCanonical: string;
    sourcePackage: string;
};

type CollisionVariant = {
    schemaHash: string;
    sources: readonly CollisionSource[];
};

const compareStrings = (left: string, right: string): number => {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
};

export const compareCollisionSources = (left: CollisionSource, right: CollisionSource): number =>
    compareStrings(left.sourcePackage, right.sourcePackage) ||
    compareStrings(left.sourceCanonical, right.sourceCanonical);

const collisionSourcesKey = (sources: readonly CollisionSource[]): string =>
    JSON.stringify(
        [...sources]
            .sort(compareCollisionSources)
            .map(({ sourcePackage, sourceCanonical }) => [sourcePackage, sourceCanonical]),
    );

export const compareCollisionVariants = (left: CollisionVariant, right: CollisionVariant): number =>
    right.sources.length - left.sources.length ||
    compareStrings(collisionSourcesKey(left.sources), collisionSourcesKey(right.sources)) ||
    compareStrings(left.schemaHash, right.schemaHash);
