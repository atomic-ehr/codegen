import { describe, expect, it } from "bun:test";
import type { PFS } from "../../../../test/unit/typeschema/utils";
import { fs2ts, r4 } from "../../../../test/unit/typeschema/utils";

describe("Check hierarchy translation", () => {
  describe("Top level", () => {
    const A: PFS = {
      url: "A",
      elements: {
        foo: { type: "string", array: true },
      },
    };
    it("Base", async () => {
      expect(await fs2ts(r4, A)).toMatchObject([
        {
          identifier: { url: "A" },
          fields: {
            foo: {
              type: { name: "string" },
              excluded: false,
              array: true,
              required: false,
            },
          },
          dependencies: [{ name: "string" }],
        },
      ]);
    });
  });

  it.todo("A + min cardinality + new field", async () => {
    const B: PFS = {
      base: "A",
      url: "B",
      required: ["foo"],
      elements: {
        foo: { min: 1 },
        bar: { type: "code" },
      },
    };

    expect(await fs2ts(r4, B)).toMatchObject([
      {
        identifier: { url: "B" },
        base: { url: "A" },
        fields: {
          foo: {
            type: { name: "string" },
            required: true,
            excluded: false,
            array: true,
            min: 1,
          },
          bar: {
            excluded: false,
            type: { name: "code" },
            array: false,
            required: false,
          },
        },
        dependencies: [{ name: "code" }, { name: "string" }, null],
      },
    ]);
  });

  describe("Choice type translation", () => {
    const C: PFS = {
      base: "B",
      url: "C",
      required: ["bar", "baz"],
      elements: {
        foo: { max: 2 },
        baz: { type: "string" },
      },
    };
    it.todo("Check optional choice fields", async () => {
      expect(await fs2ts(r4, A)).toMatchObject([
        {
          identifier: { url: "C" },
          base: { url: "B" },
          fields: {
            foo: {
              excluded: false,
              type: { name: "string" },
              array: true,
              min: 1,
              max: 2,
              required: true,
            },
            baz: {
              excluded: false,
              type: { name: "string" },
              array: false,
              required: true,
            },
            bar: null,
          },
          dependencies: [
            {
              kind: "primitive-type",
              package: "hl7.fhir.r4.core",
              version: "4.0.1",
              name: "string",
              url: "http://hl7.org/fhir/StructureDefinition/string",
            },
          ],
        },
        null,
      ]);
    });
  });
});
