import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { mkR4Register, mkSilentLogger, type PFS, registerFs } from "@typeschema-test/utils";

const PACKAGE = "example.org";
const DOCUMENT_URL = "http://example.org/StructureDefinition/Document" as CanonicalUrl;

/**
 * A logical model specializing the FHIR `Base` canonical, promoted to a resource.
 *
 * R4 does not ship `StructureDefinition-Base.json` — `Base` is a virtual root —
 * so the model is transformed as rootless (`base: nil`; pinned by
 * `test/unit/typeschema/transformer/logical-base.test.ts`). The emitted class
 * therefore has no base to inherit from, and none is injected either: the
 * injection is keyed on the canonical being `resource` or `element`, and this is
 * neither.
 *
 * The class still gets a full pydantic body, so without a model root
 * `model_config` and every `Field(...)` would be inert class attributes:
 *
 *     Document(title="x")        TypeError: Document() takes no arguments
 *     Document().model_dump()    AttributeError: no attribute 'model_dump'
 *     Document.title             a bare FieldInfo
 *
 * The writer falls back to the pydantic root whenever nothing else supplies one.
 */
describe("Python logical model promoted from a virtual FHIR Base", async () => {
    const register = await mkR4Register();
    const document: PFS = {
        base: "http://hl7.org/fhir/StructureDefinition/Base",
        url: DOCUMENT_URL,
        name: "Document",
        kind: "logical",
        derivation: "specialization",
        package_meta: { name: PACKAGE, version: "0.0.1" },
        elements: { title: { type: "string" } },
    };
    registerFs(register, document);

    const result = await new APIBuilder({ register, logger: mkSilentLogger() })
        .typeSchema({ promoteLogical: { [PACKAGE]: [DOCUMENT_URL] } })
        .python({ inMemoryOnly: true, client: "none" })
        .generate();

    const documentPy = result.filesGenerated.python?.["generated/example_org/document.py"];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(documentPy).toBeDefined();
    });

    it("falls back to the pydantic root", () => {
        expect(documentPy).toContain("class Document(BaseModel):");
        expect(documentPy).not.toContain("class Document():");
    });

    it("matches snapshot", () => {
        expect(documentPy).toMatchSnapshot();
    });
});
