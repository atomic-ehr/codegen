import { describe, expect, it } from "bun:test";
import { CanonicalManager } from "@atomic-ehr/fhir-canonical-manager";
import { APIBuilder } from "@root/api/builder";
import { mkCodegenLogger } from "@root/utils/log";

const mkWarnSpy = () => {
    const warnings: string[] = [];
    const logger = mkCodegenLogger({ prefix: "test", level: "ERROR" });
    logger.warn = (...args: unknown[]) => {
        warnings.push(args.map(String).join(" "));
    };
    return { logger, warnings };
};

describe("APIBuilder canonicalManager options", () => {
    it("accepts loader configuration under canonicalManager without warnings", () => {
        const { logger, warnings } = mkWarnSpy();

        new APIBuilder({
            canonicalManager: { registry: "https://example.org/pkgs/", packageIndex: "recover", dropCache: true },
            logger,
        });

        expect(warnings).toEqual([]);
    });

    it("warns per deprecated flat loader option and still applies it", () => {
        const { logger, warnings } = mkWarnSpy();

        new APIBuilder({ registry: "https://example.org/pkgs/", packageIndex: "regenerate", logger });

        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toContain("'registry' is deprecated");
        expect(warnings[0]).toContain("canonicalManager: { registry }");
        expect(warnings[1]).toContain("'packageIndex' is deprecated");
    });

    it("accepts a prebuilt CanonicalManager instance via canonicalManager", () => {
        const { logger, warnings } = mkWarnSpy();
        const instance = CanonicalManager({ packages: [], workingDir: ".codegen-cache/test-cm" });

        const builder = new APIBuilder({ canonicalManager: instance, logger });

        expect((builder as unknown as { manager: unknown }).manager).toBe(instance);
        expect(warnings).toEqual([]);
    });

    it("warns on the deprecated manager option and still uses the instance", () => {
        const { logger, warnings } = mkWarnSpy();
        const instance = CanonicalManager({ packages: [], workingDir: ".codegen-cache/test-cm" });

        const builder = new APIBuilder({ manager: instance, logger });

        expect((builder as unknown as { manager: unknown }).manager).toBe(instance);
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("'manager' is deprecated");
    });

    it("threads exclusions from .typeSchema() into the builder options", () => {
        const { logger } = mkWarnSpy();
        const exclusion = { package: "my.pkg", url: "http://example.test/X", reason: "r" };

        const builder = new APIBuilder({ logger }).typeSchema({
            builtinExclusions: false,
            excludedCanonicals: [exclusion as never],
        });

        const conf = (builder as unknown as { options: { typeSchema?: Record<string, unknown> } }).options.typeSchema;
        expect(conf?.builtinExclusions).toBe(false);
        expect(conf?.excludedCanonicals).toEqual([exclusion]);
    });

    it("throws when an option is set in both styles", () => {
        const { logger } = mkWarnSpy();

        expect(
            () =>
                new APIBuilder({
                    canonicalManager: { registry: "https://a.example" },
                    registry: "https://b.example",
                    logger,
                }),
        ).toThrow("Cannot set both 'canonicalManager.registry' and the deprecated 'registry'.");
    });
});
