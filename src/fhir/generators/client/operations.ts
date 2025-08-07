/**
 * FHIR Operations Support with Type Safety
 *
 * Implements comprehensive FHIR operations including resource-level, type-level,
 * and system-level operations with full type safety and parameter validation.
 */

import type { AnyTypeSchema } from "../../../typeschema/lib-types";

/**
 * FHIR Operation definition
 */
export interface OperationDefinition {
	name: string;
	kind: "operation";
	level: "system" | "type" | "instance";
	resource?: string;
	code: string;
	parameters?: OperationParameter[];
	returnType?: string;
	description?: string;
	url?: string;
}

/**
 * Operation parameter definition
 */
export interface OperationParameter {
	name: string;
	use: "in" | "out";
	min: number;
	max: string; // "1" or "*"
	type?: string;
	documentation?: string;
	searchType?: string;
	binding?: {
		strength: "required" | "extensible" | "preferred" | "example";
		valueSet?: string;
	};
}

/**
 * Built-in FHIR operations registry
 */
export const FHIR_OPERATIONS: Record<string, OperationDefinition[]> = {
	Patient: [
		{
			name: "$everything",
			kind: "operation",
			level: "instance",
			resource: "Patient",
			code: "everything",
			description: "Fetch all information related to a patient",
			parameters: [
				{
					name: "start",
					use: "in",
					min: 0,
					max: "1",
					type: "date",
					documentation: "Start date for the records to include",
				},
				{
					name: "end",
					use: "in",
					min: 0,
					max: "1",
					type: "date",
					documentation: "End date for the records to include",
				},
				{
					name: "_type",
					use: "in",
					min: 0,
					max: "*",
					type: "code",
					documentation: "Resource types to include",
				},
				{
					name: "_count",
					use: "in",
					min: 0,
					max: "1",
					type: "integer",
					documentation: "Number of resources to return",
				},
			],
			returnType: "Bundle",
		},
		{
			name: "$match",
			kind: "operation",
			level: "type",
			resource: "Patient",
			code: "match",
			description:
				"Find patient records that match the provided patient record",
			parameters: [
				{
					name: "resource",
					use: "in",
					min: 1,
					max: "1",
					type: "Patient",
					documentation: "Patient resource to match against",
				},
				{
					name: "onlyCertainMatches",
					use: "in",
					min: 0,
					max: "1",
					type: "boolean",
					documentation: "Only return matches with high confidence",
				},
				{
					name: "count",
					use: "in",
					min: 0,
					max: "1",
					type: "integer",
					documentation: "Maximum number of matches to return",
				},
			],
			returnType: "Bundle",
		},
	],
	Observation: [
		{
			name: "$lastn",
			kind: "operation",
			level: "type",
			resource: "Observation",
			code: "lastn",
			description: "Fetch the last N observations for patients",
			parameters: [
				{
					name: "max",
					use: "in",
					min: 0,
					max: "1",
					type: "positiveInt",
					documentation: "Maximum number of observations per code",
				},
				{
					name: "patient",
					use: "in",
					min: 0,
					max: "*",
					type: "reference",
					documentation: "Patient references to limit the search",
				},
				{
					name: "category",
					use: "in",
					min: 0,
					max: "*",
					type: "token",
					documentation: "Category codes to filter observations",
				},
				{
					name: "code",
					use: "in",
					min: 0,
					max: "*",
					type: "token",
					documentation: "Observation codes to filter",
				},
			],
			returnType: "Bundle",
		},
	],
	Resource: [
		{
			name: "$validate",
			kind: "operation",
			level: "type",
			resource: "Resource",
			code: "validate",
			description: "Validate a resource against the base FHIR specification",
			parameters: [
				{
					name: "resource",
					use: "in",
					min: 0,
					max: "1",
					type: "Resource",
					documentation: "Resource to validate",
				},
				{
					name: "mode",
					use: "in",
					min: 0,
					max: "1",
					type: "code",
					documentation: "Validation mode (create, update, delete)",
				},
				{
					name: "profile",
					use: "in",
					min: 0,
					max: "1",
					type: "canonical",
					documentation: "Profile to validate against",
				},
			],
			returnType: "OperationOutcome",
		},
	],
	system: [
		{
			name: "$batch",
			kind: "operation",
			level: "system",
			code: "batch",
			description: "Execute a bundle as a batch",
			parameters: [
				{
					name: "bundle",
					use: "in",
					min: 1,
					max: "1",
					type: "Bundle",
					documentation: "Bundle to execute as batch",
				},
			],
			returnType: "Bundle",
		},
		{
			name: "$transaction",
			kind: "operation",
			level: "system",
			code: "transaction",
			description: "Execute a bundle as a transaction",
			parameters: [
				{
					name: "bundle",
					use: "in",
					min: 1,
					max: "1",
					type: "Bundle",
					documentation: "Bundle to execute as transaction",
				},
			],
			returnType: "Bundle",
		},
	],
};

/**
 * Operation registry for managing FHIR operations
 */
export class OperationRegistry {
	private operations: Map<string, OperationDefinition[]> = new Map();

	constructor() {
		// Load built-in operations
		for (const [resource, ops] of Object.entries(FHIR_OPERATIONS)) {
			this.operations.set(resource, ops);
		}
	}

	/**
	 * Register a new operation
	 */
	register(operation: OperationDefinition): void {
		const key = operation.resource || "system";
		const existing = this.operations.get(key) || [];
		existing.push(operation);
		this.operations.set(key, existing);
	}

	/**
	 * Get operations for a resource type
	 */
	getOperations(resource: string): OperationDefinition[] {
		return this.operations.get(resource) || [];
	}

	/**
	 * Get all operations
	 */
	getAllOperations(): Map<string, OperationDefinition[]> {
		return new Map(this.operations);
	}

	/**
	 * Find operation by name and resource
	 */
	findOperation(name: string, resource?: string): OperationDefinition | null {
		const key = resource || "system";
		const operations = this.operations.get(key) || [];
		return operations.find((op) => op.name === name) || null;
	}
}

/**
 * Operation parameter builder for type safety
 */
export class OperationParameterBuilder {
	private parameters: Record<string, any> = {};

	constructor(private operation: OperationDefinition) {}

	/**
	 * Set a parameter value with validation
	 */
	setParameter(name: string, value: any): this {
		const paramDef = this.operation.parameters?.find((p) => p.name === name);

		if (!paramDef) {
			throw new Error(
				`Parameter '${name}' is not defined for operation '${this.operation.name}'`,
			);
		}

		// Basic validation
		if (paramDef.min > 0 && (value === undefined || value === null)) {
			throw new Error(
				`Parameter '${name}' is required for operation '${this.operation.name}'`,
			);
		}

		// Type validation could be added here
		this.parameters[name] = value;
		return this;
	}

	/**
	 * Build the parameters object
	 */
	build(): Record<string, any> {
		// Validate required parameters
		for (const param of this.operation.parameters || []) {
			if (param.min > 0 && !(param.name in this.parameters)) {
				throw new Error(
					`Required parameter '${param.name}' is missing for operation '${this.operation.name}'`,
				);
			}
		}

		return { ...this.parameters };
	}
}

/**
 * Operation builder for fluent API
 */
export class OperationBuilder<T extends string = string> {
	constructor(
		private client: any,
		private resourceType: T,
		private id?: string,
	) {}

	/**
	 * Execute $everything operation on Patient
	 */
	$everything(options?: {
		start?: Date;
		end?: Date;
		_type?: string[];
		_count?: number;
	}): Promise<any> {
		if (this.resourceType !== ("Patient" as T)) {
			throw new Error(
				"$everything operation is only available for Patient resources",
			);
		}

		if (!this.id) {
			throw new Error("$everything requires a patient ID");
		}

		const params = new URLSearchParams();
		if (options?.start) {
			params.append("start", options.start.toISOString().split("T")[0]);
		}
		if (options?.end) {
			params.append("end", options.end.toISOString().split("T")[0]);
		}
		if (options?._type) {
			params.append("_type", options._type.join(","));
		}
		if (options?._count) {
			params.append("_count", options._count.toString());
		}

		return this.client.operation(
			this.resourceType,
			this.id,
			"$everything",
			params,
		);
	}

	/**
	 * Execute $match operation on Patient
	 */
	$match(
		resource: any,
		options?: {
			onlyCertainMatches?: boolean;
			count?: number;
		},
	): Promise<any> {
		if (this.resourceType !== ("Patient" as T)) {
			throw new Error(
				"$match operation is only available for Patient resources",
			);
		}

		if (this.id) {
			throw new Error(
				"$match is a type-level operation and does not accept an instance ID",
			);
		}

		const parameters = {
			resource,
			onlyCertainMatches: options?.onlyCertainMatches,
			count: options?.count,
		};

		return this.client.operation(this.resourceType, null, "$match", parameters);
	}

	/**
	 * Execute $lastn operation on Observation
	 */
	$lastn(options?: {
		max?: number;
		patient?: string[];
		category?: string[];
		code?: string[];
	}): Promise<any> {
		if (this.resourceType !== ("Observation" as T)) {
			throw new Error(
				"$lastn operation is only available for Observation resources",
			);
		}

		if (this.id) {
			throw new Error(
				"$lastn is a type-level operation and does not accept an instance ID",
			);
		}

		const params = new URLSearchParams();
		if (options?.max) {
			params.append("max", options.max.toString());
		}
		if (options?.patient) {
			options.patient.forEach((p) => params.append("patient", p));
		}
		if (options?.category) {
			options.category.forEach((c) => params.append("category", c));
		}
		if (options?.code) {
			options.code.forEach((c) => params.append("code", c));
		}

		return this.client.operation(this.resourceType, null, "$lastn", params);
	}

	/**
	 * Execute $validate operation
	 */
	$validate(
		resource: any,
		options?: {
			mode?: "create" | "update" | "delete";
			profile?: string;
		},
	): Promise<any> {
		const parameters = {
			resource,
			mode: options?.mode,
			profile: options?.profile,
		};

		return this.client.operation(
			this.resourceType,
			this.id,
			"$validate",
			parameters,
		);
	}

	/**
	 * Execute custom operation
	 */
	operation(name: string, parameters?: Record<string, any>): Promise<any> {
		return this.client.operation(this.resourceType, this.id, name, parameters);
	}
}

/**
 * Generate operation classes for specific resource types
 */
export function generateOperationClasses(
	resources: AnyTypeSchema[],
	operationRegistry: OperationRegistry,
): string {
	const classes: string[] = [];

	for (const resource of resources) {
		if (resource.identifier.kind !== "resource") continue;

		const resourceType = resource.identifier.name;
		const operations = operationRegistry.getOperations(resourceType);

		if (operations.length === 0) continue;

		const className = `${resourceType}Operations`;

		classes.push(`
/**
 * ${resourceType} operations with type safety
 */
export class ${className} {
  constructor(private client: any) {}

${operations.map((op) => generateOperationMethod(op, resourceType)).join("\n\n")}
}`);
	}

	return classes.join("\n\n");
}

/**
 * Generate operation method for a specific operation
 */
function generateOperationMethod(
	operation: OperationDefinition,
	resourceType: string,
): string {
	const methodName = operation.name.replace("$", "");
	const parameters = operation.parameters || [];

	// Generate parameter interface
	const inputParams = parameters.filter((p) => p.use === "in");
	const paramInterface =
		inputParams.length > 0
			? `{\n${inputParams
					.map((p) => {
						const optional = p.min === 0 ? "?" : "";
						const type = mapFHIRTypeToTS(p.type || "any");
						const arrayType = p.max === "*" ? `${type}[]` : type;
						return `    ${p.name}${optional}: ${arrayType};`;
					})
					.join("\n")}\n  }`
			: "{}";

	// Generate method signature
	const paramType = inputParams.length > 0 ? paramInterface : "";
	const hasRequiredParams = inputParams.some((p) => p.min > 0);
	const paramArg =
		inputParams.length > 0
			? `${hasRequiredParams ? "" : "?"}: ${paramType}`
			: "";

	const returnType = operation.returnType || "any";

	return `  /**
   * ${operation.description || `Execute ${operation.name} operation`}
   * @see ${operation.url || `https://hl7.org/fhir/${resourceType.toLowerCase()}-operation-${operation.code}.html`}
   */
  async ${methodName}(${operation.level === "instance" ? "id: string, " : ""}params${paramArg}): Promise<${returnType}> {
    ${generateOperationImplementation(operation, resourceType)}
  }`;
}

/**
 * Generate operation implementation
 */
function generateOperationImplementation(
	operation: OperationDefinition,
	resourceType: string,
): string {
	if (operation.level === "instance") {
		return `return this.client.operation('${resourceType}', id, '${operation.name}', params);`;
	} else {
		return `return this.client.operation('${resourceType}', null, '${operation.name}', params);`;
	}
}

/**
 * Map FHIR parameter types to TypeScript types
 */
function mapFHIRTypeToTS(fhirType: string): string {
	const typeMap: Record<string, string> = {
		string: "string",
		code: "string",
		uri: "string",
		url: "string",
		canonical: "string",
		oid: "string",
		uuid: "string",
		id: "string",
		markdown: "string",
		base64Binary: "string",
		integer: "number",
		positiveInt: "number",
		unsignedInt: "number",
		decimal: "number",
		boolean: "boolean",
		date: "Date",
		dateTime: "Date",
		instant: "Date",
		time: "string",
		token: "string",
		reference: "string",
		Resource: "any",
		Bundle: "Bundle",
		OperationOutcome: "OperationOutcome",
		Patient: "Patient",
		Observation: "Observation",
	};

	return typeMap[fhirType] || "any";
}

/**
 * Generate operation support code for REST client
 */
export function generateOperationSupportCode(): string {
	return `
  /**
   * Execute FHIR operation
   */
  async operation<T = any>(
    resourceType: string,
    id: string | null,
    operationName: string,
    parameters?: any
  ): Promise<T> {
    const path = this.buildOperationPath(resourceType, id, operationName);
    
    if (parameters instanceof URLSearchParams) {
      // GET operation with query parameters
      const queryString = parameters.toString();
      const url = queryString ? \`\${path}?\${queryString}\` : path;
      return this.request<T>('GET', url);
    } else {
      // POST operation with body parameters
      return this.request<T>('POST', path, parameters);
    }
  }

  /**
   * Build operation path
   */
  private buildOperationPath(
    resourceType: string,
    id: string | null,
    operationName: string
  ): string {
    if (id) {
      // Instance-level operation
      return \`\${resourceType}/\${id}/\${operationName}\`;
    } else {
      // Type-level operation
      return \`\${resourceType}/\${operationName}\`;
    }
  }

  /**
   * Execute system-level operation
   */
  async systemOperation<T = any>(
    operationName: string,
    parameters?: any
  ): Promise<T> {
    return this.request<T>('POST', operationName, parameters);
  }
  `;
}
