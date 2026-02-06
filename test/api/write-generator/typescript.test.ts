import { describe, expect, it } from "bun:test";
import { APIBuilder } from "@root/api/builder";
import type { CanonicalUrl } from "@root/typeschema/types";
import { CodegenLogger, LogLevel } from "@root/utils/codegen-logger";
import { ccdaManager, r4Manager } from "@typeschema-test/utils";

/** Creates a logger that captures all warnings for testing */
const createCapturingLogger = () => {
    const warnings: string[] = [];
    const logger = new CodegenLogger({ level: LogLevel.WARN });
    const originalWarn = logger.warn.bind(logger);
    logger.warn = (message: string) => {
        warnings.push(message);
        originalWarn(message);
    };
    return { logger, warnings };
};

describe("TypeScript Writer Generator", async () => {
    const result = await new APIBuilder({ register: r4Manager })
        .setLogLevel("SILENT")
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    expect(Object.keys(result.filesGenerated).length).toEqual(638);
    it("generates Patient resource in inMemoryOnly mode with snapshot", async () => {
        expect(result.filesGenerated["generated/types/hl7-fhir-r4-core/Patient.ts"]).toMatchSnapshot();
    });
});

describe("TypeScript CDA with Logical Model Promotion to Resource", async () => {
    const result = await new APIBuilder({ register: ccdaManager })
        .setLogLevel("SILENT")
        .typeSchema({
            promoteLogical: {
                "hl7.cda.uv.core": ["http://hl7.org/cda/stds/core/StructureDefinition/Material" as CanonicalUrl],
            },
        })
        .typescript({
            inMemoryOnly: true,
        })
        .generate();
    expect(result.success).toBeTrue();
    it("without resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/CV.ts"]).toMatchSnapshot();
    });
    it("with resourceType", async () => {
        expect(result.filesGenerated["generated/types/hl7-cda-uv-core/Material.ts"]).toMatchSnapshot();
    });
});

describe("TypeScript R4 Example (with generateProfile)", async () => {
    const { logger, warnings } = createCapturingLogger();

    const result = await new APIBuilder({ register: r4Manager, logger })
        .typescript({
            inMemoryOnly: true,
            withDebugComment: false,
            generateProfile: true,
            openResourceTypeSet: false,
        })
        .generate();

    it("generates successfully", () => {
        expect(result.success).toBeTrue();
    });

    it("has no file rewrite warnings", () => {
        const rewriteWarnings = warnings.filter((w) => w.includes("File will be rewritten"));
        expect(rewriteWarnings).toEqual([]);
    });
});
