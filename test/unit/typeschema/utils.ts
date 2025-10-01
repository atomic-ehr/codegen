import type { FHIRSchema } from "@atomic-ehr/fhirschema";
import { transformFHIRSchema } from "@typeschema/core/transformer";
import { type Register, registerFromPackageMetas } from "@typeschema/register";
import { enrichFHIRSchema } from "@typeschema/types";
export type PFS = Partial<FHIRSchema>;

export const mkR4Register = async () =>
    registerFromPackageMetas(
        [{ name: "hl7.fhir.r4.core", version: "4.0.1" }],
        // createLogger({
        //   verbose: true,
        //   prefix: "TEST",
        // }),
    );

export const fs2ts = async (register: Register, fs: PFS) => {
    if (!fs.package_meta) fs.package_meta = { name: "test.package", version: "1.0.0" };
    const rfs = enrichFHIRSchema(fs as FHIRSchema);
    register.appendFs(rfs);
    return await transformFHIRSchema(register, rfs);
};
