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

const primitiveBase: TypeIdentifier = {
    kind: "primitive-type",
    name: "base64Binary" as Name,
    package: "hl7.fhir.r4.core",
    version: "4.0.1",
    url: "http://hl7.org/fhir/StructureDefinition/base64Binary" as CanonicalUrl,
};

const elementBase: TypeIdentifier = {
    kind: "complex-type",
    name: "Element" as Name,
    package: "hl7.fhir.r4.core",
    version: "4.0.1",
    url: "http://hl7.org/fhir/StructureDefinition/Element" as CanonicalUrl,
};

const primitiveSchema: PrimitiveTypeSchema = {
    identifier: primitiveBase,
    base: elementBase,
};

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

const resourceBase = makeBase("resource", "Observation");
const extensionBase = makeBase("complex-type", "Extension");
const datatypeBase = makeBase("complex-type", "Address");
const resourceSchema: ResourceTypeSchema = {
    identifier: resourceBase as ResourceTypeSchema["identifier"],
};
const extensionSchema: ComplexTypeTypeSchema = {
    identifier: extensionBase as ComplexTypeTypeSchema["identifier"],
};
const datatypeSchema: ComplexTypeTypeSchema = {
    identifier: datatypeBase as ComplexTypeTypeSchema["identifier"],
};
const generateProfile = (
    snapshot: SnapshotProfileTypeSchema,
    schemas: Array<ResourceTypeSchema | ComplexTypeTypeSchema | PrimitiveTypeSchema>,
) => {
    const logger = mkCodegenLogger({ level: "ERROR" });
    const w = new TypeScript({
        outputDir: "/tmp/profile-resource-type",
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

describe("TypeScript profile writer resourceType descriptor", () => {
    test("emits static resourceType for a resource profile", () => {
        const { logger, generated } = generateProfile(makeSnapshot("BodyWeight", resourceBase), [resourceSchema]);

        expect(logger.buffer().filter((entry) => entry.level === "ERROR")).toEqual([]);
        expect(generated).toContain('static readonly resourceType = "Observation"');
    });

    // Complex and primitive profiles do not
    // represent FHIR resources and must not expose a resourceType descriptor.
    test.each([
        ["ExtensionProfile", extensionBase, extensionSchema],
        ["AddressProfile", datatypeBase, datatypeSchema],
        ["PrimitiveProfile", primitiveBase, primitiveSchema],
    ])("omits static resourceType for non-resource profile %s", (name, base, schema) => {
        const { logger, generated } = generateProfile(makeSnapshot(name, base), [schema]);

        expect(logger.buffer().filter((entry) => entry.level === "ERROR")).toEqual([]);
        expect(generated).toContain(`export class ${name}`);
        expect(generated).not.toContain("static readonly resourceType");
    });
});
