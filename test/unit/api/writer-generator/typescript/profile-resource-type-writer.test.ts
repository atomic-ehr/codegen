import { describe, expect, test } from "bun:test";
import { generateProfileClass, generateProfileImports } from "@root/api/writer-generator/typescript/profile";
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

const makeBase = (kind: "resource" | "complex-type" | "profile", name: string): TypeIdentifier => ({
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
const elementSchema: ComplexTypeTypeSchema = {
    identifier: elementBase as ComplexTypeTypeSchema["identifier"],
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
            const imports = generateProfileImports(w, tsIndex, snapshot);
            generateProfileClass(w, imports, tsIndex, snapshot);
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
        ["ExtensionProfile", extensionBase, [extensionSchema]],
        ["AddressProfile", datatypeBase, [datatypeSchema]],
        ["PrimitiveProfile", primitiveBase, [primitiveSchema, elementSchema]],
    ] as const)("omits static resourceType for non-resource profile %s", (name, base, schemas) => {
        const { logger, generated } = generateProfile(makeSnapshot(name, base), [...schemas]);

        expect(logger.buffer().filter((entry) => entry.level === "ERROR")).toEqual([]);
        expect(generated).toContain(`export class ${name}`);
        expect(generated).not.toContain("static readonly resourceType");
    });

    test("logs an error when a profile base does not resolve to a specialization", () => {
        const unresolvableBase = makeBase("profile", "USCoreObservation");
        const { logger, generated } = generateProfile(makeSnapshot("Orphan", unresolvableBase), [resourceSchema]);

        const errors = logger.buffer().filter((entry) => entry.level === "ERROR");
        expect(errors).toHaveLength(1);
        expect(errors[0]?.message).toContain("Cannot emit static resourceType for profile 'OrphanProfile'");
        expect(generated).not.toContain("static readonly resourceType");
    });
});

describe("TypeScript profile helper imports", () => {
    test("omits the helper import when the profile emits no helper calls", () => {
        const snapshot = makeSnapshot("OptionalAddress", datatypeBase);
        snapshot.fields.data = { type: primitiveBase };
        const { generated } = generateProfile(snapshot, [datatypeSchema, primitiveSchema]);

        expect(generated).not.toContain("profile-helpers");
    });

    test("validate() without checks declares neither res nor profileName", () => {
        const snapshot = makeSnapshot("OptionalAddress", datatypeBase);
        snapshot.fields.data = { type: primitiveBase };
        const { generated } = generateProfile(snapshot, [datatypeSchema, primitiveSchema]);

        expect(generated).not.toContain("const res =");
        expect(generated).not.toContain("profileName");
    });

    test("declares profileName once at module level", () => {
        const snapshot = makeSnapshot("InheritedExtension", extensionBase);
        snapshot.inheritedRequiredFields = ["url"];
        const { generated } = generateProfile(snapshot, [extensionSchema]);

        expect(generated).toContain('\nconst profileName = "InheritedExtension";\n');
        expect(generated.match(/const profileName/g)?.length).toBe(1);
        expect(generated).toContain(
            '\nconst canonicalUrl = "http://example.org/StructureDefinition/InheritedExtension";\n',
        );
        expect(generated).toContain("static readonly canonicalUrl = canonicalUrl;");
        expect(generated).toContain("resource.url = canonicalUrl;");
        expect(generated).not.toContain("Profile.canonicalUrl");
        expect(generated).toContain("const res = this.resource");
    });

    test("imports only validateRequired for inherited required fields", () => {
        const snapshot = makeSnapshot("InheritedExtension", extensionBase);
        snapshot.inheritedRequiredFields = ["url"];
        const { generated } = generateProfile(snapshot, [extensionSchema]);

        expect(generated).toContain('import { validateRequired } from "../../profile-helpers";');
        expect(generated).toContain('...validateRequired(res, profileName, "url")');
    });

    test("imports a helper once when multiple fields use it only in warnings", () => {
        const snapshot = makeSnapshot("SupportedAddress", datatypeBase);
        snapshot.fields.first = { type: primitiveBase, mustSupport: true };
        snapshot.fields.second = { type: primitiveBase, mustSupport: true };
        const { generated } = generateProfile(snapshot, [datatypeSchema, primitiveSchema]);

        expect(generated).toContain('import { validateMustSupport } from "../../profile-helpers";');
        expect(generated).toContain('...validateMustSupport(res, profileName, "first")');
        expect(generated).toContain('...validateMustSupport(res, profileName, "second")');
        expect(generated).not.toContain("\u0000");
    });
});

describe("TypeScript profile type imports", () => {
    test("uses distinct aliases for types with the same name from different packages", () => {
        const otherAddress: TypeIdentifier = {
            ...datatypeBase,
            package: "other.types",
            url: "http://example.org/StructureDefinition/Address" as CanonicalUrl,
        };
        const snapshot = makeSnapshot("AddressPair", datatypeBase);
        snapshot.fields.other = { type: otherAddress, required: true };
        const { generated } = generateProfile(snapshot, [
            datatypeSchema,
            { identifier: otherAddress as ComplexTypeTypeSchema["identifier"] },
        ]);

        expect(generated).toContain('import type { Address } from "../../hl7-fhir-r4-core/Address";');
        expect(generated).toContain('import type { Address as Address_1 } from "../../other-types/Address";');
        expect(generated).toContain("other: Address_1;");
        expect(generated).toContain("constructor (resource: Address)");
        expect(generated).toContain("getOther () : Address_1 | undefined");
        expect(generated).not.toContain("\u0000");
    });

    test("groups a nested field type with its parent module", () => {
        const component: TypeIdentifier = {
            ...resourceBase,
            kind: "nested",
            name: "component" as Name,
            url: `${resourceBase.url}#component` as CanonicalUrl,
        };
        const snapshot = makeSnapshot("ComponentObservation", resourceBase);
        snapshot.fields.component = { type: component, required: true, array: true };
        const { generated } = generateProfile(snapshot, [resourceSchema]);

        expect(generated).toContain(
            'import type { Observation, ObservationComponent } from "../../hl7-fhir-r4-core/Observation";',
        );
        expect(generated).toContain("component: ObservationComponent[];");
        expect(generated).not.toContain("\u0000");
    });

    test("keeps primitive bases as TypeScript primitives", () => {
        const { generated } = generateProfile(makeSnapshot("Binary", primitiveBase), [primitiveSchema, elementSchema]);

        expect(generated).not.toContain("import type");
        expect(generated).toContain("constructor (resource: string)");
    });

    test("uses the imported Extension alias in extension methods and nested targets", () => {
        const otherExtension: TypeIdentifier = {
            ...extensionBase,
            package: "a.types",
            url: "http://example.org/StructureDefinition/Extension" as CanonicalUrl,
        };
        const snapshot = makeSnapshot("ExtendedObservation", resourceBase);
        snapshot.fields.other = { type: otherExtension, required: true };
        snapshot.extensions = [
            {
                name: "note",
                path: "contact.extension",
                url: "http://example.org/StructureDefinition/note",
                nameCandidates: { candidates: ["Note"], recommended: "Note" },
            },
        ];
        const { generated } = generateProfile(snapshot, [
            resourceSchema,
            extensionSchema,
            { identifier: otherExtension as ComplexTypeTypeSchema["identifier"] },
        ]);

        expect(generated).toContain(
            'import type { Extension as Extension_1 } from "../../hl7-fhir-r4-core/Extension";',
        );
        expect(generated).toContain('Omit<Extension_1, "url"> | Extension_1');
        expect(generated).toMatch(/public getNote\s*\(\)\s*:\s*Extension_1 \| undefined/);
        expect(generated).toContain("target.extension = [] as Extension_1[]");
        expect(generated).not.toContain("\u0000");
    });
});
