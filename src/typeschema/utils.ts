import type {
	PolymorphicValueXFieldInstance,
	RegularField,
	TypeSchema,
	TypeSchemaField,
	TypeSchemaForResourceComplexTypeLogical,
} from "./types";

export const isPolymorphicInstanceField = (
	field: TypeSchemaField,
): field is PolymorphicValueXFieldInstance => {
	return "choiceOf" in field;
};

export const isTypeSchemaValueSet = () => {};
export const isRegularField = (
	field: TypeSchemaField,
): field is RegularField => {
	return !("choices" in field);
};

export const isTypeSchemaBinding = () => {};

export const isTypeSchemaForResourceComplexTypeLogical = (
	schema: TypeSchema,
): schema is TypeSchemaForResourceComplexTypeLogical => {
	return (
		schema.identifier.kind === "resource" ||
		schema.identifier.kind === "complex-type" ||
		schema.identifier.kind === "logical"
	);
};
