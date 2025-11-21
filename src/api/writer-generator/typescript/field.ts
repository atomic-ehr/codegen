import type { Field, Identifier } from "@root/typeschema/types";
import { isChoiceDeclarationField, isNestedIdentifier, isPrimitiveIdentifier } from "@root/typeschema/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import { resolvePrimitiveType, tsResourceName } from "./utils";

export function resolveFieldType(field: Field, tsIndex: TypeSchemaIndex): string {
    if (isChoiceDeclarationField(field)) {
        return "unknown";
    }

    if (field.enum) {
        return field.enum.map((e) => `"${e}"`).join(" | ");
    }

    return resolveIdentifierType(field.type, tsIndex);
}

export function resolveIdentifierType(identifier: Identifier, _tsIndex: TypeSchemaIndex): string {
    if (isPrimitiveIdentifier(identifier)) {
        return resolvePrimitiveType(identifier.name);
    }

    if (isNestedIdentifier(identifier)) {
        return tsResourceName(identifier);
    }

    return identifier.name;
}
