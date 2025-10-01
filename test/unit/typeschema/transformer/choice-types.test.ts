import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { mkR4Register, registerFsAndMkTs } from "@typeschema-test/utils";

describe("TypeSchema choice type generation", async () => {
    const r4 = await mkR4Register();

    it("Simple choice type generation (optional)", async () => {
        const fs: PFS = {
            url: "uri::OptionalChoice",
            kind: "resource",
            elements: {
                deceased: { choices: ["deceasedBoolean", "deceasedDateTime"] },
                deceasedDateTime: { type: "dateTime", choiceOf: "deceased" },
                deceasedBoolean: { type: "boolean" },
            },
        };
        expect(await registerFsAndMkTs(r4, fs)).toMatchObject([
            {
                identifier: { kind: "resource", url: "uri::OptionalChoice" },
                fields: {
                    deceased: {
                        choices: ["deceasedBoolean", "deceasedDateTime"],
                        excluded: false,
                        array: false,
                        required: false,
                    },
                    deceasedBoolean: {
                        type: { name: "boolean" },
                        excluded: false,
                        array: false,
                        required: false,
                    },
                    deceasedDateTime: {
                        type: { name: "dateTime" },
                        excluded: false,
                        array: false,
                        required: false,
                    },
                },
                dependencies: [{ name: "boolean" }, { name: "dateTime" }],
            },
        ]);
    });

    it("Simple choice type generation (required)", async () => {
        const fs: PFS = {
            url: "uri::RequiredChoice",
            kind: "resource",
            required: ["deceased"],
            elements: {
                deceased: { choices: ["deceasedBoolean", "deceasedDateTime"] },
                deceasedDateTime: { choiceOf: "deceased", type: "dateTime" },
                deceasedBoolean: { choiceOf: "deceased", type: "boolean" },
            },
        };
        expect(await registerFsAndMkTs(r4, fs)).toMatchObject([
            {
                identifier: { url: "uri::RequiredChoice" },
                fields: {
                    deceased: {
                        choices: ["deceasedBoolean", "deceasedDateTime"],
                        excluded: false,
                        array: false,
                        required: true,
                    },
                    deceasedDateTime: {
                        type: { name: "dateTime" },
                        choiceOf: "deceased",
                        excluded: false,
                        array: false,
                        required: false,
                    },
                    deceasedBoolean: {
                        type: { name: "boolean" },
                        choiceOf: "deceased",
                        excluded: false,
                        array: false,
                        required: false,
                    },
                },
                nested: undefined,
                dependencies: [{ name: "boolean" }, { name: "dateTime" }],
            },
        ]);
    });

    it("Limit choice type in required field", async () => {
        const fs: PFS = {
            url: "uri::RequiredChoiceLimited",
            base: "uri::RequiredChoice",
            kind: "resource",
            required: ["deceased"],
            elements: {
                deceased: { choices: ["deceasedBoolean"] },
                deceasedBoolean: { choiceOf: "deceased", type: "boolean" },
            },
        };

        expect(await registerFsAndMkTs(r4, fs)).toMatchObject([
            {
                identifier: { kind: "resource", url: "uri::RequiredChoiceLimited" },
                base: { url: "uri::RequiredChoice" },
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
                dependencies: [{ name: "boolean" }, { name: "uri::RequiredChoice" }],
            },
        ]);
    });

    it("Limit choice type in required field without instance mention", async () => {
        const fs: PFS = {
            url: "uri::RequiredChoiceLimited",
            base: "uri::RequiredChoice",
            kind: "resource",
            required: ["deceased"],
            elements: {
                deceased: { choices: ["deceasedBoolean"] },
            },
        };

        expect(await registerFsAndMkTs(r4, fs)).toMatchObject([
            {
                identifier: { kind: "resource", url: "uri::RequiredChoiceLimited" },
                base: { url: "uri::RequiredChoice" },
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
                dependencies: [{ name: "boolean" }, { name: "uri::RequiredChoice" }],
            },
        ]);
    });
});
