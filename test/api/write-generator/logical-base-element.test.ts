import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { mkR4Register, mkSilentLogger, type PFS, registerFs, registerFsAndMkTs } from "@typeschema-test/utils";

const PACKAGE = "example.org";
const DOCUMENT_URL = "http://example.org/StructureDefinition/BaseElementDocument" as CanonicalUrl;

/**
 * R4 ships no `StructureDefinition-Base`. `part` carries sub-elements — the shape published
 * packages use (`EN.item`, `AD.item`, `AssignedEntity.sdtcPatient` in `hl7.cda.uv.core`);
 * `extension` is a leaf, with nothing to derive a type from.
 */
const document: PFS = {
    base: "http://hl7.org/fhir/StructureDefinition/Base|4.0.1",
    url: DOCUMENT_URL,
    name: "BaseElementDocument",
    kind: "logical",
    derivation: "specialization",
    package_meta: { name: PACKAGE, version: "0.0.1" },
    elements: {
        title: { type: "string" },
        extension: { type: "Base" },
        part: { type: "Base", elements: { label: { type: "string" } } },
    },
};

const mkRegister = async () => {
    const register = await mkR4Register();
    registerFs(register, document);
    return register;
};

/** One snapshottable string either way, so a failing run stays comparable to one that emits. */
const generatedTypeScript = async (file: string): Promise<string> => {
    try {
        const result = await new APIBuilder({ register: await mkRegister(), logger: mkSilentLogger() })
            .typeSchema({ promoteLogical: { [PACKAGE]: [DOCUMENT_URL] } })
            .typescript({ inMemoryOnly: true })
            .generate();
        return result.filesGenerated.typescript?.[file] ?? `NOT GENERATED\n${(result.errors ?? []).join("\n")}`;
    } catch (error) {
        return `THREW\n${(error as Error).message}`;
    }
};

describe("a logical model with elements typed as the virtual R4 Base", () => {
    it("the transformed TypeSchema", async () => {
        const outcome = await registerFsAndMkTs(await mkRegister(), document, mkSilentLogger()).catch(
            (error: unknown) => `THREW\n${(error as Error).message}`,
        );
        expect(outcome).toMatchSnapshot();
    });

    it("the generated TypeScript module", async () => {
        expect(await generatedTypeScript("generated/types/example-org/BaseElementDocument.ts")).toMatchSnapshot();
    });
});
