import { afterAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";
import ts from "typescript";
import * as helpers from "../../../assets/api/writer-generator/typescript/profile-helpers";

const IMPORT_STATEMENT_RE = /import[\s\S]*?from\s+["'][^"']+["'];/g;
const EXPORT_KEYWORD_RE = /export /g;

const EXTENSION_URL = "http://example.test/StructureDefinition/noted-complex-extension";

/**
 * `NotedComplexExtension` is a complex extension with a required ordinary field
 * (`Extension.id`, min 1) beside its sub-extension slices, and `NotedPatient`
 * carries it as an extension slice — so the generated extension module and the
 * parent's accessors are both exercised.
 */
describe("Complex extension flat contract", async () => {
    const result = await new APIBuilder({ logger: mkSilentLogger() })
        .localStructureDefinitions({
            package: { name: "example.test.flatcontract", version: "0.1.0" },
            path: Path.join(__dirname, "../../assets/profile-extension-flat-contract"),
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .typeSchema({
            treeShake: {
                "example.test.flatcontract": {
                    "http://example.test/StructureDefinition/noted-patient": {},
                    [EXTENSION_URL]: {},
                },
            },
        })
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();
    if (!result.success) throw new Error("Profile generation failed");
    const files = result.filesGenerated.typescript ?? {};
    const find = (suffix: string) => {
        const path = Object.keys(files).find((key) => key.endsWith(suffix));
        if (!path) throw new Error(`Generated ${suffix} is missing`);
        return path;
    };
    const extensionPath = find("Extension_NotedComplexExtension.ts");
    const patientPath = find("Patient_NotedPatient.ts");
    const extensionSource = files[extensionPath] ?? "";
    const patientSource = files[patientPath] ?? "";

    const output = await mkdtemp(Path.join(tmpdir(), "extension-flat-contract-"));
    afterAll(() => rm(output, { recursive: true, force: true }));
    for (const [path, content] of Object.entries(files)) {
        const destination = Path.join(output, path);
        await mkdir(Path.dirname(destination), { recursive: true });
        await writeFile(destination, content);
    }

    const typecheck = (): string[] => {
        const program = ts.createProgram([Path.join(output, extensionPath), Path.join(output, patientPath)], {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.Preserve,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowImportingTsExtensions: true,
            types: [],
        });
        return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
    };

    const instantiate = (source: string, className: string) => {
        const javascript = new Bun.Transpiler({ loader: "ts" })
            .transformSync(source.replace(IMPORT_STATEMENT_RE, ""))
            .replace(EXPORT_KEYWORD_RE, "");
        return new Function(...Object.keys(helpers), `${javascript}; return ${className};`)(...Object.values(helpers));
    };

    it("captures the generated extension module", () => {
        expect(extensionSource).toMatchSnapshot();
    });

    // The flat input now carries the required ordinary field the factory assigns.
    it("typechecks", () => {
        expect(typecheck()).toEqual([]);
    });

    // The parent's flat getter is typed with that same flat type while
    // extraction only ever fills sub-extension values, so every member the type
    // declares as required can be absent — now including the ordinary field.
    it("returns a flat value missing the members its type declares as required", () => {
        const NotedPatient = instantiate(patientSource, "NotedPatientProfile");
        const patient = NotedPatient.apply({
            resourceType: "Patient",
            extension: [{ url: EXTENSION_URL, id: "note-1", extension: [{ url: "detail", valueString: "d" }] }],
        });

        const flat = patient.getNoted();
        expect(flat).toEqual({ detail: "d" });
        expect(flat.note).toBeUndefined();
        expect(flat.id).toBeUndefined();
    });
});
