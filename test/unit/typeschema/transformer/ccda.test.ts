import { describe, expect, it } from "bun:test";
import type { CanonicalUrl } from "@root/typeschema";
import type { RegularTypeSchema } from "@root/typeschema/types";
import { ccdaPackage, mkCCDARegister, registerFsAndMkTs } from "@typeschema-test/utils";

const skipMe = true;

describe("TypeSchema R4 generation", async () => {
    const ccda = await mkCCDARegister();

    it.skipIf(skipMe)("http://hl7.org/cda/stds/core/StructureDefinition/ON", async () => {
        const resource = ccda.resolveFs(
            ccdaPackage,
            "http://hl7.org/cda/stds/core/StructureDefinition/ON" as CanonicalUrl,
        )!;
        const ts = (await registerFsAndMkTs(ccda, resource))[0] as RegularTypeSchema;
        expect(ts).toMatchObject({
            identifier: {
                kind: "resource",
                package: "hl7.cda.uv.core",
                version: "2.0.1-sd",
                name: "ON",
                url: "http://hl7.org/cda/stds/core/StructureDefinition/ON",
            },
            base: {
                kind: "resource",
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
                        package: "hl7.cda.uv.core",
                        version: "2.0.1-sd",
                        name: "BackboneElement",
                        url: "http://hl7.org/fhir/StructureDefinition/BackboneElement",
                    },
                    fields: {
                        family: {
                            type: {
                                kind: "resource",
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
                                kind: "resource",
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
                    kind: "resource",
                    package: "hl7.cda.uv.core",
                    version: "2.0.1-sd",
                    name: "EN",
                    url: "http://hl7.org/cda/stds/core/StructureDefinition/EN",
                },
                {
                    kind: "resource",
                    package: "hl7.cda.uv.core",
                    version: "2.0.1-sd",
                    name: "ENXP",
                    url: "http://hl7.org/cda/stds/core/StructureDefinition/ENXP",
                },
                {
                    kind: "complex-type",
                    package: "hl7.cda.uv.core",
                    version: "2.0.1-sd",
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

    it.skipIf(skipMe)("http://hl7.org/cda/stds/core/StructureDefinition/ON", async () => {
        console.log(
            JSON.stringify(
                ccda.resolveFsGenealogy(
                    ccdaPackage,
                    "http://hl7.org/fhir/StructureDefinition/ehrsrle-auditevent" as any,
                ),
                undefined,
                2,
            ),
        );
        const resource = ccda.resolveFs(
            ccdaPackage,
            "http://hl7.org/fhir/StructureDefinition/ehrsrle-auditevent" as CanonicalUrl,
        )!;
        const ts = (await registerFsAndMkTs(ccda, resource))[0] as RegularTypeSchema;
        console.log(JSON.stringify(ts, null, 2));
        // NOTE: problem: canonical manager recomend us to use R5, but we failing on R4 AuditEvent.
        expect(ts).toMatchObject({
            identifier: {
                kind: "profile",
                package: "hl7.fhir.r4.core",
                version: "4.0.1",
                name: "EHRS FM Record Lifecycle Event - Audit Event",
                url: "http://hl7.org/fhir/StructureDefinition/ehrsrle-auditevent",
            },
            fields: { type: { type: "foo" } },
        });
    });
});
