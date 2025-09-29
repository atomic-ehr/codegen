import { describe, expect, it } from "bun:test";
import type { PFS } from "@typeschema-test/utils";
import { fs2ts, mkR4Register } from "@typeschema-test/utils";

describe("TypeSchema Transformer Core Logic", () => {
  const A: PFS = {
    url: "A",
    derivation: "specialization",
    name: "a",
    elements: {
      foo: {
        type: "BackboneElement",
        elements: {
          bar: { type: "string" },
        },
      },
    },
  };

  it.todo("Check optional choice fields", async () => {
    expect(await fs2ts(mkR4Register, A)).toMatchObject([
      {
        identifier: { kind: "resource", name: "a", url: "A" },
        fields: {
          foo: { type: { kind: "nested", name: "foo", url: "A#foo" } },
        },
        nested: [
          {
            identifier: { kind: "nested", name: "foo", url: "A#foo" },
            base: {
              kind: "complex-type",
              name: "BackboneElement",
              url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
            },
            fields: {
              bar: {
                type: {
                  kind: "primitive-type",
                  name: "string",
                  url: "http://hl7.org/fhir/StructureDefinition/string",
                },
              },
            },
          },
        ],
        dependencies: [
          {
            kind: "complex-type",
            name: "BackboneElement",
            url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
          },
          {
            kind: "primitive-type",
            name: "string",
            url: "http://hl7.org/fhir/StructureDefinition/string",
          },
          null,
        ],
      },
      null,
    ]);
  });

  const B: PFS = {
    base: "A",
    url: "B",
    name: "b",
    derivation: "constraint",
    elements: { foo: { min: 1 } },
  };

  it.todo("Check optional choice fields", async () => {
    expect(await fs2ts(mkR4Register, A)).toMatchObject([
      {
        identifier: { kind: "constraint", name: "b", url: "B" },
        base: { kind: "resource", name: "a", url: "A" },
        fields: {
          foo: { type: { kind: "nested", name: "foo", url: "A#foo" } },
        },
        nested: "nil?",
        dependencies: [
          { kind: "resource", name: "a", url: "A" },
          { kind: "nested", name: "foo", url: "A#foo" },
          null,
        ],
      },
      null,
    ]);
  });

  const C: PFS = {
    base: "B",
    url: "C",
    name: "c",
    derivation: "constraint",
    elements: { foo: { max: 1 } },
  };

  describe("Choice type translation", () => {
    it.todo("Check optional choice fields", async () => {
      expect(await fs2ts(mkR4Register, A)).toMatchObject([
        {
          identifier: { kind: "constraint", name: "c", url: "C" },
          base: { kind: "constraint", name: "b", url: "B" },
          fields: {
            foo: { type: { kind: "nested", name: "foo", url: "A#foo" } },
          },
          nested: "nil?",
          dependencies: [
            { kind: "constraint", name: "b", url: "B" },
            { kind: "nested", name: "foo", url: "A#foo" },
            null,
          ],
        },
        null,
      ]);
    });
  });
});
