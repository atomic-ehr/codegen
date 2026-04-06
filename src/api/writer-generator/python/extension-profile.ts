import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { ChoiceFieldDeclaration, ProfileExtension, ProfileTypeSchema } from "@typeschema/types.ts";
import {
    collectSubExtensionClassNames,
    extensionModuleName,
    extensionProfileClassName,
    extensionProfileParentName,
    isPythonPrimitive,
    PRIMITIVE_TYPE_MAP,
    PYTHON_BUILTINS,
    pyFhirPackageByName,
    subExtensionClassName,
    subExtensionUnionName,
    subExtValueFieldName,
} from "./naming-utils";
import type { Python } from "./writer";

const isComplexExtensionProfile = (profile: ProfileTypeSchema): boolean => (profile.extensions ?? []).length > 0;

const extractCanonicalUrl = (profile: ProfileTypeSchema): string => {
    const fields = profile.fields ?? {};
    const urlField = fields.url;
    if (urlField && "valueConstraint" in urlField && urlField.valueConstraint) {
        return String(urlField.valueConstraint.value);
    }
    return profile.identifier.url;
};

const extractSimpleExtensionInfo = (
    profile: ProfileTypeSchema,
): {
    canonicalUrl: string;
    valueFieldName: string;
    valueType: string;
    valueRequired: boolean;
} => {
    const fields = profile.fields ?? {};
    const canonicalUrl = extractCanonicalUrl(profile);

    const valueDecl = fields.value as ChoiceFieldDeclaration | undefined;
    const valueRequired = valueDecl?.required ?? false;
    const choices = valueDecl?.choices ?? [];

    let valueFieldName = "valueString";
    let valueType = "str";

    if (choices.length === 1 && choices[0]) {
        valueFieldName = choices[0];
        const choiceField = fields[valueFieldName];
        if (choiceField && "type" in choiceField) {
            valueType = choiceField.type.name;
        }
    } else {
        for (const [name, field] of Object.entries(fields)) {
            if ("choiceOf" in field && field.choiceOf === "value" && "type" in field) {
                valueFieldName = name;
                valueType = field.type.name;
                break;
            }
        }
    }

    return { canonicalUrl, valueFieldName, valueType, valueRequired };
};

const generateDocstringAndUrl = (w: Python, profile: ProfileTypeSchema, canonicalUrl: string): void => {
    if (profile.description) {
        w.line(`"""${profile.description}`);
        w.line();
        w.line(`CanonicalURL: ${canonicalUrl}`);
        w.line(`"""`);
    }
    w.line(`url: Literal["${canonicalUrl}"] = Field(`);
    w.indentBlock(() => {
        w.line(`"${canonicalUrl}",`);
        w.line(`alias="url", serialization_alias="url",`);
    });
    w.line(")");
};

const generateSimpleExtensionProfile = (w: Python, profile: ProfileTypeSchema): void => {
    const { canonicalUrl, valueFieldName, valueType, valueRequired } = extractSimpleExtensionInfo(profile);

    w.pyImportFrom("__future__", "annotations");
    w.pyImportFrom("typing", "Literal");
    w.pyImportFrom("pydantic", "Field");

    const basePackage = `${pyFhirPackageByName(w.opts.rootPackageName, profile.identifier.package)}.base`;
    const pyValueType = PRIMITIVE_TYPE_MAP[valueType] ?? valueType;
    const importNames = ["Extension"];
    if (pyValueType !== "Extension" && !isPythonPrimitive(valueType) && !PYTHON_BUILTINS.has(pyValueType)) {
        importNames.push(pyValueType);
    }
    w.pyImportFrom(basePackage, ...importNames.sort());

    w.line();
    w.line();

    const className = extensionProfileClassName(profile);
    const pyFieldName = w.nameFormatFunction(valueFieldName);

    w.line(`class ${className}(Extension):`);
    w.indentBlock(() => {
        generateDocstringAndUrl(w, profile, canonicalUrl);

        const typeAnnotation = valueRequired ? pyValueType : `${pyValueType} | None`;
        const defaultPart = valueRequired ? "" : "None, ";
        w.line(
            `${pyFieldName}: ${typeAnnotation} = Field(${defaultPart}alias="${valueFieldName}", serialization_alias="${valueFieldName}")`,
        );
    });
    w.line();
};

const generateSubExtensionClass = (w: Python, ext: ProfileExtension, parentName: string): void => {
    const className = subExtensionClassName(parentName, ext.name);
    const extUrl = ext.url ?? ext.name;

    let valueFieldName: string;
    let valueType: string;

    const firstSub = ext.subExtensions?.[0];
    const firstVt = ext.valueFieldTypes?.[0];

    if (firstSub) {
        valueFieldName = subExtValueFieldName(firstSub.valueFieldType);
        valueType = firstSub.valueFieldType
            ? (PRIMITIVE_TYPE_MAP[firstSub.valueFieldType.name] ?? firstSub.valueFieldType.name)
            : "str";
    } else if (firstVt) {
        valueFieldName = subExtValueFieldName(firstVt);
        valueType = PRIMITIVE_TYPE_MAP[firstVt.name] ?? firstVt.name;
    } else {
        valueFieldName = "valueString";
        valueType = "str";
    }

    const pyFieldName = w.nameFormatFunction(valueFieldName);

    w.line(`class ${className}(Extension):`);
    w.indentBlock(() => {
        w.line(`"""Sub-extension: ${ext.name}"""`);
        w.line(`url: Literal["${extUrl}"] = Field("${extUrl}", alias="url", serialization_alias="url")`);
        w.line(
            `${pyFieldName}: ${valueType} = Field(alias="${valueFieldName}", serialization_alias="${valueFieldName}")`,
        );
    });
};

const generateComplexExtensionProfile = (w: Python, profile: ProfileTypeSchema): void => {
    const extensions = profile.extensions ?? [];
    const canonicalUrl = extractCanonicalUrl(profile);
    const parentName = extensionProfileParentName(profile);
    const className = extensionProfileClassName(profile);

    const valueTypeImports = new Set<string>();
    for (const ext of extensions) {
        for (const vt of ext.valueFieldTypes ?? []) {
            if (!isPythonPrimitive(vt.name)) {
                valueTypeImports.add(vt.name);
            }
        }
        for (const sub of ext.subExtensions ?? []) {
            if (sub.valueFieldType && !isPythonPrimitive(sub.valueFieldType.name)) {
                valueTypeImports.add(sub.valueFieldType.name);
            }
        }
    }

    w.pyImportFrom("__future__", "annotations");
    w.pyImportFrom("typing", "Annotated", "Literal", "Union");
    w.pyImportFrom("pydantic", "Discriminator", "Field", "Tag");

    const basePackage = `${pyFhirPackageByName(w.opts.rootPackageName, profile.identifier.package)}.base`;
    const baseImports = ["Extension", ...Array.from(valueTypeImports)].sort();
    w.pyImportFrom(basePackage, ...baseImports);

    w.line();
    w.line();

    for (const ext of extensions) {
        generateSubExtensionClass(w, ext, parentName);
        w.line();
        w.line();
    }

    const unionName = subExtensionUnionName(parentName);

    w.line(`${unionName} = Annotated[`);
    w.indentBlock(() => {
        w.line("Union[");
        w.indentBlock(() => {
            for (const ext of extensions) {
                const subClassName = subExtensionClassName(parentName, ext.name);
                const tag = ext.url ?? ext.name;
                w.line(`Annotated[${subClassName}, Tag("${tag}")],`);
            }
        });
        w.line("],");
        w.line(`Discriminator("url"),`);
    });
    w.line("]");

    w.line();
    w.line();

    w.line(`class ${className}(Extension):`);
    w.indentBlock(() => {
        generateDocstringAndUrl(w, profile, canonicalUrl);
        w.line(
            `extension: list[${unionName}] | None = Field(None, alias="extension", serialization_alias="extension")  # type: ignore[assignment]`,
        );
    });
    w.line();
};

export const generateExtensionProfiles = (w: Python, tsIndex: TypeSchemaIndex, profiles: ProfileTypeSchema[]): void => {
    w.cd("profiles", () => {
        for (const profile of profiles) {
            const flatProfile = tsIndex.flatProfile(profile);
            const moduleName = extensionModuleName(flatProfile.identifier.name);
            w.cat(`${moduleName}.py`, () => {
                w.generateDisclaimer();
                if (isComplexExtensionProfile(flatProfile)) {
                    generateComplexExtensionProfile(w, flatProfile);
                } else {
                    generateSimpleExtensionProfile(w, flatProfile);
                }
            });
        }
        generateProfilesInitFile(w, tsIndex, profiles);
    });
};

const generateProfilesInitFile = (w: Python, tsIndex: TypeSchemaIndex, profiles: ProfileTypeSchema[]): void => {
    w.cat("__init__.py", () => {
        w.generateDisclaimer();
        const packageName = profiles[0]?.identifier.package;
        if (!packageName) return;
        const pyPackage = `${pyFhirPackageByName(w.opts.rootPackageName, packageName)}.profiles`;
        for (const profile of profiles) {
            const moduleName = extensionModuleName(profile.identifier.name);
            const className = extensionProfileClassName(profile);
            if (isComplexExtensionProfile(profile)) {
                const subNames = collectSubExtensionClassNames(profile);
                w.pyImportFrom(`${pyPackage}.${moduleName}`, className, ...subNames);
            } else {
                w.pyImportFrom(`${pyPackage}.${moduleName}`, className);
            }
        }

        w.line();

        // model_rebuild() so Pydantic can resolve inherited deferred annotations
        for (const profile of profiles) {
            const className = extensionProfileClassName(profile);
            w.line(`${className}.model_rebuild()`);
            if (isComplexExtensionProfile(profile)) {
                for (const subName of collectSubExtensionClassNames(profile)) {
                    w.line(`${subName}.model_rebuild()`);
                }
            }
        }
    });
};
