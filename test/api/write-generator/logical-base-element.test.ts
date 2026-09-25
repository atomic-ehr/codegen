import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { mkR4Register, mkSilentLogger, type PFS, registerFs, registerFsAndMkTs } from "@typeschema-test/utils";

const PACKAGE = "example.org";
const DOCUMENT_URL = "http://example.org/StructureDefinition/BaseElementDocument" as CanonicalUrl;

/**
 * A logical model whose elements are typed as the virtual R4 `Base`, in both shapes it occurs in:
 *
 * - `part` carries sub-elements, so it becomes a nested type. This is the shape published
 *   packages actually use — `EN.item`, `AD.item` and `AssignedEntity.sdtcPatient` in
 *   `hl7.cda.uv.core` are all of it.
 * - `extension` is a leaf, so there is nothing to derive a type from.
 *
 * R4 ships no `StructureDefinition-Base` (it is the virtual root; R5 publishes it as a real
 * abstract complex-type), so neither shape resolves against an R4-only closure.
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

/** Generation outcome as one snapshottable string, so a run that fails is comparable to one that emits. */
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
