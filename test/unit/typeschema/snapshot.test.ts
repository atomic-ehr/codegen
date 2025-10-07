import { describe, expect, it } from "bun:test";
import type { PFS, PVS } from "@typeschema-test/utils";
import { mkR4Register, registerFsAndMkTs, transformVS } from "@typeschema-test/utils";

const r4 = await mkR4Register();

describe("ValueSet to Type Schema (snapshot)", async () => {
    it("administrative-gender", async () => {
        const fs: PVS = await Bun.file("test/assets/value-sets/administrative-gender.json").json();
        const ts = await transformVS(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("all-languages", async () => {
        const fs: PVS = await Bun.file("test/assets/value-sets/all-languages.json").json();
        const ts = await transformVS(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("marital-status", async () => {
        const fs: PVS = await Bun.file("test/assets/value-sets/marital-status.json").json();
        const ts = await transformVS(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });
});

describe("FHIR Schema to Type Schema (snapshot)", async () => {
    it("with cardinality", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/with-cardinality.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("with resource with string", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/resource-with-string.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("with resource with code", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/resource-with-code.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("with resource with codable concept", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/resource-with-codable-concept.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("with resource with choice", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/resource-with-choice.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("with resource with nested type", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/resource-with-nested-type.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    it("with resource with nested type 2", async () => {
        const fs: PFS = await Bun.file("test/assets/fhir-schemas/resource-with-nested-type-2.fs.json").json();
        const ts = await registerFsAndMkTs(r4, fs);
        expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
    });

    describe("Real world examples", async () => {
        it("coding primitive type", async () => {
            const fs: PFS = await Bun.file("test/assets/fhir-schemas/coding.fs.json").json();
            const ts = await registerFsAndMkTs(r4, fs);
            expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
        });

        it("string primitive type", async () => {
            const fs: PFS = await Bun.file("test/assets/fhir-schemas/string.fs.json").json();
            const ts = await registerFsAndMkTs(r4, fs);
            expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
        });
    });

    describe("Custom resource", async () => {
        it("TutorNotificationTemplate", async () => {
            const fs: PFS = await Bun.file("test/assets/fhir-schemas/TutorNotificationTemplate.fs.json").json();
            const ts = await registerFsAndMkTs(r4, fs);
            expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
        });
        it("TutorNotification", async () => {
            const fs: PFS = await Bun.file("test/assets/fhir-schemas/TutorNotification.fs.json").json();
            const ts = await registerFsAndMkTs(r4, fs);
            expect(JSON.stringify(ts, null, 2)).toMatchSnapshot();
        });
    });
});
