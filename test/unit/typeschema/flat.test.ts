import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { generateTypeSchemas } from "@root/typeschema";
import { treeShake } from "@root/typeschema/ir/tree-shake";
import { transformFhirSchema } from "@typeschema/core/transformer";
import {
    isBindingSchema,
    isNestedTypeSchema,
    isProfileNestedTypeSchema,
    isProfileTypeSchema,
    isValueSetTypeSchema,
} from "@typeschema/types";

const mkIndex = (schemas: import("@typeschema/types").TypeSchema[]) =>
    mkTypeSchemaIndex(schemas, { logger: mkSilentLogger() });

import type { CanonicalUrl, RichFHIRSchema } from "@typeschema/types";
import { mkTypeSchemaIndex } from "@typeschema/utils";
import { mkR4Register, mkSilentLogger, registerFs } from "@typeschema-test/utils";

describe("flat TypeSchemas", async () => {
    const register = await mkR4Register();
    const logger = mkSilentLogger();
    const base = registerFs(register, {
        url: "http://example.org/StructureDefinition/FlatBase",
        name: "FlatBase",
        kind: "resource",
        base: "DomainResource",
        elements: {
            component: {
                type: "BackboneElement",
                array: true,
                elements: {
                    code: { type: "code" },
                    detail: { type: "BackboneElement", elements: { value: { type: "string" } } },
                },
            },
        },
    });
    const profileA = registerFs(register, {
        url: "http://example.org/StructureDefinition/FlatProfileA",
        name: "FlatProfileA",
        kind: "resource",
        derivation: "constraint",
        base: base.url,
        required: ["component"],
        elements: {
            component: {
                elements: {
                    code: { fixed: { type: "code", value: "A" } },
                    detail: { elements: { value: { min: 1 } }, required: ["value"] },
                },
            },
        },
    });
    const profileB = registerFs(register, {
        url: "http://example.org/StructureDefinition/FlatProfileB",
        name: "FlatProfileB",
        kind: "resource",
        derivation: "constraint",
        base: base.url,
        elements: { component: { elements: { code: { fixed: { type: "code", value: "B" } } } } },
    });
    const inherited = registerFs(register, {
        url: "http://example.org/StructureDefinition/FlatInherited",
        name: "FlatInherited",
        kind: "resource",
        derivation: "constraint",
        base: profileA.url,
        elements: { component: { min: 1 } },
    });
    const derived = registerFs(register, {
        url: "http://example.org/StructureDefinition/FlatDerived",
        name: "FlatDerived",
        kind: "resource",
        derivation: "constraint",
        base: profileA.url,
        elements: { component: { elements: { code: { mustSupport: true } } } },
    });
    const translate = (fs: RichFHIRSchema) => transformFhirSchema(register, fs, logger);
    const nested = (fs: RichFHIRSchema, path = "component") => {
        const node = translate(fs)
            .filter((schema) => isNestedTypeSchema(schema) || isProfileNestedTypeSchema(schema))
            .find((node) => node.path.join(".") === path);
        if (!node) throw new Error(`Missing fixture nested type ${fs.url}#${path}`);
        return node;
    };

    it("returns the main schema and owned backbone types as peers with direct dependencies", () => {
        const schemas = translate(base);
        expect(schemas.map((schema) => String(schema.identifier.url))).toEqual([
            base.url,
            `${base.url}#component`,
            `${base.url}#component.detail`,
        ]);
        expect(schemas.every((schema) => !("nested" in schema))).toBeTrue();
        expect(nested(base)).toMatchObject({ declaredIn: { url: base.url }, path: ["component"] });
        expect("dependencies" in schemas[0]! && schemas[0].dependencies?.map((id) => String(id.url))).toContain(
            `${base.url}#component`,
        );
        expect("dependencies" in schemas[0]! && schemas[0].dependencies?.some((id) => id.name === "code")).toBeFalse();
        expect(nested(base).dependencies?.some((id) => id.name === "code")).toBeTrue();
    });

    it("keeps two profiles' constraints separate from each other and their structural base", () => {
        const schemas = [base, profileA, profileB].flatMap(translate);
        const index = mkIndex(schemas);
        const componentBase = index.resolve(nested(base).identifier)!;
        const componentA = index.resolve(nested(profileA).identifier)!;
        const componentB = index.resolve(nested(profileB).identifier)!;
        expect(componentA).toHaveProperty("identifier.url", `${profileA.url}#component`);
        expect(componentB).toHaveProperty("identifier.url", `${profileB.url}#component`);
        expect(componentA).toHaveProperty("fields.code.valueConstraint.value", "A");
        expect(componentB).toHaveProperty("fields.code.valueConstraint.value", "B");
        expect(componentBase).toHaveProperty("fields.code.valueConstraint", undefined);
        const reversed = mkIndex([...schemas].reverse());
        expect(reversed.resolve(componentA.identifier)).toEqual(componentA);
        expect(reversed.resolve(componentBase.identifier)).toEqual(componentBase);
    });

    it("does not manufacture constrained nodes when only the containing field's cardinality changes", () => {
        const cardinality = registerFs(register, {
            url: "http://example.org/StructureDefinition/FlatCardinality",
            name: "FlatCardinality",
            kind: "resource",
            derivation: "constraint",
            base: base.url,
            elements: { component: { min: 1 } },
        });
        const schemas = translate(cardinality);
        expect(schemas).toHaveLength(1);
        expect(schemas[0]).toHaveProperty("fields.component.type.url", `${base.url}#component`);
    });

    it("keeps recursive content references and dependency walks finite", () => {
        const parameters = register.resolveFs(
            { name: "hl7.fhir.r4.core", version: "4.0.1" },
            "http://hl7.org/fhir/StructureDefinition/Parameters" as CanonicalUrl,
        )!;
        const schemas = translate(parameters);
        const parameter = schemas.filter(isNestedTypeSchema)[0]!;
        expect(parameter).toHaveProperty("fields.part.type", parameter.identifier);
        // A self-reference remains on the field; it need not be a dependency edge.
        expect(parameter.dependencies?.some((id) => id.url === parameter.identifier.url)).toBeFalse();
        const index = mkIndex([{ ...parameter, dependencies: [parameter.identifier] }]);
        expect(index.reachableFrom([parameter.identifier, parameter.identifier])).toHaveLength(1);
    });

    it("rejects duplicate identities and missing dependency targets", () => {
        const schemas = translate(base);
        expect(() => mkIndex([...schemas, schemas[0]!])).toThrow("Duplicate schema");
        expect(() => mkIndex(schemas).reachableFrom([schemas[0]!.identifier])).toThrow("Schema not found");
    });

    it("preserves profile identities for lookups while selecting structural declarations for imports", () => {
        const schemas = [base, profileA, profileB, inherited, derived].flatMap(translate);
        const index = mkTypeSchemaIndex(schemas, { logger });
        const a = nested(profileA);
        if (!isProfileNestedTypeSchema(a)) throw new Error("Expected a profile's nested type");
        expect(index.resolveType(a.identifier)).toHaveProperty("fields.code.valueConstraint.value", "A");
        expect(index.resolveType(nested(profileB).identifier)).toHaveProperty("fields.code.valueConstraint.value", "B");
        expect(index.specializationOf(a.identifier)).toEqual(a.specialization);
        expect(index.findLastSpecializationByIdentifier(a.identifier)).toEqual(a.specialization);
    });

    it("generates the full package graph and follows profile and nested dependencies uniformly", async () => {
        const { schemas } = await generateTypeSchemas(register, undefined, logger);
        const index = mkIndex(schemas);
        const missing = schemas.flatMap((schema) =>
            ("dependencies" in schema ? (schema.dependencies ?? []) : [])
                // Existing external terminology placeholders have no generated definition.
                .filter((id) => id.package !== "missing_valuesets")
                .filter((id) => !index.resolve(id))
                .map((id) => `${schema.identifier.url} -> ${id.url} (${id.package}@${id.version})`),
        );
        expect(missing).toEqual([]);
        const root = translate(derived)[0]!;
        if (!isProfileTypeSchema(root)) throw new Error("Expected a profile root");
        const reachable = index.reachableFrom([root.identifier]);
        expect(reachable.some((schema) => schema.identifier.url === `${base.url}#component.detail`)).toBeTrue();
        expect(reachable.some((schema) => schema.identifier.url === `${profileB.url}#component`)).toBeFalse();
        expect(reachable.some((schema) => schema.identifier.name === "string")).toBeTrue();
        expect(index.profileNestedTypesOf(root.identifier)).toHaveLength(1);
    });

    it("drops unreachable nested nodes after selecting root fields", async () => {
        const { schemas } = await generateTypeSchemas(register, undefined, logger);
        const index = mkIndex(schemas);
        const shaked = treeShake(index, { mypackage: { [base.url]: { ignoreFields: ["component"] } } });
        const rootId = schemas.find((schema) => schema.identifier.url === base.url)!.identifier;
        expect(shaked.nestedTypesOf(rootId)).toEqual([]);
        expect(shaked.resolve(nested(base).identifier)).toBeUndefined();
        expect(index.resolve(nested(base).identifier)).toBeDefined();
    });

    it("walks the dependencies of a tree-shaken index", async () => {
        const { schemas } = await generateTypeSchemas(register, undefined, logger);
        const index = mkIndex(schemas);
        const shaked = treeShake(index, {
            "hl7.fhir.r4.core": { "http://hl7.org/fhir/StructureDefinition/Observation": {} },
        });
        const observation = shaked.collectResources().find((schema) => schema.identifier.name === "Observation");
        if (!observation) throw new Error("Expected Observation");
        // Tree shaking keeps Observation's bindings, but not their value sets.
        const reachable = shaked.reachableFrom([observation.identifier]);
        expect(reachable.filter(isBindingSchema)).not.toHaveLength(0);
        expect(reachable.filter(isValueSetTypeSchema)).toEqual([]);
        // Bindings to value sets missing from the packages (missing_valuesets) are leaves too.
        const resources = index.collectResources().map((schema) => schema.identifier);
        expect(() => index.reachableFrom(resources)).not.toThrow();
    });

    it("generates inherited profile factories using structural backbone declarations", async () => {
        const result = await new APIBuilder({ register, logger })
            .typeSchema({
                treeShake: {
                    mypackage: Object.fromEntries([profileA, profileB, inherited, derived].map((fs) => [fs.url, {}])),
                },
            })
            .typescript({ inMemoryOnly: true, generateProfile: true })
            .python({ inMemoryOnly: true, generateProfile: true, client: "none" })
            .generate();
        expect(result.success, JSON.stringify(result.errors)).toBeTrue();
        const ts = result.filesGenerated.typescript!;
        const py = result.filesGenerated.python!;
        for (const name of ["FlatProfileA", "FlatInherited", "FlatDerived"]) {
            const source = Object.entries(ts).find(([path]) => path.includes(`FlatBase_${name}.ts`))?.[1];
            expect(source).toBeDefined();
            expect(source).toContain("FlatBaseComponent");
            expect(source).not.toContain("FlatProfileAComponent");
        }
        const pythonProfile = Object.entries(py).find(([path]) => path.includes("flat_base_flat_profile_a.py"))?.[1];
        expect(pythonProfile).toContain("FlatBaseComponent");
        expect(pythonProfile).not.toContain("FlatProfileAComponent");
        const dir = fs.mkdtempSync(Path.join(os.tmpdir(), "flat-inherited-profile-"));
        try {
            for (const [path, source] of Object.entries(ts)) {
                const target = Path.join(dir, path);
                fs.mkdirSync(Path.dirname(target), { recursive: true });
                fs.writeFileSync(target, source);
            }
            fs.writeFileSync(
                Path.join(dir, "tsconfig.json"),
                JSON.stringify({
                    compilerOptions: {
                        strict: true,
                        module: "ESNext",
                        moduleResolution: "bundler",
                        target: "ES2022",
                        skipLibCheck: true,
                        noEmit: true,
                    },
                    include: ["generated/**/*.ts"],
                }),
            );
            const compile = spawnSync(
                process.execPath,
                [Bun.resolveSync("typescript/bin/tsc", import.meta.dir), "-p", dir],
                { encoding: "utf8", timeout: 20_000 },
            );
            expect(compile.status, `${compile.stdout}${compile.stderr}`).toBe(0);
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
