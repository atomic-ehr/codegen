import { describe, expect, test } from "bun:test";
import type { SectionHandle } from "@root/api/writer-generator/section-writer";
import { fieldTsType, resolveFieldTsType } from "@root/api/writer-generator/typescript/utils";
import {
    type CanonicalUrl,
    type Identifier,
    isProfileNestedIdentifier,
    type Name,
    type ProfileIdentifier,
    type RegularField,
} from "@root/typeschema/types";

const makeIdentifier = (kind: Identifier["kind"], name: string): Identifier => ({
    kind,
    package: "test-package",
    version: "1.0.0",
    name: name as Name,
    url: `http://example.org/StructureDefinition/${name}` as CanonicalUrl,
});

const referenceType = makeIdentifier("complex-type", "Reference");
const patient = makeIdentifier("resource", "Patient");
const group = makeIdentifier("resource", "Group");
const usCorePatient = makeIdentifier("profile", "USCorePatient") as ProfileIdentifier;
const testPatient = makeIdentifier("profile", "TestPatient") as ProfileIdentifier;
const tImport: SectionHandle<never, Identifier> = {
    def: () => undefined,
    use: (id) => id.name,
};

const resolveRef = (ref: Identifier): Identifier => {
    if (ref.name === usCorePatient.name || ref.name === testPatient.name) return patient;
    return ref;
};

describe("fieldTsType reference targets", () => {
    test("plain resource targets have no comment", () => {
        const field: RegularField = {
            type: referenceType,
            reference: { resource: [patient, group], effectiveResource: [patient, group] },
        };
        expect(fieldTsType(tImport, field, resolveRef)).toBe(`Reference<"Patient" | "Group">`);
    });

    test("profile target replaced by its resource type keeps the profile url as a comment", () => {
        const field: RegularField = {
            type: referenceType,
            reference: { resource: [patient], effectiveResource: [patient], profiles: [usCorePatient] },
        };
        expect(fieldTsType(tImport, field, resolveRef)).toBe(
            `Reference<"Patient" /* http://example.org/StructureDefinition/USCorePatient */>`,
        );
    });

    test("multiple profiles of the same resource are listed in one comma-separated comment", () => {
        const field: RegularField = {
            type: referenceType,
            reference: {
                resource: [group, patient],
                effectiveResource: [group, patient],
                profiles: [usCorePatient, testPatient],
            },
        };
        expect(fieldTsType(tImport, field, resolveRef)).toBe(
            `Reference<"Group" | "Patient" /* http://example.org/StructureDefinition/USCorePatient, http://example.org/StructureDefinition/TestPatient */>`,
        );
    });
});

describe("fieldTsType bindings", () => {
    test.each(["Quantity", "Duration", "CodeableReference"])(
        "preserves the object type of a bound %s choice",
        (name) => {
            const field = {
                type: makeIdentifier("complex-type", name),
                choiceOf: "value" as Name,
                enum: { isOpen: false, values: ["s", "min", "h"] },
            };
            expect(fieldTsType(tImport, field)).toBe(name);
            expect(fieldTsType(tImport, { ...field, array: true })).toBe(`${name}[]`);
            expect(fieldTsType(tImport, { ...field, enum: { ...field.enum, isOpen: true } })).toBe(name);
        },
    );

    test.each(["code", "string", "uri"])("keeps code unions for a bound primitive %s", (name) => {
        const field: RegularField = {
            type: makeIdentifier("primitive-type", name),
            enum: { isOpen: false, values: ["a", "b"] },
        };
        expect(fieldTsType(tImport, field)).toBe('("a" | "b")');
    });

    test.each(["Coding", "CodeableConcept"])("keeps code generics for a bound %s", (name) => {
        const field: RegularField = {
            type: makeIdentifier("complex-type", name),
            enum: { isOpen: false, values: ["a", "b"] },
        };
        expect(fieldTsType(tImport, field)).toBe(`${name}<("a" | "b")>`);
    });
});

describe("resolveFieldTsType nested types", () => {
    // A profile module's type imports name a profile's nested copy after its specialization.
    const profileImports: SectionHandle<never, Identifier> = {
        def: () => undefined,
        use: (id) => (isProfileNestedIdentifier(id) ? "ObservationComponent" : id.name),
    };
    const component: Identifier = {
        kind: "profile-nested",
        package: "test-package",
        version: "1.0.0",
        name: "component" as Name,
        url: "http://example.org/StructureDefinition/bp#component" as CanonicalUrl,
    };

    test("names a profile's nested copy through the type imports", () => {
        expect(resolveFieldTsType(profileImports, "", "", { type: component })).toBe("ObservationComponent");
    });
});
