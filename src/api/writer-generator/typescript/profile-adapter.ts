import type { Writer } from "@root/api/writer-generator/writer";
import type { ProfileTypeSchema } from "@root/typeschema/types";
import { isChoiceDeclarationField } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { generateExtensionAccessor } from "./extension-accessor";
import { generateEnhancedFieldAccessor } from "./field-accessor";
import { tsResourceName } from "./utils";

export function generateProfileAdapter(writer: Writer, tsIndex: TypeSchemaIndex, profile: ProfileTypeSchema): void {
    const className = tsResourceName(profile.identifier);
    const baseResourceName = tsResourceName(profile.base);

    writer.comment(`Profile Adapter: ${className}`);
    writer.comment(`Base Resource: ${baseResourceName}`);
    if (profile.identifier.url) {
        writer.comment(`Canonical URL: ${profile.identifier.url}`);
    }
    if (profile.description) {
        writer.comment(profile.description);
    }
    writer.line();

    writer.curlyBlock(["export", "class", className], () => {
        generateStaticProfileUrl(writer, profile);
        writer.line();

        generateConstructor(writer, className, baseResourceName);
        writer.line();

        generateResourceGetter(writer, baseResourceName);
        writer.line();

        generateToJSON(writer, baseResourceName);
        writer.line();

        generateEnhancedFieldAccessors(writer, tsIndex, profile);

        generateExtensionAccessors(writer, profile);
    });

    writer.line();
    generateProfileTypePredicate(writer, profile, baseResourceName);
}

function generateStaticProfileUrl(writer: Writer, profile: ProfileTypeSchema): void {
    const url = profile.identifier.url || "";
    writer.lineSM(`static readonly profileUrl = "${url}"`);
}

function generateConstructor(writer: Writer, className: string, baseResourceName: string): void {
    writer.curlyBlock(["constructor(private _resource:", baseResourceName, ")"], () => {
        writer.curlyBlock(["if (!_resource.meta?.profile?.includes(", className, ".profileUrl))"], () => {
            writer.lineSM(`console.warn(\`Resource does not declare profile \${${className}.profileUrl}\`)`);
        });
    });
}

function generateResourceGetter(writer: Writer, baseResourceName: string): void {
    writer.curlyBlock(["get resource():", `Readonly<${baseResourceName}>`], () => {
        writer.lineSM("return this._resource");
    });
}

function generateToJSON(writer: Writer, baseResourceName: string): void {
    writer.curlyBlock(["toJSON():", baseResourceName], () => {
        writer.lineSM("return this._resource");
    });
}

function generateEnhancedFieldAccessors(writer: Writer, tsIndex: TypeSchemaIndex, profile: ProfileTypeSchema): void {
    if (!profile.fields) return;

    writer.comment("Profile-constrained field accessors with validation");

    const fieldEntries = Object.entries(profile.fields).sort((a, b) => a[0].localeCompare(b[0]));

    for (const [fieldName, field] of fieldEntries) {
        if (isChoiceDeclarationField(field)) continue;

        generateEnhancedFieldAccessor(writer, tsIndex, profile, fieldName, field);
    }
}

function generateExtensionAccessors(writer: Writer, profile: ProfileTypeSchema): void {
    if (!profile.extensions || profile.extensions.length === 0) return;

    writer.line();
    writer.comment("Extension accessors");

    const sortedExtensions = [...profile.extensions].sort((a, b) => a.path.localeCompare(b.path));

    for (const extension of sortedExtensions) {
        writer.line();
        generateExtensionAccessor(writer, extension);
    }
}

function generateProfileTypePredicate(writer: Writer, profile: ProfileTypeSchema, _baseResourceName: string): void {
    const className = tsResourceName(profile.identifier);
    const resourceTypeName = profile.base.name;

    writer.curlyBlock(["export", "function", `is${className}(resource: any): resource is ${className}`], () => {
        writer.lineSM(
            `return resource?.resourceType === "${resourceTypeName}" && (resource.meta?.profile?.includes(${className}.profileUrl) ?? false)`,
        );
    });
}
