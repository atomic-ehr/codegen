import { describe, expect, test } from "bun:test";
import { Python } from "@root/api/writer-generator/python/writer";
import type {
    CanonicalUrl,
    ComplexTypeTypeSchema,
    Name,
    ResourceTypeSchema,
    TypeIdentifier,
    TypeSchema,
} from "@root/typeschema/types";
import { mkTypeSchemaIndex } from "@root/typeschema/utils";
import { mkCodegenLogger } from "@root/utils/log";

const identifier = <K extends TypeIdentifier["kind"]>(kind: K, name: string, pkg = "codegen.test") => ({
    kind,
    name: name as Name,
    package: pkg,
    version: "1.0.0",
    url: `http://${pkg}/StructureDefinition/${name}` as CanonicalUrl,
});

const complexType = (name: string, pkg?: string): ComplexTypeTypeSchema => ({
    identifier: identifier("complex-type", name, pkg),
});

const generate = async (schemas: TypeSchema[]): Promise<Record<string, string>> => {
    const logger = mkCodegenLogger({ level: "ERROR" });
    const writer = new Python({
        outputDir: "/tmp/python-type-module-imports",
        inMemoryOnly: true,
        rootPackageName: "fhir_types",
        fieldFormat: "snake_case",
        client: "none",
        tabSize: 4,
        commentLinePrefix: "#",
        logger,
    });
    await writer.generate(mkTypeSchemaIndex(schemas, { logger }));
    const files = Object.fromEntries(writer.writtenFiles().map((file) => [file.relPath, file.content]));
    for (const [path, content] of Object.entries(files))
        if (content.includes("\u0000")) throw new Error(`${path} contains an unresolved section marker`);
    return files;
};

const fileEndingWith = (files: Record<string, string>, suffix: string): string => {
    const path = Object.keys(files).find((relPath) => relPath.endsWith(suffix));
    if (!path) throw new Error(`No generated file ends with ${suffix}`);
    return files[path] ?? "";
};

describe("Python type module imports", () => {
    test("a resource without fields imports only the names its class uses", async () => {
        const resource: ResourceTypeSchema = { identifier: identifier("resource", "TestResource") };
        const module = fileEndingWith(await generate([resource]), "/codegen_test/test_resource.py");

        expect(module).toContain("from pydantic import BaseModel, ConfigDict\n");
        expect(module).toContain("class TestResource(BaseModel):");
        expect(module).not.toContain("from typing");
        expect(module).not.toContain("from typing_extensions");
    });

    test("imports PositiveInt only for a positiveInt field", async () => {
        const resource: ResourceTypeSchema = {
            identifier: identifier("resource", "TestResource"),
            fields: {
                count: { type: identifier("primitive-type", "positiveInt") },
                label: { type: identifier("primitive-type", "string") },
            },
        };
        const module = fileEndingWith(await generate([resource]), "/codegen_test/test_resource.py");

        expect(module).toContain("from pydantic import BaseModel, ConfigDict, Field, PositiveInt\n");
        expect(module).toContain("count: PositiveInt | None");
        expect(module).toContain("label: str | None");
    });

    test("keeps nested types local and imports a shared type once", async () => {
        const part = identifier("nested", "TestResource#part");
        const other = complexType("Other");
        const resource: ResourceTypeSchema = {
            identifier: identifier("resource", "TestResource"),
            nested: [{ identifier: part, base: other.identifier, fields: { value: { type: other.identifier } } }],
            fields: {
                part: { type: part },
                other: { type: other.identifier },
            },
        };
        const module = fileEndingWith(await generate([resource, other]), "/codegen_test/test_resource.py");

        expect(module.match(/^from fhir_types\.codegen_test\.base import Other$/gm)).toHaveLength(1);
        expect(module).toContain("class TestResourcePart(Other):");
        expect(module).toContain("part: TestResourcePart | None");
        expect(module).not.toContain("import TestResourcePart");
    });

    test("base.py imports complex types from another package", async () => {
        const quantity = complexType("Quantity", "other.pkg");
        const local = complexType("Local");
        const dosage: ComplexTypeTypeSchema = {
            identifier: identifier("complex-type", "Dosage"),
            fields: {
                dose: { type: quantity.identifier },
                local: { type: local.identifier },
            },
        };
        const basePy = fileEndingWith(await generate([dosage, local, quantity]), "/codegen_test/base.py");

        expect(basePy).toContain("from fhir_types.other_pkg.base import Quantity\n");
        expect(basePy).toContain("dose: Quantity | None");
        expect(basePy).toContain("local: Local | None");
        expect(basePy).not.toContain("import Local");
    });

    test("aliases a typing name taken by a FHIR type", async () => {
        const anyType = complexType("Any", "other.pkg");
        const resource: ResourceTypeSchema = {
            identifier: identifier("resource", "TestResource"),
            fields: { value: { type: anyType.identifier } },
        };
        const module = fileEndingWith(await generate([resource, anyType]), "/codegen_test/test_resource.py");

        expect(module).toContain("from typing import Any as Any_1\n");
        expect(module).toContain("from fhir_types.other_pkg.base import Any\n");
        expect(module).toContain("value: Any | None");
        expect(module).toContain("def model_post_init(self, __context: Any_1) -> None:");
    });
});
