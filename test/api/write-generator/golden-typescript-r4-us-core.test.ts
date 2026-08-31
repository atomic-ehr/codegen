import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import { mkErrorLogger } from "@typeschema-test/utils";

// Golden snapshot of the complete TypeScript output for the flagship US Core
// configuration (mirrors examples/typescript-r4-us-core/generate.ts). Every
// generated file is snapshotted, so any change to the emitted TypeScript shows
// up as a reviewable .snap diff: run `bun test golden-typescript-r4-us-core -u`
// after an intentional generator change and commit the updated snapshot.
describe("Golden TypeScript output (hl7.fhir.us.core@8.0.1)", async () => {
    const result = await new APIBuilder({ logger: mkErrorLogger() })
        .throwException()
        .fromPackage("hl7.fhir.us.core", "8.0.1")
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .typeSchema({
            treeShake: {
                "hl7.fhir.r4.core": {
                    "http://hl7.org/fhir/StructureDefinition/Bundle": {},
                    "http://hl7.org/fhir/StructureDefinition/OperationOutcome": {},
                    "http://hl7.org/fhir/StructureDefinition/DomainResource": {},
                    "http://hl7.org/fhir/StructureDefinition/BackboneElement": {},
                    "http://hl7.org/fhir/StructureDefinition/Element": {},
                    "http://hl7.org/fhir/StructureDefinition/Patient": {},
                    "http://hl7.org/fhir/StructureDefinition/Observation": {},
                    "http://hl7.org/fhir/StructureDefinition/bodyweight": {},
                    "http://hl7.org/fhir/StructureDefinition/bp": {},
                    "http://hl7.org/fhir/StructureDefinition/patient-birthPlace": {},
                    "http://hl7.org/fhir/StructureDefinition/patient-nationality": {},
                    "http://hl7.org/fhir/StructureDefinition/humanname-own-prefix": {},
                    "http://hl7.org/fhir/StructureDefinition/patient-birthTime": {},
                },
                "hl7.fhir.us.core": {
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-blood-pressure": {},
                    "http://hl7.org/fhir/us/core/StructureDefinition/us-core-body-weight": {},
                },
            },
            resolveCollisions: {
                "urn:fhir:binding:CommunicationReason": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/Communication",
                },
                "urn:fhir:binding:ObservationCategory": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/Observation",
                },
                "urn:fhir:binding:ObservationRangeMeaning": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/Observation",
                },
                "urn:fhir:binding:PaymentType": {
                    package: "hl7.fhir.r4.core#4.0.1",
                    canonical: "http://hl7.org/fhir/StructureDefinition/ClaimResponse",
                },
            },
        })
        .generate();

    const files = result.filesGenerated.typescript ?? {};
    const paths = Object.keys(files).sort();

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("generates the expected file set", () => {
        expect(paths).toMatchSnapshot();
    });

    it("matches golden output for every generated file", () => {
        for (const path of paths) expect(files[path]).toMatchSnapshot(path);
    });
});
