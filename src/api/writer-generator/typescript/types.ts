import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { Writer } from "@root/api/writer-generator/writer";
import type {
	ChoiceFieldDeclaration,
	Field,
	Identifier,
	NestedType,
	RegularField,
	TypeSchema,
} from "@root/typeschema/types";

/**
 * Context passed to all generation functions
 */
export interface GenerationContext {
	writer: Writer;
	tsIndex: TypeSchemaIndex;
	schema: TypeSchema;
}

/**
 * Options for field generation
 */
export interface FieldGenerationOptions {
	includeOptional?: boolean;
	includeArraySuffix?: boolean;
	includeComments?: boolean;
}
