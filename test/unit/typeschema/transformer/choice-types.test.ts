import { describe, expect, it } from "bun:test";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type { PFS } from "@typeschema-test/utils";
import { fs2ts, mkR4Register } from "@typeschema-test/utils";

describe("TypeSchema Transformer Core Logic", async () => {
    const r4 = await mkR4Register();

    describe("Choice type translation", () => {
        it("Check optional choice fields", async () => {
            const fs: PFS = {
                url: "OptionalChoice",
                kind: "resource",
                elements: {
                    deceasedDateTime: {
                        type: "dateTime",
                        choiceOf: "deceased",
                    },
                    deceasedBoolean: {
                        type: "boolean",
                    },
                    deceased: {
                        choices: ["deceasedBoolean", "deceasedDateTime"],
                    },
                },
            };
            r4.appendFS(fs as FHIRSchema);
            expect(await fs2ts(r4, fs)).toMatchObject([
                {
                    identifier: {
                        kind: "resource",
                        url: "OptionalChoice",
                    },
                    fields: {
                        deceased: {
                            excluded: false,
                            choices: ["deceasedBoolean", "deceasedDateTime"],
                            array: false,
                            required: false,
                        },
                        deceasedBoolean: {
                            excluded: false,
                            type: { name: "boolean" },
                            array: false,
                            required: false,
                        },
                        deceasedDateTime: {
                            excluded: false,
                            type: { name: "dateTime" },
                            array: false,
                            required: false,
                        },
                    },
                    dependencies: [
                        { name: "boolean" },
                        {
                            name: "dateTime",
                        },
                    ],
                },
            ]);
        });

        it("Check required choice fields", async () => {
            const fs: PFS = {
                url: "RequiredChoice",
                kind: "resource",
                required: ["deceased"],
                elements: {
                    deceased: {
                        choices: ["deceasedBoolean", "deceasedDateTime"],
                    },
                    deceasedDateTime: {
                        choiceOf: "deceased",
                        type: "dateTime",
                    },
                    deceasedBoolean: {
                        choiceOf: "deceased",
                        type: "boolean",
                    },
                },
            };
            r4.appendFS(fs as FHIRSchema);
            expect(await fs2ts(r4, fs)).toMatchObject([
                {
                    identifier: {
                        url: "RequiredChoice",
                    },
                    fields: {
                        deceased: {
                            excluded: false,
                            choices: ["deceasedBoolean", "deceasedDateTime"],
                            array: false,
                            required: true,
                        },
                        deceasedDateTime: {
                            choiceOf: "deceased",
                            type: { name: "dateTime" },
                            excluded: false,
                            array: false,
                            required: false,
                        },
                        deceasedBoolean: {
                            choiceOf: "deceased",

                            type: { name: "boolean" },
                            excluded: false,
                            array: false,
                            required: false,
                        },
                    },
                    dependencies: [{ name: "boolean" }, { name: "dateTime" }],
                },
            ]);
        });

        it.todo("Check choice field with limited options in children", async () => {
            const fs: PFS = {
                url: "RequiredChoiceLimited",
                base: "RequiredChoice",
                kind: "resource",
                required: ["deceased"],
                elements: {
                    deceased: {
                        choices: ["deceasedBoolean"],
                    },
                    deceasedBoolean: {
                        choiceOf: "deceased",
                        type: "boolean",
                    },
                },
            };

            expect(await fs2ts(r4, fs)).toMatchObject([
                {
                    identifier: { kind: "resource", url: "RequiredChoiceLimited" },
                    base: { name: "RequiredChoice" },
                    fields: {
                        deceased: {
                            choices: ["deceasedBoolean"],
                            excluded: false,
                            array: false,
                            required: true,
                        },
                        deceasedBoolean: {
                            choiceOf: "deceased",
                            type: { name: "boolean" },
                            excluded: false,
                            array: false,
                            required: false,
                        },
                    },
                    dependencies: [{ name: "boolean" }, { name: "RequiredChoice" }],
                },
            ]);
        });

        it.todo("Limit choice types without instance repetition", async () => {
            const fs: PFS = {
                url: "RequiredChoiceLimited",
                base: "RequiredChoice",
                kind: "resource",
                required: ["deceased"],
                elements: {
                    deceased: {
                        choices: ["deceasedBoolean"],
                    },
                },
            };

            expect(await fs2ts(r4, fs)).toMatchObject([
                {
                    identifier: { kind: "resource", url: "RequiredChoiceLimited" },
                    base: { name: "RequiredChoice" },
                    fields: {
                        deceased: {
                            choices: ["deceasedBoolean"],
                            excluded: false,
                            array: false,
                            required: true,
                        },
                        deceasedBoolean: {
                            choiceOf: "deceased",
                            type: { name: "boolean" },
                            excluded: false,
                            array: false,
                            required: false,
                        },
                    },
                    dependencies: [{ name: "boolean" }, { name: "RequiredChoice" }],
                },
            ]);
        });
    });
});
