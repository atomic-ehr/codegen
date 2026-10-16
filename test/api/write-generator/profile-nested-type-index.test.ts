import { describe, expect, it } from "bun:test";
import * as Path from "node:path";
import { APIBuilder } from "@root/api/builder";
import { mkSilentLogger } from "@typeschema-test/utils";

const SLICED_CHOICE_PATH = Path.join(__dirname, "../../assets/profile-sliced-choice");
const NESTED_TYPE_INDEX_PATH = Path.join(__dirname, "../../assets/profile-nested-type-index");

/**
 * Profiles that constrain a nested type of core, next to the sliced choice
 * profile: core from a package, profiles from local folders, no tree shaking.
 *
 * - `PatientBundle` narrows `Bundle.entry.resource` to Patient.
 * - `QuantityComponentObservation` narrows `Observation.component.value[x]` to Quantity.
 *
 * A profile's narrowing applies to that profile only: core `Bundle` and the
 * sliced choice profile stay as they are.
 */
const mkBuilder = () =>
    new APIBuilder({ logger: mkSilentLogger() })
        .fromPackage("hl7.fhir.r4.core", "4.0.1")
        .localStructureDefinitions({
            package: { name: "example.test.slicedchoice", version: "0.0.1" },
            path: SLICED_CHOICE_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        })
        .localStructureDefinitions({
            package: { name: "example.test.nestedtypeindex", version: "0.0.1" },
            path: NESTED_TYPE_INDEX_PATH,
            dependencies: [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        });

describe("TypeScript: profile nested types next to core nested types", async () => {
    const result = await mkBuilder()
        .typescript({ inMemoryOnly: true, generateProfile: true, withDebugComment: false })
        .generate();
    const files = result.filesGenerated.typescript ?? {};
    const bundleFile = files["generated/types/hl7-fhir-r4-core/Bundle.ts"];
    const slicedFile =
        files["generated/types/example-test-slicedchoice/profiles/Observation_SlicedChoiceObservation.ts"];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(bundleFile).toBeDefined();
        expect(slicedFile).toBeDefined();
    });

    it("core Bundle matches snapshot", () => {
        expect(bundleFile).toMatchSnapshot();
    });

    it("sliced choice profile matches snapshot", () => {
        expect(slicedFile).toMatchSnapshot();
    });
});

describe("Python: profile nested types next to core nested types", async () => {
    const result = await mkBuilder().python({ inMemoryOnly: true, generateProfile: true, client: "none" }).generate();
    const files = result.filesGenerated.python ?? {};
    const bundleFile = files["generated/hl7_fhir_r4_core/bundle.py"];
    const slicedFile = files["generated/example_test_slicedchoice/profiles/observation_sliced_choice_observation.py"];

    it("should succeed", () => {
        expect(result.success).toBeTrue();
        expect(bundleFile).toBeDefined();
        expect(slicedFile).toBeDefined();
    });

    it("core Bundle matches snapshot", () => {
        expect(bundleFile).toMatchSnapshot();
    });

    it("sliced choice profile matches snapshot", () => {
        expect(slicedFile).toMatchSnapshot();
    });
});
