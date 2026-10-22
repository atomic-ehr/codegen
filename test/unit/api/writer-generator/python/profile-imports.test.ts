import { describe, expect, test } from "bun:test";
import { generateProfileModule } from "@root/api/writer-generator/python/profile";
import { Python } from "@root/api/writer-generator/python/writer";
import type { CanonicalUrl, Identifier, Name, SnapshotProfileTypeSchema, TypeSchema } from "@root/typeschema/types";
import { mkTypeSchemaIndex } from "@root/typeschema/utils";
import { mkCodegenLogger } from "@root/utils/log";

const identifier = <K extends Identifier["kind"]>(kind: K, name: string, pkg = "codegen.test") => ({
    kind,
    name: name as Name,
    package: pkg,
    version: "1.0.0",
    url: `http://${pkg}/StructureDefinition/${name}` as CanonicalUrl,
});

const generate = (fields: SnapshotProfileTypeSchema["fields"], schemas: TypeSchema[] = []): string => {
    const base = identifier("resource", "Patient");
    const snapshot: SnapshotProfileTypeSchema = {
        identifier: identifier("profile-snapshot", "TestPatient"),
        base,
        fields,
    };
    const logger = mkCodegenLogger({ level: "ERROR" });
    const writer = new Python({
        outputDir: "generated",
        inMemoryOnly: true,
        rootPackageName: "fhir_types",
        fieldFormat: "snake_case",
        client: "none",
        tabSize: 4,
        commentLinePrefix: "#",
        logger,
    });
    const index = mkTypeSchemaIndex([{ identifier: base }, ...schemas], { logger });
    writer.cd("/", () => writer.cat("profile.py", () => generateProfileModule(writer, index, snapshot)));
    return writer.writtenFiles()[0]!.content;
};

describe("Python profile imports", () => {
    test("a profile without field accessors omits typing imports", () => {
        const module = generate({});
        expect(module).not.toContain("from typing import");
        expect(module).not.toContain("from pydantic import");
        expect(module).toContain("build_resource, ensure_profile");
        expect(module).toContain('resource_type: str = "Patient"');
    });

    test("imports PositiveInt for a positiveInt profile field", () => {
        const module = generate({ count: { type: identifier("primitive-type", "positiveInt"), required: true } });
        expect(module).toContain("from pydantic import PositiveInt");
        expect(module).toContain("count: PositiveInt");
    });

    test("uses distinct aliases for same-named field types from different packages", () => {
        const left = identifier("complex-type", "Shared", "left.pkg");
        const right = identifier("complex-type", "Shared", "right.pkg");
        const module = generate({ left: { type: left, required: true }, right: { type: right, required: true } }, [
            { identifier: left },
            { identifier: right },
        ]);
        expect(module).toContain("from fhir_types.left_pkg.base import Shared\n");
        expect(module).toContain("from fhir_types.right_pkg.base import Shared as Shared_1\n");
        expect(module).toContain("left: Shared, right: Shared_1");
        expect(module).not.toContain("\\u0000");
        expect(module).not.toContain("\u0000");
    });
});
