import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { transformFHIRSchema, transformValueSet } from "@typeschema/core/transformer";
import { type Register, registerFromPackageMetas } from "@typeschema/register";
import { type CanonicalUrl, enrichFHIRSchema, type RichValueSet, type ValueSet } from "@typeschema/types";

export type PFS = Partial<FHIRSchema>;
export type PVS = Partial<ValueSet>;

export const mkR4Register = async () =>
    registerFromPackageMetas(
        [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        // createLogger({ verbose: true, prefix: "TEST" }),
    );

export const registerFs = (register: Register, fs: PFS) => {
    if (!fs.package_meta) fs.package_meta = { name: "mypackage", version: "0.0.0" };
    const rfs = enrichFHIRSchema(fs as FHIRSchema);
    register.appendFs(rfs);
    return rfs;
};

export const registerFsAndMkTs = async (register: Register, fs: PFS) => {
    registerFs(register, fs);
    const rfs = register.resolveFs(fs.url as CanonicalUrl);
    if (!rfs) throw new Error("Failed to resolve registered FHIR schema");
    return await transformFHIRSchema(register, rfs);
};

export const transformVS = async (register: Register, vs: PVS) => {
    return await transformValueSet(register, vs as RichValueSet);
};
