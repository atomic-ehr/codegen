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
import { type ProfileImports, profilePyType } from "./imports";
import { pyLiteral, pyReferenceTypeParam } from "./naming-utils";
import { pyFieldName, pySliceStaticName, pySnakeName } from "./profile-naming";
import { collectRequiredSliceNames } from "./profile-slices";
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
export const fieldPyType = (
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

/** Trailing `#` comment with the profile URLs of a reference field's targets.
 *  Profile targets are replaced by their base resource type in the annotation;
 *  the URLs are kept here to make server-side validation errors traceable. */
export const pyReferenceComment = (field: RegularField | ChoiceFieldInstance): string | undefined => {
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
    const pendingChoiceInstances: [string, ChoiceFieldInstance][] = [];
    const fields = snapshot.fields;
    const promotedChoices = new Set<string>();
    // Maps each choice instance name to all sibling instance names (from the same declaration).
    const choiceGroups: Record<string, string[]> = {};
    for (const [, field] of Object.entries(fields)) {
        if (isChoiceDeclarationField(field)) {
            for (const choice of field.choices) choiceGroups[choice] = field.choices;
        }
    }

    if (isResourceIdentifier(snapshot.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(snapshot.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) {
            pendingChoiceInstances.push([name, field]);
            continue;
        }

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

    const choiceAccessors: ProfileFactoryInfo["accessors"] = [];
    for (const [name, field] of pendingChoiceInstances) {
        if (promotedChoices.has(name)) continue;
        const pyType = pyChoiceInstanceType(imports, field, tsIndex);
        const choiceSiblings = (choiceGroups[name] ?? []).filter((s) => s !== name && !promotedChoices.has(s));
        choiceAccessors.push({
            name,
            pyType,
            choiceSiblings,
            refComment: pyReferenceComment(field),
        });
    }

    return { autoFields, sliceAutoFields, params, accessors: [...autoAccessors, ...choiceAccessors] };
};

// ---------------------------------------------------------------------------
// Param signature / call args builders
// ---------------------------------------------------------------------------

/** Build `*, param1: Type1, param2: Type2` keyword-only signature. */
export const buildParamSignature = (factoryInfo: ProfileFactoryInfo, formatName: (s: string) => string): string => {
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
export const buildCallArgs = (factoryInfo: ProfileFactoryInfo, formatName: (s: string) => string): string => {
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

export const generateCreateResource = (
    w: Python,
    imports: ProfileImports,
    baseTypeName: string,
    annotatedBaseTypeName: string,
    isResourceBase: boolean,
    hasParams: boolean,
    factoryInfo: ProfileFactoryInfo,
): void => {
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
};

export const generateFieldAccessors = (
    w: Python,
    imports: ProfileImports,
    className: string,
    factoryInfo: ProfileFactoryInfo,
    extSliceMethodBaseNames: Set<string>,
): void => {
    const fmt = w.nameFormatFunction;
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
        if (extSliceMethodBaseNames.has(methodSuffix)) continue;
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
