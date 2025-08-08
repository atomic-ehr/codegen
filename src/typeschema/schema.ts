export const validationSchema = {
	$schema: "http://json-schema.org/draft-07/schema#",
	$id: "https://fhir-clj.github.io/type-schema/json-schema/type-schema.json",
	$comment: "Maturity Level: Draft",
	title: "Type Schema",
	description:
		"A code generation friendly representation of FHIR StructureDefinition and FHIR Schema designed to simplify SDK resource classes/types generation.",
	type: "object",
	definitions: {
		"type-schema-identifier": {
			type: "object",
			oneOf: [
				{ $ref: "#/definitions/with-primitive-type-kind" },
				{ $ref: "#/definitions/with-valueset-kind" },
				{ $ref: "#/definitions/with-complex-type-kind" },
				{ $ref: "#/definitions/with-resource-kind" },
				{ $ref: "#/definitions/with-nested-kind" },
				{ $ref: "#/definitions/with-logical-kind" },
				{ $ref: "#/definitions/with-binding-kind" },
			],
			properties: {
				kind: {
					type: "string",
				},
				package: {
					type: "string",
					description: "The FHIR package identifier (e.g., hl7.fhir.r4.core)",
				},
				version: {
					type: "string",
					description: "The version of the package",
				},
				name: {
					type: "string",
					description: "Computer friendly identifier for the element",
				},
				url: {
					type: "string",
					pattern: "^(https?://|urn:)[^\\s]+$",
					description:
						"A canonical URL identifying this resource uniquely in the FHIR ecosystem",
				},
			},
			required: ["kind", "package", "version", "name", "url"],
			additionalProperties: false,
		},
		"with-primitive-type-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is primitive-type",
			properties: {
				kind: { const: "primitive-type" },
			},
		},
		"with-valueset-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is value-set",
			properties: {
				kind: { const: "value-set" },
			},
		},
		"with-binding-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is value-set",
			properties: {
				kind: { const: "binding" },
			},
		},
		"with-complex-type-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is complex-type",
			properties: {
				kind: { const: "complex-type" },
			},
		},
		"with-resource-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is resource",
			properties: {
				kind: { const: "resource" },
			},
		},
		"with-nested-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is nested",
			properties: {
				kind: { const: "nested" },
			},
		},
		"with-logical-kind": {
			type: "object",
			description: "Constraint helper to ensure the kind is logical",
			properties: {
				kind: { const: "logical" },
			},
		},
		"field.regular": {
			title: "Regular field",
			description: "A standard field with a single type",
			type: "object",
			properties: {
				type: {
					$ref: "#/definitions/type-schema-identifier",
					description: "The data type of this field",
				},
				reference: {
					type: "array",
					description: "Reference to other types that this field can point to",
					items: {
						$ref: "#/definitions/type-schema-identifier",
					},
				},
				required: {
					type: "boolean",
					default: false,
					description: "Whether this field must be provided in valid instances",
				},
				excluded: {
					type: "boolean",
					default: false,
					description: "Whether this field is prohibited in valid instances",
				},
				array: {
					type: "boolean",
					default: false,
					description:
						"Whether this field can contain multiple values (cardinality > 1)",
				},
				binding: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{ $ref: "#/definitions/with-binding-kind" },
					],
				},
				enum: {
					type: "array",
					items: { type: "string" },
					description:
						"For code fields, the set of valid values when bound to a required value set",
				},
				min: {
					type: "number",
					description: "Minimum limit of items for an array",
				},
				max: {
					type: "number",
					description: "Maximum limit of items for an array",
				},
			},
			required: ["type"],
			additionalProperties: false,
		},

		"field.polymorphic-declaration": {
			title: "Polymorphic value[x] field declaration",
			description:
				"The base declaration for a FHIR choice type (e.g., value[x])",
			type: "object",
			properties: {
				choices: {
					type: "array",
					items: { type: "string" },
					description:
						"The names of all concrete type options for this choice field",
				},
				required: {
					type: "boolean",
					default: false,
					description: "Whether at least one choice must be provided",
				},
				excluded: {
					type: "boolean",
					default: false,
					description: "Whether all choices are prohibited",
				},
				array: {
					type: "boolean",
					default: false,
					description:
						"Whether the selected choice can contain multiple values",
				},
				min: {
					type: "number",
					description: "Minimum limit of items for an array",
				},
				max: {
					type: "number",
					description: "Maximum limit of items for an array",
				},
			},
			required: ["choices"],
			additionalProperties: false,
		},

		"field.polymorphic-instance": {
			title: "Polymorphic value[x] field instance",
			description:
				"A specific type option for a FHIR choice type (e.g., valueString, valueInteger)",
			type: "object",
			properties: {
				choiceOf: {
					type: "string",
					description:
						"The name of the choice field this instance belongs to (e.g., 'value' for valueString)",
				},
				type: {
					$ref: "#/definitions/type-schema-identifier",
					description: "The data type of this choice option",
				},
				required: {
					type: "boolean",
					default: false,
					description: "Whether this specific choice must be provided",
				},
				excluded: {
					type: "boolean",
					default: false,
					description: "Whether this specific choice is prohibited",
				},
				array: {
					type: "boolean",
					default: false,
					description: "Whether this choice can contain multiple values",
				},
				reference: {
					type: "array",
					description: "Reference to other types that this field can point to",
					items: {
						$ref: "#/definitions/type-schema-identifier",
					},
				},
				binding: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{ $ref: "#/definitions/with-binding-kind" },
					],
					description:
						"For coded choices, information about the value set binding",
				},
				enum: {
					type: "array",
					items: { type: "string" },
					description:
						"For code fields, the set of valid values when bound to a required value set",
				},
				min: {
					type: "number",
					description: "Minimum limit of items for an array",
				},
				max: {
					type: "number",
					description: "Maximum limit of items for an array",
				},
			},
			required: ["type", "choiceOf"],
			additionalProperties: false,
		},
		dependencies: {
			type: "array",
			description: "Other types that this type depends on",
			items: {
				$ref: "#/definitions/type-schema-identifier",
			},
		},
	},

	oneOf: [
		{
			title: "Type Schema for Primitive Type",
			description:
				"Schema for basic FHIR data types like string, boolean, decimal",
			type: "object",
			properties: {
				identifier: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{ $ref: "#/definitions/with-primitive-type-kind" },
					],
					description: "The unique identifier for this primitive type",
				},
				description: {
					type: "string",
					description: "Human-readable description of the primitive type",
				},
				base: {
					$ref: "#/definitions/type-schema-identifier",
					description:
						"The base type this primitive type extends (typically Element)",
				},
				dependencies: {
					$ref: "#/definitions/dependencies",
					description: "Other types that this primitive type depends on",
				},
			},
			required: ["identifier", "base"],
			additionalProperties: false,
		},

		{
			title: "Type Schema for Resource, Complex Type, Logical",
			description:
				"Schema for FHIR resources, complex types, and logical types",
			type: "object",
			properties: {
				identifier: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{
							oneOf: [
								{ $ref: "#/definitions/with-resource-kind" },
								{ $ref: "#/definitions/with-complex-type-kind" },
								{ $ref: "#/definitions/with-logical-kind" },
							],
						},
					],
					description: "The unique identifier for this resource or type",
				},
				base: {
					$ref: "#/definitions/type-schema-identifier",
					description: "The base type this resource or type extends",
				},
				description: {
					type: "string",
					description: "Human-readable description of the resource or type",
				},
				fields: {
					type: "object",
					description: "The fields contained in this resource or type",
					additionalProperties: {
						anyOf: [
							{ $ref: "#/definitions/field.regular" },
							{ $ref: "#/definitions/field.polymorphic-declaration" },
							{ $ref: "#/definitions/field.polymorphic-instance" },
						],
					},
				},
				nested: {
					type: "array",
					description:
						"BackboneElement types nested within this resource or type",
					items: {
						type: "object",
						properties: {
							identifier: {
								allOf: [
									{ $ref: "#/definitions/type-schema-identifier" },
									{ $ref: "#/definitions/with-nested-kind" },
								],
								description: "The unique identifier for this nested type",
							},
							base: {
								$ref: "#/definitions/type-schema-identifier",
								description:
									"The base type this nested type extends (typically BackboneElement)",
							},
							fields: {
								type: "object",
								description: "The fields contained in this nested type",
								additionalProperties: {
									anyOf: [
										{ $ref: "#/definitions/field.regular" },
										{ $ref: "#/definitions/field.polymorphic-declaration" },
										{ $ref: "#/definitions/field.polymorphic-instance" },
									],
								},
							},
						},
						required: ["identifier", "base"],
						additionalProperties: false,
					},
				},
				dependencies: {
					type: "array",
					description: "Other types that this resource or type depends on",
					items: {
						$ref: "#/definitions/type-schema-identifier",
					},
				},
			},
			required: ["identifier"],
			additionalProperties: false,
		},

		{
			title: "Type Schema for ValueSet",
			description:
				"Schema for FHIR value sets that define terminology bindings",
			type: "object",
			properties: {
				identifier: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{ $ref: "#/definitions/with-valueset-kind" },
					],
					description: "The unique identifier for this value set",
				},
				description: {
					type: "string",
					description: "Human-readable description of the value set",
				},
				concept: {
					type: "array",
					description: "The list of coded concepts contained in this value set",
					items: {
						type: "object",
						properties: {
							code: {
								type: "string",
								description: "The code value",
							},
							display: {
								type: "string",
								description: "The human-readable display text for this code",
							},
							system: {
								type: "string",
								description: "The code system URL that defines this code",
							},
						},
						required: ["code"],
						additionalProperties: false,
					},
				},
				compose: {
					type: "object",
					description:
						"Complex value set composition rules when the value set is defined as a composition of other value sets",
				},
			},
			required: ["identifier"],
			additionalProperties: false,
		},

		{
			title: "Type Schema for Binding",
			type: "object",
			properties: {
				identifier: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{ $ref: "#/definitions/with-binding-kind" },
					],
					description: "The unique identifier for this value set",
				},
				description: {
					type: "string",
					description: "Human-readable description of the value set",
				},
				type: {
					$ref: "#/definitions/type-schema-identifier",
				},
				strength: {
					type: "string",
					description: "The strength of the binding",
				},
				enum: {
					type: "array",
					items: {
						type: "string",
					},
					description: "The enumeration of values for the binding",
				},
				valueset: {
					allOf: [
						{ $ref: "#/definitions/type-schema-identifier" },
						{ $ref: "#/definitions/with-valueset-kind" },
					],
				},
				dependencies: {
					type: "array",
					description: "Other types that this resource or type depends on",
					items: {
						$ref: "#/definitions/type-schema-identifier",
					},
				},
			},
			required: ["identifier"],
			additionalProperties: false,
		},
	],
};
