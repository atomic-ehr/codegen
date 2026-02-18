import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import type { ValueSet } from "@root/fhir-types/hl7-fhir-r4-core";
import { generateTypeSchemas } from "@root/typeschema";
import { mkTypeSchemaIndex } from "@root/typeschema/utils";
import { type Logger, makeLogger } from "@root/utils/logger";
import { transformFhirSchema, transformValueSet } from "@typeschema/core/transformer";
import { type Register, registerFromPackageMetas } from "@typeschema/register";
import { type CanonicalUrl, enrichFHIRSchema, enrichValueSet, type PackageMeta } from "@typeschema/types";

export type PFS = Partial<FHIRSchema>;
export type PVS = Partial<ValueSet>;

const logger = makeLogger({ prefix: "TEST" });

export const mkIndex = async (register: Register, logger?: Logger) => {
    const { schemas } = await generateTypeSchemas(register, logger);
    return mkTypeSchemaIndex(schemas, { register, logger });
};

export const r4Package = { name: "hl7.fhir.r4.core", version: "4.0.1" };

export const mkR4Register = async () =>
    registerFromPackageMetas([r4Package], {
        // logger: createLogger({ verbose: true, prefix: "TEST" })
    });

export const r4Manager = await mkR4Register();

export const r5Package = { name: "hl7.fhir.r5.core", version: "5.0.0" };

export const mkR5Register = async () =>
    registerFromPackageMetas([r5Package], {
        // logger: createLogger({ verbose: true, prefix: "TEST" })
    });

export const ccdaPackage = { name: "hl7.cda.uv.core", version: "2.0.1-sd" };

export const mkCCDARegister = async () =>
    registerFromPackageMetas([ccdaPackage], {
        // logger: createLogger({ verbose: true, prefix: "TEST" })
    });

export const ccdaManager = await mkCCDARegister();

export const registerFs = (register: Register, fs: PFS) => {
    const pkg = fs.package_meta ?? { name: "mypackage", version: "0.0.0" };
    const rfs = enrichFHIRSchema(fs as FHIRSchema, pkg);
    register.testAppendFs(rfs);
    return rfs;
};

export const resolveTs = async (register: Register, pkgMeta: PackageMeta, url: string | CanonicalUrl) => {
    const rfs = register.resolveFs(pkgMeta, url as CanonicalUrl);
    if (!rfs) throw new Error("Failed to resolve registered FHIR schema");
    return await transformFhirSchema(register, rfs, logger);
};

export const registerFsAndMkTs = async (register: Register, fs: PFS) => {
    const rfs = registerFs(register, fs);
    return await transformFhirSchema(register, rfs, logger);
};

export const transformVS = async (register: Register, pkg: PackageMeta, vs: PVS) => {
    return await transformValueSet(register, enrichValueSet(vs as ValueSet, pkg));
};
