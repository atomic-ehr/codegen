import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { createLogger } from "@root/utils/codegen-logger";
import { transformFhirSchema, transformValueSet } from "@typeschema/core/transformer";
import { type Register, registerFromPackageMetas } from "@typeschema/register";
import {
    type CanonicalUrl,
    enrichFHIRSchema,
    enrichValueSet,
    type PackageMeta,
    type ValueSet,
} from "@typeschema/types";

export type PFS = Partial<FHIRSchema>;
export type PVS = Partial<ValueSet>;

const logger = createLogger({ verbose: true, prefix: "TEST" });

export const r4Package = { name: "hl7.fhir.r4.core", version: "4.0.1" };

export const mkR4Register = async () =>
    registerFromPackageMetas([r4Package], {
        fallbackPackageForNameResolution: r4Package,
        // logger: createLogger({ verbose: true, prefix: "TEST" })
    });

export const ccdaPackage = { name: "hl7.cda.uv.core", version: "2.0.1-sd" };

export const mkCCDARegister = async () =>
    registerFromPackageMetas([ccdaPackage], {
        // logger: createLogger({ verbose: true, prefix: "TEST" })
    });

export const registerFs = (register: Register, fs: PFS) => {
    if (!fs.package_meta) fs.package_meta = { name: "mypackage", version: "0.0.0" };
    const rfs = enrichFHIRSchema(fs as FHIRSchema);
    register.unsafeAppendFs(rfs);
    return rfs;
};

export const registerFsAndMkTs = async (register: Register, fs: PFS) => {
    registerFs(register, fs);
    const rfs = register.resolveFs(fs.package_meta, fs.url as CanonicalUrl);
    if (!rfs) throw new Error("Failed to resolve registered FHIR schema");
    return await transformFhirSchema(register, rfs, logger);
};

export const transformVS = async (register: Register, pkg: PackageMeta, vs: PVS) => {
    return await transformValueSet(register, enrichValueSet(vs as ValueSet, pkg));
};
