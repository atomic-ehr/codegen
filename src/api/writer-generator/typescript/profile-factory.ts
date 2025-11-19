import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema } from "@root/typeschema/types";
import { tsResourceName } from "./utils";

export function generateProfileFactory(writer: Writer, profile: ProfileTypeSchema): void {
    const className = tsResourceName(profile.identifier);
    const baseResourceName = tsResourceName(profile.base);
    const functionName = `create${className}`;

    writer.comment(`Factory function for ${className}`);
    writer.comment("Creates new resource or wraps existing one with profile adapter");
    writer.line();

    writer.curlyBlock(["export", "function", `${functionName}(resource?:`, baseResourceName, "):", className], () => {
        writer.curlyBlock(["const actual = resource ??"], () => {
            writer.line(`resourceType: "${profile.base.name}" as const,`);
            writer.line("meta: { profile: [] }");
        });
        writer.line();

        writer.curlyBlock(["if (!actual.meta)"], () => {
            writer.lineSM("actual.meta = {}");
        });
        writer.curlyBlock(["if (!actual.meta.profile)"], () => {
            writer.lineSM("actual.meta.profile = []");
        });
        writer.line();

        writer.curlyBlock(["if (!actual.meta.profile.includes(", className, ".profileUrl))"], () => {
            writer.lineSM(`actual.meta.profile.push(${className}.profileUrl)`);
        });
        writer.line();

        writer.lineSM(`return new ${className}(actual)`);
    });
}
