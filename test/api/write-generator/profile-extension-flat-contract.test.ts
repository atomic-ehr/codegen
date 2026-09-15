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

    // The getter is typed as the extraction shape, so members it may not
    // populate are optional and the ordinary field it never populates is gone.
    it("types the flat getter as what extraction can actually produce", async () => {
        const consumer = Path.join(output, "consumer.ts");
        await writeFile(
            consumer,
            `import { NotedPatientProfile } from ${JSON.stringify(Path.join(output, patientPath))};
import { NotedComplexExtensionProfile } from ${JSON.stringify(Path.join(output, extensionPath))};

const patient = NotedPatientProfile.apply({ resourceType: "Patient" });
const flat = patient.getNoted();
// @ts-expect-error extraction never populates the ordinary field
void flat?.id;
// @ts-expect-error a member extraction may not populate is optional
const _note: string = flat!.note;
void flat?.note?.trim();
// the factory input is unchanged and still requires both members
NotedComplexExtensionProfile.createResource({ id: "n1", note: "hello" });
patient.setNoted(NotedComplexExtensionProfile.createResource({ id: "n1", note: "hello" }));
`,
        );
        const program = ts.createProgram([consumer], {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            target: ts.ScriptTarget.ESNext,
            module: ts.ModuleKind.Preserve,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            allowImportingTsExtensions: true,
            types: [],
        });
        expect(
            ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, " ")),
        ).toEqual([]);
    });

    it("returns only the sub-extension values extraction could find", () => {
        const NotedPatient = instantiate(patientSource, "NotedPatientProfile");
        const patient = NotedPatient.apply({
            resourceType: "Patient",
            extension: [{ url: EXTENSION_URL, id: "note-1", extension: [{ url: "detail", valueString: "d" }] }],
        });

        expect(patient.getNoted()).toEqual({ detail: "d" });
    });
});
