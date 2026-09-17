import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger, mkR4Register, type PFS, registerFs } from "@typeschema-test/utils";

// One complex extension applied at two element paths. The transformer keys extensions by
// `${url}:${path}`, so the profile carries two entries sharing `ext.name` — the accessors are
// collision-resolved to `getNoted` / `getContactNoted`, and the types the accessors return
// have to follow the same resolution or the module declares one name twice (TS2300).
//
// Cannot be an example test: non-compiling generated code would fail the project typecheck
// for everyone, so the defect is pinned here on the emitted text instead.

const pkg = { name: "mypackage", version: "0.0.0" };
const NOTED_URL = "http://example.org/StructureDefinition/noted";

const notedExtension: PFS = {
    description: "Complex extension with two sub-extension slices",
    derivation: "constraint",
    type: "Extension",
    name: "NotedExtension",
    kind: "complex-type",
    url: NOTED_URL,
    base: "http://hl7.org/fhir/StructureDefinition/Extension",
    package_meta: pkg,
    elements: {
        extension: {
            slicing: {
                slices: {
                    note: { min: 1, max: 1, match: { url: "note" }, schema: { elements: { valueString: {} } } },
                    detail: { min: 0, max: 1, match: { url: "detail" }, schema: { elements: { valueString: {} } } },
                },
            },
        },
    },
};

const dualNotedPatient: PFS = {
    description: "Patient carrying the same complex extension at two element paths",
    derivation: "constraint",
    type: "Patient",
    name: "DualNotedPatient",
    kind: "resource",
    url: "http://example.org/StructureDefinition/dual-noted-patient",
    base: "http://hl7.org/fhir/StructureDefinition/Patient",
    package_meta: pkg,
    extensions: { noted: { url: NOTED_URL, min: 0, max: 1 } },
    elements: {
        contact: {
            extensions: { noted: { url: NOTED_URL, min: 0, max: 1 } },
        },
    },
};

describe("complex extension applied at two paths", async () => {
    const register = await mkR4Register();
    registerFs(register, notedExtension);
    registerFs(register, dualNotedPatient);

    const result = await new APIBuilder({ register, logger: mkErrorLogger() })
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .generate();
    const files = result.filesGenerated.typescript ?? {};
    const found = Object.entries(files).find(([path]) => path.endsWith("profiles/Patient_DualNotedPatient.ts"));
    if (!found) throw new Error("No generated file matching '*profiles/Patient_DualNotedPatient.ts'");
    const generated = found[1];

    const declaredTypeNames = generated.split("\n").flatMap((line) => line.match(/^export type (\w+)/)?.[1] ?? []);

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("declares every exported type exactly once", () => {
        const duplicates = declaredTypeNames.filter((name, i) => declaredTypeNames.indexOf(name) !== i);
        expect(duplicates).toEqual([]);
    });

    it("names the getter return types from the resolved accessor name", () => {
        expect(declaredTypeNames).toContain("DualNotedPatient_NotedExtracted");
        expect(declaredTypeNames).toContain("DualNotedPatient_NotedVFlat");
        expect(declaredTypeNames).toContain("DualNotedPatient_ContactNotedExtracted");
        expect(declaredTypeNames).toContain("DualNotedPatient_ContactNotedVFlat");
    });

    it("each getter returns the type named after it", () => {
        expect(generated).toContain("public getNoted(mode: 'flat'): DualNotedPatient_NotedExtracted | undefined;");
        expect(generated).toContain("public getNoted(mode: 'vflat'): DualNotedPatient_NotedVFlat | undefined;");
        expect(generated).toContain(
            "public getContactNoted(mode: 'flat'): DualNotedPatient_ContactNotedExtracted | undefined;",
        );
        expect(generated).toContain(
            "public getContactNoted(mode: 'vflat'): DualNotedPatient_ContactNotedVFlat | undefined;",
        );
    });
});
