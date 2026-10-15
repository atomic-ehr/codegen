import { describe, expect, test } from "bun:test";
import { createImportRenderer, pyImportFrom } from "@root/api/writer-generator/python/imports";
import { Python } from "@root/api/writer-generator/python/writer";
import { mkCodegenLogger } from "@root/utils/log";

const generate = (emit: (writer: Python) => void): string => {
    const writer = new Python({
        outputDir: "generated",
        inMemoryOnly: true,
        rootPackageName: "fhir_types",
        fieldFormat: "snake_case",
        client: "none",
        tabSize: 4,
        commentLinePrefix: "#",
        logger: mkCodegenLogger({ level: "ERROR" }),
    });
    writer.cd("/", () => writer.cat("imports.py", () => emit(writer)));
    return writer.writtenFiles()[0]!.content;
};

describe("Python import renderer", () => {
    test("merges reachable section imports and groups libraries, generated modules, and relative imports", () => {
        const module = generate((w) => {
            const render = createImportRenderer(w);
            const typing = w.section<never, string>({
                name: (key) => key,
                render: (_definitions, usages) => render("typing", ...usages.map(({ key }) => key)),
            });
            const helpers = w.section<never, string>({
                name: (key) => key,
                render: (_definitions, usages) => render("fhir_types.profile_helpers", ...usages.map(({ key }) => key)),
            });
            render(".profiles", "ExampleProfile");
            render("typing", "List as PyList");
            render("pydantic", "Field");
            render("typing", "Any");
            typing.use("Unused");
            w.line();
            w.line(`value: ${typing.use("Any")} = ${helpers.use("build_resource")}()`);
        });
        expect(module).toBe(
            "from typing import Any\n" +
                "from typing import List as PyList\n\n" +
                "from pydantic import Field\n\n" +
                "from fhir_types.profile_helpers import build_resource\n\n" +
                "from .profiles import ExampleProfile\n\n" +
                "value: Any = build_resource()\n",
        );
    });

    test("wraps imports at 88 columns with one name per line and trailing commas", () => {
        const module = generate((w) => {
            pyImportFrom(
                w,
                "fhir_types.hl7_fhir_r4_core.base",
                "CodeableConcept",
                "BackboneElement",
                "Annotation",
                "Identifier",
            );
        });
        expect(module).toBe(
            "from fhir_types.hl7_fhir_r4_core.base import (\n" +
                "    Annotation,\n    BackboneElement,\n    CodeableConcept,\n    Identifier,\n)\n",
        );
    });

    test("wraps a single long imported name and keeps each alias separate", () => {
        const module = generate((w) => {
            pyImportFrom(
                w,
                "fhir_types.hl7_fhir_us_core.profiles.extension_uscore_interpreter_needed_extension",
                "UscoreInterpreterNeededExtension",
            );
            pyImportFrom(w, "typing", "Literal", "List as PyList", "Any as Any_1");
        });
        expect(module).toContain(
            "extension_uscore_interpreter_needed_extension import (\n    UscoreInterpreterNeededExtension,\n)",
        );
        expect(module).toContain(
            "from typing import Literal\nfrom typing import Any as Any_1\nfrom typing import List as PyList\n",
        );
    });
});
