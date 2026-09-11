import { describe, expect, test } from "bun:test";
import { generateProfileClass } from "@root/api/writer-generator/typescript/profile";
import { TypeScript } from "@root/api/writer-generator/typescript/writer";
import type {
    CanonicalUrl,
    ComplexTypeTypeSchema,
    Name,
    PrimitiveTypeSchema,
    ResourceTypeSchema,
    SnapshotProfileTypeSchema,
    TypeIdentifier,
} from "@root/typeschema/types";
import { mkTypeSchemaIndex } from "@root/typeschema/utils";
import { mkCodegenLogger } from "@root/utils/log";
import * as helpers from "../../../../../assets/api/writer-generator/typescript/profile-helpers";

const makeBase = (kind: "resource" | "complex-type", name: string): TypeIdentifier => ({
    kind,
    name: name as Name,
    package: "hl7.fhir.r4.core",
    version: "4.0.1",
    url: `http://hl7.org/fhir/StructureDefinition/${name}` as CanonicalUrl,
});

const makeSnapshot = (name: string, base: TypeIdentifier): SnapshotProfileTypeSchema => ({
    identifier: {
        kind: "profile-snapshot",
        name: name as Name,
        package: "codegen.test",
        version: "1.0.0",
        url: `http://example.org/StructureDefinition/${name}` as CanonicalUrl,
    },
    base,
    fields: {},
});

const extensionBase = makeBase("complex-type", "Extension");
const codeBase: TypeIdentifier = {
    kind: "primitive-type",
    name: "code" as Name,
    package: "hl7.fhir.r4.core",
    version: "4.0.1",
    url: "http://hl7.org/fhir/StructureDefinition/code" as CanonicalUrl,
};

const extensionSchema: ComplexTypeTypeSchema = {
    identifier: extensionBase as ComplexTypeTypeSchema["identifier"],
};
const codeSchema: PrimitiveTypeSchema = {
    identifier: codeBase as PrimitiveTypeSchema["identifier"],
    base: makeBase("complex-type", "Element"),
};

const generateProfile = (
    snapshot: SnapshotProfileTypeSchema,
    schemas: Array<ResourceTypeSchema | ComplexTypeTypeSchema | PrimitiveTypeSchema>,
) => {
    const logger = mkCodegenLogger({ level: "ERROR" });
    const w = new TypeScript({
        outputDir: "/tmp/complex-extension-factory",
        inMemoryOnly: true,
        tabSize: 4,
        commentLinePrefix: "//",
        logger,
        openResourceTypeSet: false,
        primitiveTypeExtension: true,
        generateProfile: true,
    });
    const tsIndex = mkTypeSchemaIndex(schemas, { logger });
    w.cd("/", () => {
        w.cat(`${snapshot.identifier.name}Profile.ts`, () => {
            generateProfileClass(w, tsIndex, snapshot);
        });
    });
    const generated = w.writtenFiles()[0]?.content ?? "";
    return { logger, generated };
};

describe("TypeScript extension profile Flat factory input", () => {
    const slice = (name: string, min = 0) => ({
        min,
        max: 1,
        match: { url: name },
        elements: ["url", "valueString"],
        nameCandidates: { candidates: [name], recommended: name },
    });

    const extensionSnapshot = (
        name: string,
        options: { extraAutoField?: boolean; collidingSubSlice?: boolean } = {},
    ): SnapshotProfileTypeSchema => {
        const fields: SnapshotProfileTypeSchema["fields"] = {
            valueCode: { type: codeBase, required: true },
            extension: { type: extensionBase, array: true },
        };
        const slicing: NonNullable<SnapshotProfileTypeSchema["slicing"]> = {
            extension: {
                slices: {
                    [options.collidingSubSlice ? "valueCode" : "name"]: slice(
                        options.collidingSubSlice ? "valueCode" : "name",
                    ),
                    value: slice("value"),
                },
            },
        };
        if (options.extraAutoField) {
            fields.component = { type: extensionBase, array: true };
            slicing.component = {
                slices: {
                    requiredComponent: slice("requiredComponent", 1),
                },
            };
        }
        return { ...makeSnapshot(name, extensionBase), fields, slicing };
    };

    test("preserves caller slice entries and supplies required non-extension defaults", () => {
        const { generated } = generateProfile(
            extensionSnapshot("RenderingEngineViewHintsWithAuto", { extraAutoField: true }),
            [extensionSchema, codeSchema],
        );
        // Execute the emitted factory with the production runtime helpers. Imports
        // are type-only except for those helpers; no generated text is asserted.
        const source = generated.replace(/import[\s\S]*?from\s+["'][^"']+["'];/g, "");
        const javascript = new Bun.Transpiler({ loader: "ts" }).transformSync(source).replace(/export /g, "");
        const Profile = new Function(
            ...Object.keys(helpers),
            `${javascript}; return RenderingEngineViewHintsWithAutoProfile;`,
        )(...Object.values(helpers));
        const component = [{ url: "custom", valueString: "keep" }];
        expect(Profile.createResource({ valueCode: "compact", name: "panel", component })).toEqual({
            valueCode: "compact",
            component: [component[0], { url: "requiredComponent" }],
            extension: [{ url: "name", valueString: "panel" }],
        });
        expect(component).toEqual([{ url: "custom", valueString: "keep" }]);
        expect(Profile.createResource({ valueCode: "compact" }).component).toEqual([{ url: "requiredComponent" }]);
    });

    test("rejects flat field names that collide with ordinary required inputs", () => {
        expect(() =>
            generateProfile(extensionSnapshot("RenderingEngineViewHintsCollision", { collidingSubSlice: true }), [
                extensionSchema,
                codeSchema,
            ]),
        ).toThrow(/Flat input field collision.*valueCode/);
    });
});
