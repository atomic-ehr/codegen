import { describe, expect, it } from "bun:test";
import { deduplicateSchemas } from "@root/typeschema";
import {
    type CanonicalUrl,
    hashSchema,
    type Name,
    type NestedIdentifier,
    type NestedTypeSchema,
    type ProfileIdentifier,
    type ProfileTypeSchema,
    profileNestedIdentifier,
    type ResourceIdentifier,
    type SpecializationTypeSchema,
    type TypeSchema,
} from "@root/typeschema/types";
import { mkTypeSchemaIndex } from "@root/typeschema/utils";

describe("collision of a resource with nested types", () => {
    const petUrl = "http://example.org/StructureDefinition/Pet" as CanonicalUrl;
    const petId = (version: string): ResourceIdentifier => ({
        kind: "resource",
        package: "example.pets",
        version,
        name: "Pet" as Name,
        url: petUrl,
    });
    const nestedId = (version: string, path: string): NestedIdentifier => ({
        kind: "nested",
        package: "example.pets",
        version,
        name: path as Name,
        url: `${petUrl}#${path}` as CanonicalUrl,
    });
    const release = (version: string, paths: string[]): TypeSchema[] => {
        const pet: SpecializationTypeSchema = {
            identifier: petId(version),
            fields: Object.fromEntries(paths.map((path) => [path, { type: nestedId(version, path) }])),
        };
        const nested = paths.map(
            (path): NestedTypeSchema => ({
                identifier: nestedId(version, path),
                declaredIn: petId(version),
                path: [path],
                derivation: "specialization",
                fields: {},
            }),
        );
        return [pet, ...nested];
    };
    const listed = (schemas: TypeSchema[], times: number) =>
        schemas.flatMap((schema) =>
            Array.from({ length: times }, () => ({
                schema,
                hash: hashSchema(schema),
                sourcePackage: `example.pets#${schema.identifier.version}`,
                sourceCanonical: petUrl,
            })),
        );

    // 1.0.0 is listed twice, so it ranks first, and only it declares `Pet#vaccination`;
    // the config prefers 2.0.0.
    const { schemas, collisions } = deduplicateSchemas(
        [...listed(release("1.0.0", ["feeding", "vaccination"]), 2), ...listed(release("2.0.0", ["feeding"]), 1)],
        { [petUrl]: { package: "example.pets#2.0.0", canonical: petUrl } },
    );
    const keptVersions = (url: string) =>
        schemas.filter((schema) => schema.identifier.url === url).map((schema) => schema.identifier.version);

    it("keeps the configured variant of the resource", () => {
        expect(keptVersions(petUrl)).toEqual(["2.0.0"]);
    });

    it("keeps the nested type from the resource's kept variant", () => {
        expect(keptVersions(`${petUrl}#feeding`)).toEqual(["2.0.0"]);
    });

    it("drops a nested type that only the dropped variant declares", () => {
        expect(keptVersions(`${petUrl}#vaccination`)).toEqual([]);
    });

    it("reports only the resource as a collision", () => {
        expect(Object.keys(collisions["example.pets"] ?? {})).toEqual([petUrl]);
    });
});

describe("collision of a canonical whose kind differs between variants", () => {
    // Like MetadataResource: a logical model in one release, a resource in the next.
    const url = "http://example.org/StructureDefinition/Metadata" as CanonicalUrl;
    const release = (kind: "logical" | "resource", version: string) => {
        const schema = {
            identifier: { kind, package: "example.pets", version, name: "Metadata" as Name, url },
            fields: {},
        } as SpecializationTypeSchema;
        return { schema, hash: hashSchema(schema), sourcePackage: `example.pets#${version}`, sourceCanonical: url };
    };
    const { schemas, collisions } = deduplicateSchemas([release("logical", "1.0.0"), release("resource", "2.0.0")]);

    it("keeps one variant", () => {
        expect(schemas).toHaveLength(1);
        expect(() => mkTypeSchemaIndex(schemas, {})).not.toThrow();
    });

    it("reports the canonical as a collision", () => {
        expect(Object.keys(collisions["example.pets"] ?? {})).toEqual([url]);
    });
});

describe("collision of a profile whose nested copy a derived profile uses", () => {
    const vitalsUrl = "http://example.org/StructureDefinition/PetVitals" as CanonicalUrl;
    const vitalsId = (version: string): ProfileIdentifier => ({
        kind: "profile",
        package: "example.pets",
        version,
        name: "PetVitals" as Name,
        url: vitalsUrl,
    });
    const observation: ResourceIdentifier = {
        kind: "resource",
        package: "example.core",
        version: "1.0.0",
        name: "Observation" as Name,
        url: "http://example.org/StructureDefinition/Observation" as CanonicalUrl,
    };
    const observationComponent: NestedIdentifier = {
        kind: "nested",
        package: "example.core",
        version: "1.0.0",
        name: "component" as Name,
        url: `${observation.url}#component` as CanonicalUrl,
    };
    const item = (schema: TypeSchema, sourcePackage: string) => ({
        schema,
        hash: hashSchema(schema),
        sourcePackage,
        sourceCanonical: schema.identifier.url,
    });

    // PetVitals 1.0.0 constrains `component`, 2.0.0 doesn't.
    const vitals1 = vitalsId("1.0.0");
    const vitals1Component = profileNestedIdentifier(vitals1, "component" as Name);
    const vitals1Schemas: TypeSchema[] = [
        { identifier: vitals1, base: observation, fields: { component: { type: vitals1Component } } },
        {
            identifier: vitals1Component,
            declaredIn: vitals1,
            path: ["component"],
            derivation: "constraint",
            base: observationComponent,
            specialization: observationComponent,
            fields: {},
        },
    ];
    const vitals2: ProfileTypeSchema = { identifier: vitalsId("2.0.0"), base: observation, fields: {} };
    // CatVitals is built on PetVitals 1.0.0 and doesn't constrain `component` itself,
    // so its field points at PetVitals' copy.
    const catVitals: ProfileTypeSchema = {
        identifier: {
            kind: "profile",
            package: "example.cats",
            version: "1.0.0",
            name: "CatVitals" as Name,
            url: "http://example.org/StructureDefinition/CatVitals" as CanonicalUrl,
        },
        base: vitals1,
        fields: { component: { type: vitals1Component } },
        dependencies: [vitals1, vitals1Component],
    };
    const { schemas } = deduplicateSchemas(
        [
            ...vitals1Schemas.map((schema) => item(schema, "example.pets#1.0.0")),
            item(vitals2, "example.pets#2.0.0"),
            item(catVitals, "example.cats#1.0.0"),
        ],
        { [vitalsUrl]: { package: "example.pets#2.0.0", canonical: vitalsUrl } },
    );
    const keptVersions = (url: string) =>
        schemas.filter((schema) => schema.identifier.url === url).map((schema) => schema.identifier.version);

    it("keeps the configured variant of the profile", () => {
        expect(keptVersions(vitalsUrl)).toEqual(["2.0.0"]);
    });

    it("keeps the nested copy the derived profile uses", () => {
        expect(keptVersions(`${vitalsUrl}#component`)).toEqual(["1.0.0"]);
    });
});
