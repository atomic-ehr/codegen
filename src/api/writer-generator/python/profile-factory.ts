import {
    type ChoiceFieldInstance,
    type Field,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNestedIdentifier,
    isNotChoiceDeclarationField,
    isResourceIdentifier,
    type RegularField,
    type SnapshotProfileTypeSchema,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { type ProfileImports, profilePyType, resolveFhirType } from "./imports";
import { pyLiteral, pyReferenceTypeParam } from "./naming-utils";
import {
    type ProfileMethodBaseNames,
    pyFieldName,
    pyProfileClassName,
    pySliceStaticName,
    pySnakeName,
} from "./profile-naming";
import { collectRequiredSliceNames, type SliceDef } from "./profile-slices";
import type { Python } from "./writer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    sliceAutoFields: { name: string; pyType: string; sliceNames: string[] }[];
    params: { name: string; pyType: string; refComment?: string }[];
    accessors: {
        name: string;
        pyType: string;
        choiceSiblings?: string[];
        refComment?: string;
    }[];
};

// ---------------------------------------------------------------------------
// Field type utility
// ---------------------------------------------------------------------------

/** Full Python type annotation for a field (appends `list[...]` for arrays).
 *
 * A required code binding with a closed value set is emitted as a `Literal[...]`
 * union instead of a bare `str` (open value sets stay `str`, since
 * `Literal[...] | str` collapses to `str`). */
const fieldPyType = (
    imports: ProfileImports,
    field: RegularField | ChoiceFieldInstance,
    tsIndex: TypeSchemaIndex,
): string => {
    // A nested backbone element is its own generated class (ObservationComponent,
    // ProvenanceAgent), so it must not be resolved: the last specialization of a
    // nested identifier is BackboneElement, which is what the model field is
    // declared *against*, not what it accepts.
    const resolved = isNestedIdentifier(field.type)
        ? field.type
        : tsIndex.findLastSpecializationByIdentifier(field.type);
    let base = profilePyType(imports, resolved);
    if (base === "str" && field.enum && !field.enum.isOpen && field.enum.values.length > 0) {
        const literal = `${imports.typing.use("Literal")}[${field.enum.values.map((v) => JSON.stringify(v)).join(", ")}]`;
        return field.array ? `list[${literal}]` : literal;
    }
    if (resolved.name === "Reference") {
        const typeParam = pyReferenceTypeParam(imports.typing, field, tsIndex);
        if (typeParam) base = `${base}[${typeParam}]`;
    }
    return field.array ? `list[${base}]` : base;
};

/** Python type for a choice variant, with Reference targets parametrized. */
const pyChoiceInstanceType = (
    imports: ProfileImports,
    field: ChoiceFieldInstance,
    tsIndex: TypeSchemaIndex,
): string => {
    let base = profilePyType(imports, field.type);
    if (field.type.name === "Reference") {
        const typeParam = pyReferenceTypeParam(imports.typing, field, tsIndex);
        if (typeParam) base = `${base}[${typeParam}]`;
    }
    return base + (field.array ? "[]" : "");
};

/** Trailing `#` comment with the profile URLs of a reference field's targets.
 *  Profile targets are replaced by their base resource type in the annotation;
 *  the URLs are kept here to make server-side validation errors traceable. */
const pyReferenceComment = (field: RegularField | ChoiceFieldInstance): string | undefined => {
    const urls = (field.reference?.profiles ?? []).map((profile) => profile.url);
    return urls.length > 0 ? `  # ${urls.join(", ")}` : undefined;
};

// ---------------------------------------------------------------------------
// Factory info collection
// ---------------------------------------------------------------------------

/** Try to promote a required single-choice declaration to a direct param. */
const tryPromoteChoice = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    field: Field,
    fields: Record<string, Field>,
): ProfileFactoryInfo["params"][number] | undefined => {
    if (!isChoiceDeclarationField(field) || !field.required || field.choices.length !== 1) return;
    const choiceName = field.choices[0];
    if (!choiceName) return;
    const choiceField = fields[choiceName];
    if (!choiceField || !isChoiceInstanceField(choiceField)) return;
    const pyType = pyChoiceInstanceType(imports, choiceField, tsIndex);
    return { name: choiceName, pyType, refComment: pyReferenceComment(choiceField) };
};

const collectChoiceAccessors = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    promotedChoices: ReadonlySet<string>,
): ProfileFactoryInfo["accessors"] => {
    // Maps each choice instance name to all sibling instance names (from the same declaration).
    const choiceGroups: Record<string, string[]> = {};
    for (const [, field] of Object.entries(snapshot.fields)) {
        if (isChoiceDeclarationField(field)) {
            for (const choice of field.choices) choiceGroups[choice] = field.choices;
        }
    }

    const accessors: ProfileFactoryInfo["accessors"] = [];
    for (const [name, field] of Object.entries(snapshot.fields)) {
        if (field.excluded) continue;
        if (!isChoiceInstanceField(field)) continue;
        if (promotedChoices.has(name)) continue;
        const pyType = pyChoiceInstanceType(imports, field, tsIndex);
        const choiceSiblings = (choiceGroups[name] ?? []).filter((s) => s !== name && !promotedChoices.has(s));
        accessors.push({
            name,
            pyType,
            choiceSiblings,
            refComment: pyReferenceComment(field),
        });
    }
    return accessors;
};

/** Include base-type required fields not already covered by profile constraints. */
const collectBaseRequiredParams = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    coveredNames: string[],
): ProfileFactoryInfo["params"] => {
    const params: ProfileFactoryInfo["params"] = [];
    const covered = new Set(coveredNames);
    const baseSchema = tsIndex.resolveType(snapshot.base);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return params;
    for (const [name, field] of Object.entries(baseSchema.fields)) {
        if (covered.has(name)) continue;
        if (!field.required) continue;
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) continue;
        if (isNotChoiceDeclarationField(field) && field.type) {
            const pyType = fieldPyType(imports, field, tsIndex);
            params.push({ name, pyType, refComment: pyReferenceComment(field) });
        }
    }
    return params;
};

export const collectProfileFactoryInfo = (
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const fields = snapshot.fields;
    const promotedChoices = new Set<string>();

    if (isResourceIdentifier(snapshot.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(snapshot.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) continue;

        if (isChoiceDeclarationField(field)) {
            const promoted = tryPromoteChoice(imports, tsIndex, field, fields);
            if (promoted) {
                params.push(promoted);
                promotedChoices.add(promoted.name);
            }
            continue;
        }

        if (field.valueConstraint && !field.valueConstraint.validateOnly) {
            const value = pyLiteral(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            if (field.type) {
                const pyType = fieldPyType(imports, field, tsIndex);
                autoAccessors.push({ name, pyType, refComment: pyReferenceComment(field) });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field, snapshot.slicing?.[name]);
            if (sliceNames) {
                if (field.type) {
                    const pyType = fieldPyType(imports, field, tsIndex);
                    sliceAutoFields.push({ name, pyType, sliceNames });
                    autoAccessors.push({ name, pyType, refComment: pyReferenceComment(field) });
                }
                continue;
            }
        }

        if (field.required) {
            const pyType = fieldPyType(imports, field, tsIndex);
            params.push({ name, pyType, refComment: pyReferenceComment(field) });
        }
    }

    params.push(
        ...collectBaseRequiredParams(imports, tsIndex, snapshot, [
            ...autoFields.map((f) => f.name),
            ...sliceAutoFields.map((f) => f.name),
            ...params.map((f) => f.name),
            ...promotedChoices,
        ]),
    );

    const choiceAccessors = collectChoiceAccessors(imports, tsIndex, snapshot, promotedChoices);
    return { autoFields, sliceAutoFields, params, accessors: [...autoAccessors, ...choiceAccessors] };
};

// ---------------------------------------------------------------------------
// Param signature / call args builders
// ---------------------------------------------------------------------------

/** Build `*, param1: Type1, param2: Type2` keyword-only signature. */
const buildParamSignature = (factoryInfo: ProfileFactoryInfo, formatName: (s: string) => string): string => {
    const parts: string[] = [];
    for (const f of factoryInfo.sliceAutoFields) {
        parts.push(`${pyFieldName(f.name, formatName)}: ${f.pyType} | None = None`);
    }
    for (const p of factoryInfo.params) {
        parts.push(`${pyFieldName(p.name, formatName)}: ${p.pyType}`);
    }
    if (parts.length === 0) return "";
    return `*, ${parts.join(", ")}`;
};

/** Build call-site args matching the param signature. */
const buildCallArgs = (factoryInfo: ProfileFactoryInfo, formatName: (s: string) => string): string => {
    const parts: string[] = [];
    for (const f of factoryInfo.sliceAutoFields) {
        const name = pyFieldName(f.name, formatName);
        parts.push(`${name}=${name}`);
    }
    for (const p of factoryInfo.params) {
        const name = pyFieldName(p.name, formatName);
        parts.push(`${name}=${name}`);
    }
    return parts.join(", ");
};

// ---------------------------------------------------------------------------
// Code generation
// ---------------------------------------------------------------------------

type FactoryMethodContext = {
    factoryInfo: ProfileFactoryInfo;
    className: string;
    baseTypeName: string;
    /** Base type with generic params filled in when slices are type-discriminated (e.g. `Bundle[Patient | Organization, Resource]`). Equals `baseTypeName` when no type params apply. */
    annotatedBaseTypeName: string;
    isResourceBase: boolean;
    hasParams: boolean;
};

const generateConstructor = (w: Python, ctx: FactoryMethodContext): void => {
    w.line(`def __init__(self, resource: ${ctx.annotatedBaseTypeName}) -> None:`);
    w.indentBlock(() => w.line("self._resource = resource"));
    w.line();
};

const generateFromResourceMethod = (w: Python, ctx: FactoryMethodContext): void => {
    const { annotatedBaseTypeName, className, isResourceBase } = ctx;
    w.line("@classmethod");
    w.line(`def from_resource(cls, resource: ${annotatedBaseTypeName}) -> "${className}":`);
    w.indentBlock(() => {
        if (isResourceBase) {
            w.line('meta = getattr(resource, "meta", None)');
            w.line('profiles = getattr(meta, "profile", None) if meta is not None else None');
            w.line("if profiles is None or cls.canonical_url not in profiles:");
            w.indentBlock(() => {
                w.line(`raise ValueError(f"${className}: meta.profile must include {cls.canonical_url}")`);
            });
        }
        w.line("profile = cls(resource)");
        w.line("result = profile.validate()");
        w.line('if result["errors"]:');
        w.indentBlock(() => w.line('raise ValueError("; ".join(result["errors"]))'));
        w.line("return profile");
    });
    w.line();
};

const generateApplyMethod = (w: Python, imports: ProfileImports, ctx: FactoryMethodContext): void => {
    const { annotatedBaseTypeName, className, isResourceBase } = ctx;
    w.line("@classmethod");
    w.line(`def apply(cls, resource: ${annotatedBaseTypeName}) -> "${className}":`);
    w.indentBlock(() => {
        if (isResourceBase) w.line(`${imports.helpers.use("ensure_profile")}(resource, cls.canonical_url)`);
        w.line("return cls(resource)");
    });
    w.line();
};

const generateCreateResourceMethod = (w: Python, imports: ProfileImports, ctx: FactoryMethodContext): void => {
    const { factoryInfo, baseTypeName, annotatedBaseTypeName, isResourceBase, hasParams } = ctx;
    const fmt = w.nameFormatFunction;
    w.line("@classmethod");
    if (hasParams) {
        w.line(`def create_resource(cls, ${buildParamSignature(factoryInfo, fmt)}) -> ${annotatedBaseTypeName}:`);
    } else {
        w.line(`def create_resource(cls) -> ${annotatedBaseTypeName}:`);
    }
    w.indentBlock(() => {
        for (const f of factoryInfo.sliceAutoFields) {
            const fieldName = pyFieldName(f.name, fmt);
            const matchRefs = f.sliceNames.map((s) => `cls.${pySliceStaticName(s)}`);
            if (matchRefs.length === 1) {
                w.line(
                    `${fieldName}_with_defaults = ${imports.helpers.use("ensure_slice_defaults")}(list(${fieldName} or []), ${matchRefs[0]})`,
                );
            } else {
                w.line(`${fieldName}_with_defaults = ${imports.helpers.use("ensure_slice_defaults")}(`);
                w.indentBlock(() => {
                    w.line(`list(${fieldName} or []),`);
                    for (const ref of matchRefs) w.line(`${ref},`);
                });
                w.line(")");
            }
        }
        if (factoryInfo.sliceAutoFields.length > 0) w.line();

        const buildArgs: string[] = [];
        for (const f of factoryInfo.autoFields) {
            buildArgs.push(`${pyFieldName(f.name, fmt)}=${f.value}`);
        }
        for (const f of factoryInfo.sliceAutoFields) {
            buildArgs.push(`${pyFieldName(f.name, fmt)}=${pyFieldName(f.name, fmt)}_with_defaults`);
        }
        for (const p of factoryInfo.params) {
            buildArgs.push(`${pyFieldName(p.name, fmt)}=${pyFieldName(p.name, fmt)}`);
        }
        if (isResourceBase) {
            buildArgs.push(`meta={"profile": [cls.canonical_url]}`);
        }

        if (buildArgs.length <= 2) {
            w.line(`return ${imports.helpers.use("build_resource")}(${baseTypeName}, ${buildArgs.join(", ")})`);
        } else {
            w.line(`return ${imports.helpers.use("build_resource")}(`);
            w.indentBlock(() => {
                w.line(`${baseTypeName},`);
                for (const arg of buildArgs) {
                    w.line(`${arg},`);
                }
            });
            w.line(")");
        }
    });
    w.line();
};

const generateCreateMethod = (w: Python, ctx: FactoryMethodContext): void => {
    const { factoryInfo, className, hasParams } = ctx;
    w.line("@classmethod");
    if (hasParams) {
        w.line(`def create(cls, ${buildParamSignature(factoryInfo, w.nameFormatFunction)}) -> "${className}":`);
        w.indentBlock(() =>
            w.line(`return cls.apply(cls.create_resource(${buildCallArgs(factoryInfo, w.nameFormatFunction)}))`),
        );
    } else {
        w.line(`def create(cls) -> "${className}":`);
        w.indentBlock(() => w.line("return cls.apply(cls.create_resource())"));
    }
    w.line();
};

const generateToResourceMethod = (w: Python, ctx: FactoryMethodContext): void => {
    w.line(`def to_resource(self) -> ${ctx.annotatedBaseTypeName}:`);
    w.indentBlock(() => w.line("return self._resource"));
    w.line();
};

export const generateFactoryMethods = (
    w: Python,
    imports: ProfileImports,
    tsIndex: TypeSchemaIndex,
    snapshot: SnapshotProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
    sliceDefs: SliceDef[],
): void => {
    const baseTypeName = profilePyType(imports, snapshot.base);
    const typedResources = [
        ...new Set(
            sliceDefs
                .filter((s) => s.isTypeDiscriminated)
                .map((s) => s.typeDiscriminatorType)
                .filter((resource): resource is string => resource !== undefined),
        ),
    ];
    const annotatedBaseTypeName =
        typedResources.length > 0
            ? `${baseTypeName}[${typedResources.join(" | ")}, ${imports.types.use(resolveFhirType(tsIndex, snapshot, "Resource"))}]`
            : baseTypeName;
    const ctx: FactoryMethodContext = {
        factoryInfo,
        className: pyProfileClassName(snapshot),
        baseTypeName,
        annotatedBaseTypeName,
        isResourceBase: isResourceIdentifier(snapshot.base),
        hasParams: factoryInfo.params.length > 0 || factoryInfo.sliceAutoFields.length > 0,
    };
    generateConstructor(w, ctx);
    generateFromResourceMethod(w, ctx);
    generateApplyMethod(w, imports, ctx);
    generateCreateResourceMethod(w, imports, ctx);
    generateCreateMethod(w, ctx);
    generateToResourceMethod(w, ctx);
};

export const generateFieldAccessors = (
    w: Python,
    imports: ProfileImports,
    snapshot: SnapshotProfileTypeSchema,
    factoryInfo: ProfileFactoryInfo,
    methodNames: ProfileMethodBaseNames,
): void => {
    const fmt = w.nameFormatFunction;
    const className = pyProfileClassName(snapshot);
    for (const p of factoryInfo.params) {
        const fieldName = pyFieldName(p.name, fmt);
        const methodSuffix = pySnakeName(p.name);
        w.line(`def get_${methodSuffix}(self) -> ${p.pyType} | None:${p.refComment ?? ""}`);
        w.indentBlock(() => {
            w.line(
                `return ${imports.typing.use("cast")}('${p.pyType} | None', getattr(self._resource, ${JSON.stringify(fieldName)}, None))`,
            );
        });
        w.line();
        w.line(`def set_${methodSuffix}(self, value: ${p.pyType}) -> "${className}":${p.refComment ?? ""}`);
        w.indentBlock(() => {
            w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, value)`);
            w.line("return self");
        });
        w.line();
    }

    for (const a of factoryInfo.accessors) {
        const methodSuffix = pySnakeName(a.name);
        if (methodNames.allBaseNames.has(methodSuffix)) continue;
        const fieldName = pyFieldName(a.name, fmt);
        w.line(`def get_${methodSuffix}(self) -> ${a.pyType} | None:${a.refComment ?? ""}`);
        w.indentBlock(() => {
            w.line(
                `return ${imports.typing.use("cast")}('${a.pyType} | None', getattr(self._resource, ${JSON.stringify(fieldName)}, None))`,
            );
        });
        w.line();
        w.line(`def set_${methodSuffix}(self, value: ${a.pyType}) -> "${className}":${a.refComment ?? ""}`);
        w.indentBlock(() => {
            if (a.choiceSiblings?.length) {
                for (const sibling of a.choiceSiblings) {
                    w.line(`setattr(self._resource, ${JSON.stringify(pyFieldName(sibling, fmt))}, None)`);
                }
            }
            w.line(`setattr(self._resource, ${JSON.stringify(fieldName)}, value)`);
            w.line("return self");
        });
        w.line();
    }
};
