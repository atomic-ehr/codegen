import { describe, expect, it } from "bun:test";
import type { CanonicalUrl, RegularTypeSchema } from "@root/typeschema/types";
import { ccdaPackage, mkCCDARegister, registerFsAndMkTs } from "@typeschema-test/utils";

const skipMe = false;

describe("TypeSchema CCDA generation", async () => {
    const ccda = await mkCCDARegister();

    it.skipIf(skipMe)("http://hl7.org/fhir/StructureDefinition/workflow-protectiveFactor", async () => {
        const resource = ccda.resolveFs(
            ccdaPackage,
            "http://hl7.org/fhir/StructureDefinition/workflow-protectiveFactor" as CanonicalUrl,
        )!;
        const ts = (await registerFsAndMkTs(ccda, resource))[0] as RegularTypeSchema;
        expect(ts).toMatchObject({
            identifier: {
                kind: "profile",
                package: "hl7.fhir.uv.extensions.r5",
                version: "5.1.0",
                name: "ProtectiveFactor",
                url: "http://hl7.org/fhir/StructureDefinition/workflow-protectiveFactor",
            },
            base: {
                kind: "complex-type",
                package: "hl7.fhir.r5.core",
                version: "5.0.0",
                name: "Extension",
                url: "http://hl7.org/fhir/StructureDefinition/Extension",
            },
            fields: {
                extension: {
                    type: {
                        kind: "complex-type",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "Extension",
                        url: "http://hl7.org/fhir/StructureDefinition/Extension",
                    },
                },
                url: {
                    type: {
                        kind: "primitive-type",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "uri",
                        url: "http://hl7.org/fhir/StructureDefinition/uri",
                    },
                },
                value: {
                    choices: ["valueCodeableReference"],
                },
                valueCodeableReference: {
                    type: {
                        kind: "complex-type",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "CodeableReference",
                        url: "http://hl7.org/fhir/StructureDefinition/CodeableReference",
                    },
                },
            },
        });
    });

    it.skipIf(skipMe)("http://hl7.org/cda/stds/core/StructureDefinition/ON", async () => {
        const resource = ccda.resolveFs(
            ccdaPackage,
            "http://hl7.org/cda/stds/core/StructureDefinition/ON" as CanonicalUrl,
        )!;
        const ts = (await registerFsAndMkTs(ccda, resource))[0] as RegularTypeSchema;
        expect(ts).toMatchObject({
            identifier: {
                kind: "logical",
                package: "hl7.cda.uv.core",
                version: "2.0.1-sd",
                name: "ON",
                url: "http://hl7.org/cda/stds/core/StructureDefinition/ON",
            },
            base: {
                kind: "logical",
                package: "hl7.cda.uv.core",
                version: "2.0.1-sd",
                name: "EN",
                url: "http://hl7.org/cda/stds/core/StructureDefinition/EN",
            },
            fields: {
                item: {
                    type: {
                        kind: "complex-type",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "Base",
                        url: "http://hl7.org/fhir/StructureDefinition/Base",
                    },
                    required: false,
                    excluded: false,
                    array: true,
                },
            },
            nested: [
                {
                    identifier: {
                        kind: "nested",
                        package: "hl7.cda.uv.core",
                        version: "2.0.1-sd",
                        name: "item",
                        url: "http://hl7.org/cda/stds/core/StructureDefinition/ON#item",
                    },
                    base: {
                        kind: "complex-type",
                        package: "hl7.fhir.r5.core",
                        version: "5.0.0",
                        name: "BackboneElement",
                        url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                    },
                    fields: {
                        family: {
                            type: {
                                kind: "logical",
                                package: "hl7.cda.uv.core",
                                version: "2.0.1-sd",
                                name: "ENXP",
                                url: "http://hl7.org/cda/stds/core/StructureDefinition/ENXP",
                            },
                            required: false,
                            excluded: false,
                            array: true,
                        },
                        given: {
                            type: {
                                kind: "logical",
                                package: "hl7.cda.uv.core",
                                version: "2.0.1-sd",
                                name: "ENXP",
                                url: "http://hl7.org/cda/stds/core/StructureDefinition/ENXP",
                            },
                            required: false,
                            excluded: false,
                            array: true,
                        },
                    },
                },
            ],
            description:
                'A name for an organization. A sequence of name parts. Examples for organization name values are "Health Level Seven, Inc.", "Hospital", etc. An organization name may be as simple as a character string or may consist of several person name parts, such as, "Health Level 7", "Inc.". ON differs from EN because certain person related name parts are not possible.',
            dependencies: [
                {
                    kind: "logical",
                    package: "hl7.cda.uv.core",
                    version: "2.0.1-sd",
                    name: "EN",
                    url: "http://hl7.org/cda/stds/core/StructureDefinition/EN",
                },
                {
                    kind: "logical",
                    package: "hl7.cda.uv.core",
                    version: "2.0.1-sd",
                    name: "ENXP",
                    url: "http://hl7.org/cda/stds/core/StructureDefinition/ENXP",
                },
                {
                    kind: "complex-type",
                    package: "hl7.fhir.r5.core",
                    version: "5.0.0",
                    name: "BackboneElement",
                    url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                },
                {
                    kind: "complex-type",
                    package: "hl7.fhir.r5.core",
                    version: "5.0.0",
                    name: "Base",
                    url: "http://hl7.org/fhir/StructureDefinition/Base",
                },
            ],
        });
    });

    it.skipIf(skipMe)("http://hl7.org/fhir/StructureDefinition/ehrsrle-auditevent", async () => {
        const resource = ccda.resolveFs(
            ccdaPackage,
            "http://hl7.org/fhir/StructureDefinition/ehrsrle-auditevent" as CanonicalUrl,
        )!;
        const ts = (await registerFsAndMkTs(ccda, resource))[0] as RegularTypeSchema;
        // console.log(JSON.stringify(ts, null, 2));
        // NOTE: problem: canonical manager recomend us to use R5, but we failing on R4 AuditEvent.
        expect(ts).toMatchObject({
            identifier: {
                kind: "profile",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                name: "EHRS FM Record Lifecycle Event - Audit Event",
                url: "http://hl7.org/fhir/StructureDefinition/ehrsrle-auditevent",
            },
            fields: {
                type: {
                    array: false,
                    binding: {
                        kind: "binding",
                        name: "AuditEventType",
                        package: "shared",
                        url: "urn:fhir:binding:AuditEventType",
                        version: "1.0.0",
                    },
                    excluded: false,
                    required: true,
                    type: {
                        kind: "complex-type",
                        name: "Coding",
                        package: "hl7.fhir.r4.core",
                        url: "http://hl7.org/fhir/StructureDefinition/Coding",
                        version: "4.0.1",
                    },
                },
            },
        });
    });
});
