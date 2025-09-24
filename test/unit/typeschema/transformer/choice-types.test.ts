import { describe, expect, it, beforeEach } from "bun:test";
import { transformFHIRSchema } from "../../../../src/typeschema/core/transformer";
import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type { TypeSchema, PackageInfo } from "../../../../src/typeschema/types";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";

type FS = Partial<FHIRSchema>;

describe("TypeSchema Transformer Core Logic", () => {
  const manager = CanonicalManager({
    packages: ["hl7.fhir.r4.core@4.0.1"],
    workingDir: "tmp/fhir",
  });
  const packageInfo: PackageInfo = { name: "test.package", version: "1.0.0" };
  const fs2ts = async (fs: FS) => {
    return await transformFHIRSchema(manager, fs as FHIRSchema, packageInfo);
  };

  describe("Choice type translation", () => {
    it("Check optional choice fields", async () => {
      const fs: FS = {
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
      expect(await fs2ts(fs)).toMatchObject([
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
      const fs: FS = {
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
      expect(await fs2ts(fs)).toMatchObject([
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

    it("Check choice field with limited options in children", async () => {
      const fs: FS = {
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

      expect(await fs2ts(fs)).toMatchObject([
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
      const fs: FS = {
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

      expect(await fs2ts(fs)).toMatchObject([
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
