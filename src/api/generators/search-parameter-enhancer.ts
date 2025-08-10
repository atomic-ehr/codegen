/**
 * Search Parameter Enhancer
 *
 * Generates enhanced search parameter types and interfaces for FHIR resources.
 * Provides better type safety, validation, and developer experience for search operations.
 */

import type { TypeSchema } from "../../typeschema";

/**
 * Search parameter modifier types for enhanced type safety
 */
export interface SearchModifiers {
	/** String search modifiers */
	StringModifier:
		| { exact: string }
		| { contains: string }
		| { missing: boolean };

	/** Date parameter with prefix support */
	DateParameter:
		| string
		| { gt: string }
		| { lt: string }
		| { ge: string }
		| { le: string }
		| { eq: string }
		| { ne: string }
		| { missing: boolean };

	/** Token parameter for coded values */
	TokenParameter:
		| string
		| { system: string; code: string }
		| { code: string }
		| { system: string }
		| { missing: boolean };

	/** Token search options (for better autocomplete when enum values exist) */
	TokenSearchOptions:
		| { system: string; code: string }
		| { code: string }
		| { system: string }
		| { missing: boolean };

	/** Reference parameter for resource references */
	ReferenceParameter:
		| string
		| { reference: string }
		| { identifier: string }
		| { missing: boolean };

	/** Number parameter with range support */
	NumberParameter:
		| number
		| { gt: number }
		| { lt: number }
		| { ge: number }
		| { le: number }
		| { eq: number }
		| { ne: number }
		| { missing: boolean };

	/** Quantity parameter for measurements */
	QuantityParameter:
		| number
		| string
		| { value: number; unit?: string; system?: string; code?: string }
		| { missing: boolean };
}

/**
 * Base search parameters available for all resources
 */
export interface BaseEnhancedSearchParams {
	/** Number of results to return */
	_count?: number;
	/** Pagination offset */
	_offset?: number;
	/** Sort order */
	_sort?: string | string[];
	/** Summary mode */
	_summary?: "true" | "false" | "text" | "data" | "count";
	/** Elements to include */
	_elements?: string | string[];
	/** Filter by last updated */
	_lastUpdated?: SearchModifiers["DateParameter"];
	/** Profile filter */
	_profile?: string | string[];
	/** Security label filter */
	_security?: string | string[];
	/** Tag filter */
	_tag?:
		| SearchModifiers["TokenParameter"]
		| SearchModifiers["TokenParameter"][];
	/** Filter by ID */
	_id?: string | string[];
	/** Text search */
	_text?: string;
	/** Content search */
	_content?: string;
}

/**
 * Search Parameter Enhancer class
 *
 * Generates enhanced type-safe search parameters and validation helpers
 * for FHIR REST client operations.
 */
export class SearchParameterEnhancer {
	private resourceTypes = new Set<string>();
	private resourceSearchParams = new Map<
		string,
		Array<{
			name: string;
			type:
				| "string"
				| "number"
				| "date"
				| "token"
				| "reference"
				| "composite"
				| "quantity"
				| "uri";
			target?: string[];
			description?: string;
		}>
	>();
	private autocompleteEnabled: boolean;
	private valueSetEnumsEnabled: boolean;
	private availableEnumTypes = new Map<string, string>();
	private static readonly BASE_PARAM_NAMES: readonly string[] = [
		"_count",
		"_offset",
		"_sort",
		"_summary",
		"_elements",
		"_lastUpdated",
		"_profile",
		"_security",
		"_tag",
		"_id",
		"_text",
		"_content",
	];

	constructor(options?: { autocomplete?: boolean; valueSetEnums?: boolean }) {
		this.autocompleteEnabled = !!options?.autocomplete;
		this.valueSetEnumsEnabled = !!options?.valueSetEnums;
		console.log(
			`[DEBUG] SearchParameterEnhancer initialized: autocomplete=${this.autocompleteEnabled}, valueSetEnums=${this.valueSetEnumsEnabled}`,
		);
	}

	/**
	 * Generate per-resource SearchParamName unions (for IDE autocomplete)
	 */
	private generateSearchParamNameUnions(): string {
		const baseUnion = SearchParameterEnhancer.BASE_PARAM_NAMES.map(
			(n) => `'${n}'`,
		).join(" | ");
		const parts: string[] = [];
		parts.push(
			`/**\n * Base search parameter names available for all resources\n */`,
		);
		parts.push(`export type BaseSearchParamName = ${baseUnion};`);
		parts.push("");

		const resourceTypesArray = Array.from(this.resourceTypes).sort();

		for (const [resourceType, params] of this.resourceSearchParams.entries()) {
			const specificNames = Array.from(
				new Set(params.map((p) => p.name)),
			).sort();
			const specificUnion = specificNames.map((n) => `'${n}'`).join(" | ");
			const typeName = `${resourceType}SearchParamName`;
			if (specificUnion.length > 0) {
				parts.push(`/**\n * Search parameter names for ${resourceType}\n */`);
				parts.push(
					`export type ${typeName} = BaseSearchParamName | ${specificUnion};`,
				);
			} else {
				parts.push(`export type ${typeName} = BaseSearchParamName;`);
			}
			parts.push("");
		}

		// Generic mapping type
		const mappingLines = resourceTypesArray
			.map((t) => `\tT extends '${t}' ? ${t}SearchParamName :`)
			.join("\n");
		parts.push(
			`/**\n * Generic search parameter name union for a given resource type\n */`,
		);
		parts.push(
			`export type SearchParamName<T extends ResourceTypes> =\n${mappingLines}\n\tBaseSearchParamName;`,
		);

		return parts.join("\n");
	}

	/**
	 * Collect resource types and their search parameters from schemas
	 */
	collectResourceData(schemas: TypeSchema[]): void {
		this.resourceTypes.clear();
		this.resourceSearchParams.clear();

		for (const schema of schemas) {
			if (
				schema.identifier.kind === "resource" &&
				schema.identifier.name !== "DomainResource" &&
				schema.identifier.name !== "Resource"
			) {
				this.resourceTypes.add(schema.identifier.name);
				this.collectSearchParameters(schema);
			}
		}
	}

	/**
	 * Collect search parameters for a specific resource type
	 */
	private collectSearchParameters(schema: TypeSchema): void {
		const resourceType = schema.identifier.name;
		const searchParams: Array<{
			name: string;
			type:
				| "string"
				| "number"
				| "date"
				| "token"
				| "reference"
				| "composite"
				| "quantity"
				| "uri";
			target?: string[];
			description?: string;
		}> = [];

		// Add common search parameters based on FHIR specification
		this.addCommonSearchParameters(resourceType, searchParams);

		this.resourceSearchParams.set(resourceType, searchParams);
	}

	/**
	 * Add common search parameters based on resource type
	 */
	private addCommonSearchParameters(
		resourceType: string,
		searchParams: Array<{
			name: string;
			type:
				| "string"
				| "number"
				| "date"
				| "token"
				| "reference"
				| "composite"
				| "quantity"
				| "uri";
			target?: string[];
			description?: string;
		}>,
	): void {
		// Add resource-specific search parameters based on FHIR R4 specification
		switch (resourceType) {
			case "Patient":
				searchParams.push(
					{
						name: "active",
						type: "token",
						description: "Whether the patient record is active",
					},
					{
						name: "address",
						type: "string",
						description:
							"A server defined search that may match any of the string fields in the Address",
					},
					{
						name: "address-city",
						type: "string",
						description: "A city specified in an address",
					},
					{
						name: "address-country",
						type: "string",
						description: "A country specified in an address",
					},
					{
						name: "address-postalcode",
						type: "string",
						description: "A postalCode specified in an address",
					},
					{
						name: "address-state",
						type: "string",
						description: "A state specified in an address",
					},
					{
						name: "address-use",
						type: "token",
						description: "A use code specified in an address",
					},
					{
						name: "birthdate",
						type: "date",
						description: "The patient's date of birth",
					},
					{
						name: "death-date",
						type: "date",
						description:
							"The date of death has been provided and satisfies this search value",
					},
					{
						name: "deceased",
						type: "token",
						description:
							"This patient has been marked as deceased, or as a death date entered",
					},
					{
						name: "email",
						type: "token",
						description: "A value in an email contact",
					},
					{
						name: "family",
						type: "string",
						description: "A portion of the family name of the patient",
					},
					{
						name: "gender",
						type: "token",
						description: "Gender of the patient",
					},
					{
						name: "general-practitioner",
						type: "reference",
						target: ["Organization", "Practitioner", "PractitionerRole"],
						description: "Patient's nominated general practitioner",
					},
					{
						name: "given",
						type: "string",
						description: "A portion of the given name of the patient",
					},
					{
						name: "identifier",
						type: "token",
						description: "A patient identifier",
					},
					{
						name: "language",
						type: "token",
						description: "Language code (irrespective of use value)",
					},
					{
						name: "link",
						type: "reference",
						target: ["Patient", "RelatedPerson"],
						description: "All patients linked to the given patient",
					},
					{
						name: "name",
						type: "string",
						description:
							"A server defined search that may match any of the string fields in the HumanName",
					},
					{
						name: "organization",
						type: "reference",
						target: ["Organization"],
						description:
							"The organization that is the custodian of the patient record",
					},
					{
						name: "phone",
						type: "token",
						description: "A value in a phone contact",
					},
					{
						name: "phonetic",
						type: "string",
						description:
							"A portion of either family or given name using some kind of phonetic matching algorithm",
					},
					{
						name: "telecom",
						type: "token",
						description:
							"The value in any kind of telecom details of the patient",
					},
				);
				break;

			case "Observation":
				searchParams.push(
					{
						name: "category",
						type: "token",
						description: "The classification of the type of observation",
					},
					{
						name: "code",
						type: "token",
						description: "The code of the observation type",
					},
					{
						name: "component-code",
						type: "token",
						description: "The component code of the observation type",
					},
					{
						name: "component-data-absent-reason",
						type: "token",
						description:
							"The reason why the expected value in the element Observation.component.value[x] is missing",
					},
					{
						name: "component-value-concept",
						type: "token",
						description:
							"The value of the component observation, if the value is a CodeableConcept",
					},
					{
						name: "component-value-quantity",
						type: "quantity",
						description:
							"The value of the component observation, if the value is a Quantity, or a SampledData",
					},
					{
						name: "data-absent-reason",
						type: "token",
						description:
							"The reason why the expected value in the element Observation.value[x] is missing",
					},
					{
						name: "date",
						type: "date",
						description:
							"Obtained date/time. If the obtained element is a period, a date that falls in the period",
					},
					{
						name: "derived-from",
						type: "reference",
						target: [
							"DocumentReference",
							"ImagingStudy",
							"Media",
							"QuestionnaireResponse",
							"Observation",
							"MolecularSequence",
						],
						description: "Related measurements the observation is made from",
					},
					{
						name: "device",
						type: "reference",
						target: ["Device", "DeviceMetric"],
						description: "The Device that generated the observation data",
					},
					{
						name: "encounter",
						type: "reference",
						target: ["Encounter"],
						description: "Encounter related to the observation",
					},
					{
						name: "focus",
						type: "reference",
						target: ["Resource"],
						description:
							"The focus of an observation when the focus is not the patient of record",
					},
					{
						name: "has-member",
						type: "reference",
						target: [
							"Observation",
							"QuestionnaireResponse",
							"MolecularSequence",
						],
						description:
							"Related resource that belongs to the Observation group",
					},
					{
						name: "identifier",
						type: "token",
						description: "The unique id for a particular observation",
					},
					{
						name: "method",
						type: "token",
						description: "The method used for the observation",
					},
					{
						name: "part-of",
						type: "reference",
						target: [
							"MedicationAdministration",
							"MedicationDispense",
							"MedicationStatement",
							"Procedure",
							"Immunization",
							"ImagingStudy",
						],
						description: "Part of referenced event",
					},
					{
						name: "patient",
						type: "reference",
						target: ["Patient"],
						description:
							"The subject that the observation is about (if patient)",
					},
					{
						name: "performer",
						type: "reference",
						target: [
							"Practitioner",
							"PractitionerRole",
							"Organization",
							"CareTeam",
							"Patient",
							"RelatedPerson",
						],
						description: "Who performed the observation",
					},
					{
						name: "specimen",
						type: "reference",
						target: ["Specimen"],
						description: "Specimen used for this observation",
					},
					{
						name: "status",
						type: "token",
						description: "The status of the observation",
					},
					{
						name: "subject",
						type: "reference",
						target: ["Patient", "Group", "Device", "Location"],
						description: "The subject that the observation is about",
					},
					{
						name: "value-concept",
						type: "token",
						description:
							"The value of the observation, if the value is a CodeableConcept",
					},
					{
						name: "value-date",
						type: "date",
						description:
							"The value of the observation, if the value is a date or period of time",
					},
					{
						name: "value-quantity",
						type: "quantity",
						description:
							"The value of the observation, if the value is a Quantity, or a SampledData",
					},
					{
						name: "value-string",
						type: "string",
						description:
							"The value of the observation, if the value is a string, and also searches in CodeableConcept.text",
					},
				);
				break;

			case "Organization":
				searchParams.push(
					{
						name: "active",
						type: "token",
						description: "Is the Organization record active",
					},
					{
						name: "address",
						type: "string",
						description:
							"A server defined search that may match any of the string fields in the Address",
					},
					{
						name: "address-city",
						type: "string",
						description: "A city specified in an address",
					},
					{
						name: "address-country",
						type: "string",
						description: "A country specified in an address",
					},
					{
						name: "address-postalcode",
						type: "string",
						description: "A postal code specified in an address",
					},
					{
						name: "address-state",
						type: "string",
						description: "A state specified in an address",
					},
					{
						name: "address-use",
						type: "token",
						description: "A use code specified in an address",
					},
					{
						name: "endpoint",
						type: "reference",
						target: ["Endpoint"],
						description:
							"Technical endpoints providing access to services operated for the organization",
					},
					{
						name: "identifier",
						type: "token",
						description:
							"Any identifier for the organization (not the accreditation issuer's identifier)",
					},
					{
						name: "name",
						type: "string",
						description: "A portion of the organization's name or alias",
					},
					{
						name: "partof",
						type: "reference",
						target: ["Organization"],
						description:
							"An organization of which this organization forms a part",
					},
					{
						name: "phonetic",
						type: "string",
						description:
							"A portion of the organization's name using some kind of phonetic matching algorithm",
					},
					{
						name: "type",
						type: "token",
						description: "A code for the type of organization",
					},
				);
				break;

			case "Practitioner":
				searchParams.push(
					{
						name: "active",
						type: "token",
						description: "Whether the practitioner record is active",
					},
					{
						name: "address",
						type: "string",
						description:
							"A server defined search that may match any of the string fields in the Address",
					},
					{
						name: "address-city",
						type: "string",
						description: "A city specified in an address",
					},
					{
						name: "address-country",
						type: "string",
						description: "A country specified in an address",
					},
					{
						name: "address-postalcode",
						type: "string",
						description: "A postal code specified in an address",
					},
					{
						name: "address-state",
						type: "string",
						description: "A state specified in an address",
					},
					{
						name: "address-use",
						type: "token",
						description: "A use code specified in an address",
					},
					{
						name: "communication",
						type: "token",
						description:
							"One of the languages that the practitioner can communicate with",
					},
					{
						name: "email",
						type: "token",
						description: "A value in an email contact",
					},
					{
						name: "family",
						type: "string",
						description: "A portion of the family name",
					},
					{
						name: "gender",
						type: "token",
						description: "Gender of the practitioner",
					},
					{
						name: "given",
						type: "string",
						description: "A portion of the given name",
					},
					{
						name: "identifier",
						type: "token",
						description: "A practitioner's Identifier",
					},
					{
						name: "name",
						type: "string",
						description:
							"A server defined search that may match any of the string fields in the HumanName",
					},
					{
						name: "phone",
						type: "token",
						description: "A value in a phone contact",
					},
					{
						name: "phonetic",
						type: "string",
						description:
							"A portion of either family or given name using some kind of phonetic matching algorithm",
					},
					{
						name: "telecom",
						type: "token",
						description: "The value in any kind of contact",
					},
				);
				break;

			default:
				// Add common search parameters for all resources
				searchParams.push({
					name: "identifier",
					type: "token",
					description: "Resource identifier",
				});
				break;
		}
	}

	/**
	 * Generate value set union type aliases (curated set)
	 */
	private generateValueSetUnionTypes(): string {
		return `/**\n * Curated ValueSet unions (string literal types)\n */\nexport type PatientGender = 'male' | 'female' | 'other' | 'unknown';\nexport type ObservationStatus = 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';\nexport type ImmunizationStatus = 'completed' | 'entered-in-error' | 'not-done';`;
	}

	/**
	 * Pre-populate enum types by processing all search parameters
	 */
	private preprocessEnumTypes(): void {
		// Clear any existing enum types
		this.availableEnumTypes.clear();

		// Process all search parameters to populate enum types
		for (const [
			resourceType,
			searchParams,
		] of this.resourceSearchParams.entries()) {
			for (const param of searchParams) {
				if (param.type === "token" && this.valueSetEnumsEnabled) {
					// Generate enum type name based on FHIR naming convention: ResourceFieldValues
					const enumTypeName = `${resourceType}${this.toPascalCase(param.name)}Values`;

					// Add the enum type to our available types
					// The TypeScript generator will have already created these if they exist
					this.availableEnumTypes.set(
						`${resourceType}${param.name}`,
						enumTypeName,
					);
				}
			}
		}
	}

	/**
	 * Convert string to PascalCase
	 */
	private toPascalCase(str: string): string {
		return str
			.split(/[-_\s]/)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
			.join("");
	}

	/**
	 * Generate enhanced search parameter types
	 */
	generateEnhancedSearchTypes(): string {
		const resourceTypesArray = Array.from(this.resourceTypes).sort();

		// Pre-populate enum types by processing all search parameters
		this.preprocessEnumTypes();

		const enumImports =
			this.valueSetEnumsEnabled && this.availableEnumTypes.size > 0
				? `import type { ${Array.from(new Set(this.availableEnumTypes.values())).sort().join(", ")} } from '../types/utility';\n`
				: "";

		return `/**
	* Enhanced Search Parameter Types
	* 
	* Type-safe search parameters with modifiers and validation for FHIR resources.
	* Generated automatically from FHIR schemas.
	*/

import type { ResourceTypes } from '../types';
${enumImports}

/**
* Search parameter modifier types for enhanced type safety
*/
export interface SearchModifiers {
	/** String search modifiers */
	StringModifier: 
		| { exact: string }
		| { contains: string } 
		| { missing: boolean };
	
	/** Date parameter with prefix support */
	DateParameter: 
		| string 
		| { gt: string } 
		| { lt: string } 
		| { ge: string } 
		| { le: string } 
		| { eq: string }
		| { ne: string }
		| { missing: boolean };
	
	/** Token parameter for coded values */
	TokenParameter: 
		| string 
		| { system: string; code: string } 
		| { code: string }
		| { system: string }
		| { missing: boolean };
	
	/** Token search options (for better autocomplete when enum values exist) */
	TokenSearchOptions: 
		| { system: string; code: string } 
		| { code: string }
		| { system: string }
		| { missing: boolean };
	
	/** Reference parameter for resource references */
	ReferenceParameter: 
		| string 
		| { reference: string }
		| { identifier: string }
		| { missing: boolean };
	
	/** Number parameter with range support */
	NumberParameter: 
		| number 
		| { gt: number } 
		| { lt: number } 
		| { ge: number } 
		| { le: number } 
		| { eq: number }
		| { ne: number }
		| { missing: boolean };
	
	/** Quantity parameter for measurements */
	QuantityParameter: 
		| number 
		| string
		| { value: number; unit?: string; system?: string; code?: string }
		| { missing: boolean };
}

/**
 * Base search parameters available for all resources
 */
export interface BaseEnhancedSearchParams {
	/** Number of results to return */
	_count?: number;
	/** Pagination offset */
	_offset?: number;
	/** Sort order */
	_sort?: string | string[];
	/** Summary mode */
	_summary?: 'true' | 'false' | 'text' | 'data' | 'count';
	/** Elements to include */
	_elements?: string | string[];
	/** Filter by last updated */
	_lastUpdated?: SearchModifiers['DateParameter'];
	/** Profile filter */
	_profile?: string | string[];
	/** Security label filter */
	_security?: string | string[];
	/** Tag filter */
	_tag?: SearchModifiers['TokenParameter'] | SearchModifiers['TokenParameter'][];
	/** Filter by ID */
	_id?: string | string[];
	/** Text search */
	_text?: string;
	/** Content search */
	_content?: string;
}

/**
 * Enhanced search parameters union type for all resources
 */
export type EnhancedSearchParams<T extends ResourceTypes> = 
${resourceTypesArray.map((type) => `	T extends '${type}' ? ${type}SearchParams :`).join("\n")}
	BaseEnhancedSearchParams;

${this.generateResourceSpecificSearchInterfaces()}

${this.autocompleteEnabled ? this.generateSearchParamNameUnions() : ""}

/**
 * Type-safe search parameter validation helpers
 */
export class SearchParameterValidator {
	/**
	 * Validate search parameters for a specific resource type
	 */
	static validate<T extends ResourceTypes>(
		resourceType: T, 
		params: EnhancedSearchParams<T>
	): { valid: boolean; errors: string[] } {
		const errors: string[] = [];
		
		// Basic validation logic
		if (params._count !== undefined && (params._count < 0 || params._count > 1000)) {
			errors.push('_count must be between 0 and 1000');
		}
		
		if (params._offset !== undefined && params._offset < 0) {
			errors.push('_offset must be non-negative');
		}

		return {
			valid: errors.length === 0,
			errors
		};
	}

	/**
	 * Build URL search parameters from enhanced search params
	 */
	static buildSearchParams<T extends ResourceTypes>(
		resourceType: T,
		params: EnhancedSearchParams<T>
	): URLSearchParams {
		const searchParams = new URLSearchParams();

		for (const [key, value] of Object.entries(params)) {
			if (value === undefined || value === null) continue;

			if (Array.isArray(value)) {
				value.forEach(v => searchParams.append(key, String(v)));
			} else if (typeof value === 'object') {
				// Handle complex parameter objects
				if ('exact' in value) {
					searchParams.append(key + ':exact', String(value.exact));
				} else if ('contains' in value) {
					searchParams.append(key + ':contains', String(value.contains));
				} else if ('missing' in value) {
					searchParams.append(key + ':missing', String(value.missing));
				} else if ('gt' in value) {
					searchParams.append(key + ':gt', String(value.gt));
				} else if ('lt' in value) {
					searchParams.append(key + ':lt', String(value.lt));
				} else if ('ge' in value) {
					searchParams.append(key + ':ge', String(value.ge));
				} else if ('le' in value) {
					searchParams.append(key + ':le', String(value.le));
				} else if ('eq' in value) {
					searchParams.append(key + ':eq', String(value.eq));
				} else if ('ne' in value) {
					searchParams.append(key + ':ne', String(value.ne));
				} else if ('system' in value && 'code' in value) {
					searchParams.append(key, \`\${value.system}|\${value.code}\`);
				} else if ('system' in value) {
					searchParams.append(key, \`\${value.system}|\`);
				} else if ('code' in value) {
					searchParams.append(key, \`|\${value.code}\`);
				} else if ('reference' in value) {
					searchParams.append(key, String(value.reference));
				} else if ('identifier' in value) {
					searchParams.append(key + ':identifier', String(value.identifier));
				}
			} else {
				searchParams.append(key, String(value));
			}
		}

		return searchParams;
	}
}`;
	}

	/**
	 * Generate resource-specific search parameter interfaces
	 */
	private generateResourceSpecificSearchInterfaces(): string {
		const interfaces: string[] = [];

		for (const [
			resourceType,
			searchParams,
		] of this.resourceSearchParams.entries()) {
			interfaces.push(
				this.generateResourceSearchInterface(resourceType, searchParams),
			);
		}

		return interfaces.join("\n\n");
	}

	/**
	 * Generate search interface for a specific resource type
	 */
	private generateResourceSearchInterface(
		resourceType: string,
		searchParams: Array<{
			name: string;
			type:
				| "string"
				| "number"
				| "date"
				| "token"
				| "reference"
				| "composite"
				| "quantity"
				| "uri";
			target?: string[];
			description?: string;
		}>,
	): string {
		const interfaceFields: string[] = [];

		// Add base search parameters
		interfaceFields.push("	// Base search parameters");
		interfaceFields.push("	_count?: number;");
		interfaceFields.push("	_offset?: number;");
		interfaceFields.push("	_sort?: string | string[];");
		interfaceFields.push(
			"	_summary?: 'true' | 'false' | 'text' | 'data' | 'count';",
		);
		interfaceFields.push("	_elements?: string | string[];");
		interfaceFields.push("	_lastUpdated?: SearchModifiers['DateParameter'];");
		interfaceFields.push("	_profile?: string | string[];");
		interfaceFields.push("	_security?: string | string[];");
		interfaceFields.push(
			"	_tag?: SearchModifiers['TokenParameter'] | SearchModifiers['TokenParameter'][];",
		);
		interfaceFields.push("	_id?: string | string[];");
		interfaceFields.push("	_text?: string;");
		interfaceFields.push("	_content?: string;");
		interfaceFields.push("");

		// Add resource-specific parameters
		if (searchParams.length > 0) {
			interfaceFields.push(`	// ${resourceType}-specific search parameters`);

			for (const param of searchParams) {
				const typeMapping = this.getTypeScriptTypeForSearchParameter(
					resourceType,
					param,
				);
				const comment = param.description ? ` /** ${param.description} */` : "";
				interfaceFields.push(`${comment}`);
				interfaceFields.push(`	'${param.name}'?: ${typeMapping};`);
			}
		}

		return `/**
 * Enhanced search parameters for ${resourceType} resources
 */
export interface ${resourceType}SearchParams extends BaseEnhancedSearchParams {
${interfaceFields.join("\n")}
}`;
	}

	/**
	 * Map FHIR search parameter types to TypeScript enhanced types
	 */
	private getTypeScriptTypeForSearchParameter(
		resourceType: string,
		param: {
			name: string;
			type:
				| "string"
				| "number"
				| "date"
				| "token"
				| "reference"
				| "composite"
				| "quantity"
				| "uri";
			target?: string[];
		},
	): string {
		switch (param.type) {
			case "string":
				return "string | SearchModifiers['StringModifier']";
			case "number":
				return "number | SearchModifiers['NumberParameter']";
			case "date":
				return "string | SearchModifiers['DateParameter']";
			case "token":
				if (this.valueSetEnumsEnabled) {
					// Look up enum type name from our preprocessing
					const enumTypeName = this.availableEnumTypes.get(
						`${resourceType}${param.name}`,
					);
					if (enumTypeName) {
						// Use the separate TokenSearchOptions type to avoid expanding the full union
						// This should help TypeScript prioritize the enum values in autocomplete
						return `${enumTypeName} | SearchModifiers['TokenSearchOptions']`;
					}
				}
				return "string | SearchModifiers['TokenParameter']";
			case "reference":
				if (param.target && param.target.length > 0) {
					// Specific target types are not encoded at type level for ReferenceParameter to keep it simple
					return `string | SearchModifiers['ReferenceParameter']`;
				}
				return "string | SearchModifiers['ReferenceParameter']";
			case "quantity":
				return "number | string | SearchModifiers['QuantityParameter']";
			case "uri":
				return "string";
			case "composite":
				return "string";
			default:
				return "string";
		}
	}

	/**
	 * Get collected resource types
	 */
	getResourceTypes(): Set<string> {
		return this.resourceTypes;
	}
}
