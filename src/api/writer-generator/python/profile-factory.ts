import {
    type ChoiceFieldInstance,
    type Field,
    isChoiceDeclarationField,
    isChoiceInstanceField,
    isNotChoiceDeclarationField,
    isResourceIdentifier,
    type RegularField,
    type SnapshotProfileTypeSchema,
    type TypeIdentifier,
} from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { pyTypeFromIdentifier } from "./naming-utils";
import { pyFieldName, pySliceStaticName, pySnakeName } from "./profile-naming";
import { collectRequiredSliceNames } from "./profile-slices";
import type { Python } from "./writer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProfileFactoryInfo = {
    autoFields: { name: string; value: string }[];
    sliceAutoFields: { name: string; pyType: string; typeId: TypeIdentifier; sliceNames: string[] }[];
    params: { name: string; pyType: string; typeId: TypeIdentifier }[];
    accessors: { name: string; pyType: string; typeId: TypeIdentifier; choiceSiblings?: string[] }[];
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
    field: RegularField | ChoiceFieldInstance,
    resolveRef?: TypeSchemaIndex["findLastSpecializationByIdentifier"],
): string => {
    const resolved = resolveRef ? resolveRef(field.type) : field.type;
    const base = pyTypeFromIdentifier(resolved);
    if (base === "str" && field.enum && !field.enum.isOpen && field.enum.values.length > 0) {
        const literal = `Literal[${field.enum.values.map((v) => JSON.stringify(v)).join(", ")}]`;
        return field.array ? `list[${literal}]` : literal;
    }
    return field.array ? `list[${base}]` : base;
};

// ---------------------------------------------------------------------------
// Factory info collection
// ---------------------------------------------------------------------------

/** Try to promote a required single-choice declaration to a direct param. */
const tryPromoteChoice = (
    field: Field,
    fields: Record<string, Field>,
    params: ProfileFactoryInfo["params"],
    promotedChoices: Set<string>,
): void => {
    if (!isChoiceDeclarationField(field) || !field.required || field.choices.length !== 1) return;
    const choiceName = field.choices[0];
    if (!choiceName) return;
    const choiceField = fields[choiceName];
    if (!choiceField || !isChoiceInstanceField(choiceField)) return;
    const pyType = pyTypeFromIdentifier(choiceField.type) + (choiceField.array ? "[]" : "");
    params.push({ name: choiceName, pyType, typeId: choiceField.type });
    promotedChoices.add(choiceName);
};

/** Include base-type required fields not already covered by profile constraints. */
const collectBaseRequiredParams = (
    tsIndex: TypeSchemaIndex,
    flatProfile: SnapshotProfileTypeSchema,
    resolveRef: TypeSchemaIndex["findLastSpecializationByIdentifier"],
    params: ProfileFactoryInfo["params"],
    coveredNames: string[],
): void => {
    const covered = new Set(coveredNames);
    const baseSchema = tsIndex.resolveType(flatProfile.base);
    if (!baseSchema || !("fields" in baseSchema) || !baseSchema.fields) return;
    for (const [name, field] of Object.entries(baseSchema.fields)) {
        if (covered.has(name)) continue;
        if (!field.required) continue;
        if (isChoiceInstanceField(field)) continue;
        if (isChoiceDeclarationField(field)) continue;
        if (isNotChoiceDeclarationField(field) && field.type) {
            const pyType = fieldPyType(field, resolveRef);
            params.push({ name, pyType, typeId: field.type });
        }
    }
};

export const collectProfileFactoryInfo = (
    tsIndex: TypeSchemaIndex,
    flatProfile: SnapshotProfileTypeSchema,
): ProfileFactoryInfo => {
    const autoFields: ProfileFactoryInfo["autoFields"] = [];
    const sliceAutoFields: ProfileFactoryInfo["sliceAutoFields"] = [];
    const params: ProfileFactoryInfo["params"] = [];
    const autoAccessors: ProfileFactoryInfo["accessors"] = [];
    const pendingChoiceInstances: [string, ChoiceFieldInstance][] = [];
    const fields = flatProfile.fields;
    const promotedChoices = new Set<string>();
    const resolveRef = tsIndex.findLastSpecializationByIdentifier;
    // Maps each choice instance name to all sibling instance names (from the same declaration).
    const choiceGroups = new Map<string, string[]>();
    for (const [, field] of Object.entries(fields)) {
        if (isChoiceDeclarationField(field)) {
            for (const choice of field.choices) choiceGroups.set(choice, field.choices);
        }
    }

    if (isResourceIdentifier(flatProfile.base)) {
        autoFields.push({ name: "resourceType", value: JSON.stringify(flatProfile.base.name) });
    }

    for (const [name, field] of Object.entries(fields)) {
        if (field.excluded) continue;
        if (isChoiceInstanceField(field)) {
            pendingChoiceInstances.push([name, field]);
            continue;
        }

        if (isChoiceDeclarationField(field)) {
            tryPromoteChoice(field, fields, params, promotedChoices);
            continue;
        }

        if (field.valueConstraint) {
            const value = JSON.stringify(field.valueConstraint.value);
            autoFields.push({ name, value: field.array ? `[${value}]` : value });
            if (isNotChoiceDeclarationField(field) && field.type) {
                const pyType = fieldPyType(field, resolveRef);
                autoAccessors.push({ name, pyType, typeId: field.type });
            }
            continue;
        }

        if (isNotChoiceDeclarationField(field)) {
            const sliceNames = collectRequiredSliceNames(field);
            if (sliceNames) {
                if (field.type) {
                    const pyType = fieldPyType(field, resolveRef);
                    sliceAutoFields.push({ name, pyType, typeId: field.type, sliceNames });
                    autoAccessors.push({ name, pyType, typeId: field.type });
                }
                continue;
            }
        }

        if (field.required) {
            const pyType = fieldPyType(field, resolveRef);
            params.push({ name, pyType, typeId: field.type });
        }
    }

    collectBaseRequiredParams(tsIndex, flatProfile, resolveRef, params, [
        ...autoFields.map((f) => f.name),
        ...sliceAutoFields.map((f) => f.name),
        ...params.map((f) => f.name),
        ...promotedChoices,
    ]);

    const choiceAccessors: ProfileFactoryInfo["accessors"] = [];
    for (const [name, field] of pendingChoiceInstances) {
        if (promotedChoices.has(name)) continue;
        const pyType = pyTypeFromIdentifier(field.type) + (field.array ? "[]" : "");
        const choiceSiblings = (choiceGroups.get(name) ?? []).filter((s) => s !== name && !promotedChoices.has(s));
        choiceAccessors.push({ name, pyType, typeId: field.type, choiceSiblings });
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
                w.line(`${fieldName}_with_defaults = ensure_slice_defaults(list(${fieldName} or []), ${matchRefs[0]})`);
            } else {
                w.line(`${fieldName}_with_defaults = ensure_slice_defaults(`);
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
            w.line(`return build_resource(${baseTypeName}, ${buildArgs.join(", ")})`);
        } else {
            w.line(`return build_resource(`);
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
    className: string,
    factoryInfo: ProfileFactoryInfo,
    extSliceMethodBaseNames: Set<string>,
): void => {
    const fmt = w.nameFormatFunction;
    for (const p of factoryInfo.params) {
        const fieldName = pyFieldName(p.name, fmt);
        const methodSuffix = pySnakeName(p.name);
        w.line(`def get_${methodSuffix}(self) -> ${p.pyType} | None:`);
        w.indentBlock(() => {
            w.line(`return cast('${p.pyType} | None', getattr(self._resource, ${JSON.stringify(fieldName)}, None))`);
        });
        w.line();
        w.line(`def set_${methodSuffix}(self, value: ${p.pyType}) -> "${className}":`);
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
        w.line(`def get_${methodSuffix}(self) -> ${a.pyType} | None:`);
        w.indentBlock(() => {
            w.line(`return cast('${a.pyType} | None', getattr(self._resource, ${JSON.stringify(fieldName)}, None))`);
        });
        w.line();
        w.line(`def set_${methodSuffix}(self, value: ${a.pyType}) -> "${className}":`);
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
