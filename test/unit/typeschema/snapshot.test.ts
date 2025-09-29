import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { fs2ts, r4 } from "@typeschema-test/utils";

describe("Type Schema generation from ValueSet", async () => {
  it.todo("administrative-gender", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/value-sets/administrative-gender.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("all-languages", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/value-sets/all-languages.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("marital-status", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/value-sets/marital-status.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });
});

describe("Type Schema generation from FHIR Schema", async () => {
  it.todo("with cardinality", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/with-cardinality.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("with resource with string", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/resource-with-string.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("with resource with code", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/resource-with-code.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("with resource with codable concept", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/resource-with-codable-concept.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("with resource with choice", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/resource-with-choice.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("with resource with nested type", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/resource-with-nested-type.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  it.todo("with resource with nested type 2", async () => {
    const fs: PFS = await Bun.file(
      "test/asserts/fhir-schemas/resource-with-nested-type-2.fs.json",
    ).json();
    const ts = await fs2ts(r4, fs);
    expect(ts).toMatchSnapshot();
  });

  describe("Custom resource", async () => {
    it.todo("TutorNotification", async () => {
      const fs: PFS = await Bun.file(
        "test/asserts/fhir-schemas/TutorNotification.fs.json",
      ).json();
      const ts = await fs2ts(r4, fs);
      expect(ts).toMatchSnapshot();
    });

    it.todo("TutorNotificationTemplate", async () => {
      const fs: PFS = await Bun.file(
        "test/asserts/fhir-schemas/TutorNotificationTemplate.fs.json",
      ).json();
      const ts = await fs2ts(r4, fs);
      expect(ts).toMatchSnapshot();
    });
  });

  describe("Real world examples", async () => {
    it.todo("coding primitive type", async () => {
      const fs: PFS = await Bun.file(
        "test/asserts/fhir-schemas/coding.fs.json",
      ).json();
      const ts = await fs2ts(r4, fs);
      expect(ts).toMatchSnapshot();
    });

    it.todo("string primitive type", async () => {
      const fs: PFS = await Bun.file(
        "test/asserts/fhir-schemas/string.fs.json",
      ).json();
      const ts = await fs2ts(r4, fs);
      expect(ts).toMatchSnapshot();
    });
  });
});
