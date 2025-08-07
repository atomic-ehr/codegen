/**
 * AST Builder and Manipulation API
 *
 * Provides low-level AST node creation, manipulation, and traversal utilities
 * for advanced code generation scenarios. Supports TypeScript AST structures
 * with memory-efficient operations.
 */

/**
 * Base AST node interface
 */
export interface ASTNode {
	kind: string;
	id?: string;
	parent?: ASTNode;
	children?: ASTNode[];
	metadata?: Record<string, any>;
	sourceRange?: SourceRange;
}

/**
 * Source code position information
 */
export interface SourceRange {
	start: Position;
	end: Position;
	filename?: string;
}

export interface Position {
	line: number;
	column: number;
	offset: number;
}

/**
 * TypeScript-specific AST node types
 */
export interface InterfaceDeclaration extends ASTNode {
	kind: "InterfaceDeclaration";
	name: string;
	typeParameters?: TypeParameterDeclaration[];
	extends?: TypeReference[];
	properties: PropertySignature[];
	exported?: boolean;
}

export interface PropertySignature extends ASTNode {
	kind: "PropertySignature";
	name: string;
	type: TypeNode;
	optional?: boolean;
	readonly?: boolean;
	documentation?: string;
}

export interface TypeParameterDeclaration extends ASTNode {
	kind: "TypeParameterDeclaration";
	name: string;
	constraint?: TypeNode;
	default?: TypeNode;
}

export interface TypeReference extends ASTNode {
	kind: "TypeReference";
	name: string;
	typeArguments?: TypeNode[];
}

export interface TypeNode extends ASTNode {
	kind:
		| "StringKeyword"
		| "NumberKeyword"
		| "BooleanKeyword"
		| "ArrayType"
		| "TypeReference"
		| "UnionType"
		| "LiteralType";
}

export interface ArrayType extends TypeNode {
	kind: "ArrayType";
	elementType: TypeNode;
}

export interface UnionType extends TypeNode {
	kind: "UnionType";
	types: TypeNode[];
}

export interface LiteralType extends TypeNode {
	kind: "LiteralType";
	value: string | number | boolean;
}

export interface ImportDeclaration extends ASTNode {
	kind: "ImportDeclaration";
	moduleSpecifier: string;
	namedImports?: string[];
	defaultImport?: string;
	namespaceImport?: string;
	typeOnly?: boolean;
}

export interface ExportDeclaration extends ASTNode {
	kind: "ExportDeclaration";
	namedExports?: string[];
	defaultExport?: string;
	moduleSpecifier?: string;
	typeOnly?: boolean;
}

/**
 * AST Builder class for constructing AST nodes
 */
export class ASTBuilder {
	private idCounter = 0;

	/**
	 * Generate a unique ID for AST nodes
	 */
	private generateId(): string {
		return `ast_${++this.idCounter}`;
	}

	/**
	 * Create a source range
	 */
	createSourceRange(
		startLine: number,
		startColumn: number,
		endLine: number,
		endColumn: number,
		filename?: string,
	): SourceRange {
		return {
			start: { line: startLine, column: startColumn, offset: 0 },
			end: { line: endLine, column: endColumn, offset: 0 },
			filename,
		};
	}

	/**
	 * Create an interface declaration
	 */
	createInterface(
		name: string,
		options: {
			exported?: boolean;
			typeParameters?: TypeParameterDeclaration[];
			extends?: TypeReference[];
			properties?: PropertySignature[];
			documentation?: string;
			sourceRange?: SourceRange;
		} = {},
	): InterfaceDeclaration {
		const node: InterfaceDeclaration = {
			kind: "InterfaceDeclaration",
			id: this.generateId(),
			name,
			typeParameters: options.typeParameters,
			extends: options.extends,
			properties: options.properties || [],
			exported: options.exported,
			sourceRange: options.sourceRange,
			metadata: options.documentation
				? { documentation: options.documentation }
				: undefined,
		};

		// Set parent references
		if (node.properties) {
			node.properties.forEach((prop) => {
				prop.parent = node;
			});
		}

		return node;
	}

	/**
	 * Create a property signature
	 */
	createProperty(
		name: string,
		type: TypeNode,
		options: {
			optional?: boolean;
			readonly?: boolean;
			documentation?: string;
			sourceRange?: SourceRange;
		} = {},
	): PropertySignature {
		const node: PropertySignature = {
			kind: "PropertySignature",
			id: this.generateId(),
			name,
			type,
			optional: options.optional,
			readonly: options.readonly,
			documentation: options.documentation,
			sourceRange: options.sourceRange,
		};

		// Set parent reference for type
		type.parent = node;

		return node;
	}

	/**
	 * Create a type parameter declaration
	 */
	createTypeParameter(
		name: string,
		constraint?: TypeNode,
		defaultType?: TypeNode,
	): TypeParameterDeclaration {
		const node: TypeParameterDeclaration = {
			kind: "TypeParameterDeclaration",
			id: this.generateId(),
			name,
			constraint,
			default: defaultType,
		};

		// Set parent references
		if (constraint) constraint.parent = node;
		if (defaultType) defaultType.parent = node;

		return node;
	}

	/**
	 * Create a type reference
	 */
	createTypeReference(name: string, typeArguments?: TypeNode[]): TypeReference {
		const node: TypeReference = {
			kind: "TypeReference",
			id: this.generateId(),
			name,
			typeArguments,
		};

		// Set parent references
		if (typeArguments) {
			typeArguments.forEach((arg) => {
				arg.parent = node;
			});
		}

		return node;
	}

	/**
	 * Create primitive type nodes
	 */
	createStringType(): TypeNode {
		return {
			kind: "StringKeyword",
			id: this.generateId(),
		};
	}

	createNumberType(): TypeNode {
		return {
			kind: "NumberKeyword",
			id: this.generateId(),
		};
	}

	createBooleanType(): TypeNode {
		return {
			kind: "BooleanKeyword",
			id: this.generateId(),
		};
	}

	/**
	 * Create an array type
	 */
	createArrayType(elementType: TypeNode): ArrayType {
		const node: ArrayType = {
			kind: "ArrayType",
			id: this.generateId(),
			elementType,
		};

		// Set parent reference
		elementType.parent = node;

		return node;
	}

	/**
	 * Create a union type
	 */
	createUnionType(types: TypeNode[]): UnionType {
		const node: UnionType = {
			kind: "UnionType",
			id: this.generateId(),
			types,
		};

		// Set parent references
		types.forEach((type) => {
			type.parent = node;
		});

		return node;
	}

	/**
	 * Create a literal type
	 */
	createLiteralType(value: string | number | boolean): LiteralType {
		return {
			kind: "LiteralType",
			id: this.generateId(),
			value,
		};
	}

	/**
	 * Create an import declaration
	 */
	createImport(
		moduleSpecifier: string,
		options: {
			namedImports?: string[];
			defaultImport?: string;
			namespaceImport?: string;
			typeOnly?: boolean;
		} = {},
	): ImportDeclaration {
		return {
			kind: "ImportDeclaration",
			id: this.generateId(),
			moduleSpecifier,
			namedImports: options.namedImports,
			defaultImport: options.defaultImport,
			namespaceImport: options.namespaceImport,
			typeOnly: options.typeOnly,
		};
	}

	/**
	 * Create an export declaration
	 */
	createExport(
		options: {
			namedExports?: string[];
			defaultExport?: string;
			moduleSpecifier?: string;
			typeOnly?: boolean;
		} = {},
	): ExportDeclaration {
		return {
			kind: "ExportDeclaration",
			id: this.generateId(),
			namedExports: options.namedExports,
			defaultExport: options.defaultExport,
			moduleSpecifier: options.moduleSpecifier,
			typeOnly: options.typeOnly,
		};
	}
}

/**
 * AST Manipulation utilities
 */
export class ASTManipulator {
	/**
	 * Add a property to an interface
	 */
	addPropertyToInterface(
		interfaceNode: InterfaceDeclaration,
		property: PropertySignature,
	): void {
		property.parent = interfaceNode;
		interfaceNode.properties.push(property);
	}

	/**
	 * Remove a property from an interface
	 */
	removePropertyFromInterface(
		interfaceNode: InterfaceDeclaration,
		propertyName: string,
	): boolean {
		const index = interfaceNode.properties.findIndex(
			(prop) => prop.name === propertyName,
		);
		if (index !== -1) {
			interfaceNode.properties.splice(index, 1);
			return true;
		}
		return false;
	}

	/**
	 * Find a property in an interface
	 */
	findPropertyInInterface(
		interfaceNode: InterfaceDeclaration,
		propertyName: string,
	): PropertySignature | undefined {
		return interfaceNode.properties.find((prop) => prop.name === propertyName);
	}

	/**
	 * Update property type
	 */
	updatePropertyType(property: PropertySignature, newType: TypeNode): void {
		newType.parent = property;
		property.type = newType;
	}

	/**
	 * Clone an AST node (deep copy)
	 */
	cloneNode<T extends ASTNode>(node: T): T {
		const cloned = JSON.parse(JSON.stringify(node)) as T;
		this.fixParentReferences(cloned);
		return cloned;
	}

	/**
	 * Fix parent references after cloning or deserialization
	 */
	private fixParentReferences(node: ASTNode, parent?: ASTNode): void {
		node.parent = parent;

		if (node.children) {
			node.children.forEach((child) => {
				this.fixParentReferences(child, node);
			});
		}

		// Handle specific node types
		switch (node.kind) {
			case "InterfaceDeclaration": {
				const interfaceNode = node as InterfaceDeclaration;
				if (interfaceNode.properties) {
					interfaceNode.properties.forEach((prop) => {
						this.fixParentReferences(prop, node);
					});
				}
				if (interfaceNode.typeParameters) {
					interfaceNode.typeParameters.forEach((param) => {
						this.fixParentReferences(param, node);
					});
				}
				break;
			}

			case "PropertySignature": {
				const propNode = node as PropertySignature;
				if (propNode.type) {
					this.fixParentReferences(propNode.type, node);
				}
				break;
			}

			case "ArrayType": {
				const arrayNode = node as ArrayType;
				if (arrayNode.elementType) {
					this.fixParentReferences(arrayNode.elementType, node);
				}
				break;
			}

			case "UnionType": {
				const unionNode = node as UnionType;
				if (unionNode.types) {
					unionNode.types.forEach((type) => {
						this.fixParentReferences(type, node);
					});
				}
				break;
			}
		}
	}

	/**
	 * Merge two interfaces (combining properties)
	 */
	mergeInterfaces(
		base: InterfaceDeclaration,
		extension: InterfaceDeclaration,
		options: {
			overrideProperties?: boolean;
			mergeName?: string;
		} = {},
	): InterfaceDeclaration {
		const builder = new ASTBuilder();

		const mergedName = options.mergeName || `${base.name}And${extension.name}`;
		const merged = builder.createInterface(mergedName, {
			exported: base.exported || extension.exported,
			typeParameters: [
				...(base.typeParameters || []),
				...(extension.typeParameters || []),
			],
			extends: [...(base.extends || []), ...(extension.extends || [])],
		});

		// Add properties from base
		base.properties.forEach((prop) => {
			const clonedProp = this.cloneNode(prop);
			this.addPropertyToInterface(merged, clonedProp);
		});

		// Add properties from extension
		extension.properties.forEach((prop) => {
			const existingProp = this.findPropertyInInterface(merged, prop.name);

			if (existingProp && options.overrideProperties) {
				// Override existing property
				const index = merged.properties.indexOf(existingProp);
				const clonedProp = this.cloneNode(prop);
				merged.properties[index] = clonedProp;
				clonedProp.parent = merged;
			} else if (!existingProp) {
				// Add new property
				const clonedProp = this.cloneNode(prop);
				this.addPropertyToInterface(merged, clonedProp);
			}
		});

		return merged;
	}

	/**
	 * Extract type information from a node
	 */
	extractTypeInfo(node: TypeNode): {
		name: string;
		isArray: boolean;
		isOptional: boolean;
		isUnion: boolean;
		unionTypes?: string[];
	} {
		const info = {
			name: "",
			isArray: false,
			isOptional: false,
			isUnion: false,
			unionTypes: undefined as string[] | undefined,
		};

		switch (node.kind) {
			case "StringKeyword":
				info.name = "string";
				break;
			case "NumberKeyword":
				info.name = "number";
				break;
			case "BooleanKeyword":
				info.name = "boolean";
				break;
			case "ArrayType": {
				const arrayType = node as ArrayType;
				const elementInfo = this.extractTypeInfo(arrayType.elementType);
				info.name = elementInfo.name;
				info.isArray = true;
				break;
			}
			case "TypeReference": {
				const typeRef = node as TypeReference;
				info.name = typeRef.name;
				break;
			}
			case "UnionType": {
				const unionType = node as UnionType;
				info.isUnion = true;
				info.unionTypes = unionType.types.map(
					(type) => this.extractTypeInfo(type).name,
				);
				info.name = info.unionTypes.join(" | ");
				break;
			}
			case "LiteralType": {
				const literalType = node as LiteralType;
				info.name =
					typeof literalType.value === "string"
						? `"${literalType.value}"`
						: String(literalType.value);
				break;
			}
			default:
				info.name = "unknown";
		}

		return info;
	}

	/**
	 * Validate AST structure integrity
	 */
	validateAST(node: ASTNode): {
		isValid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		const validateNode = (currentNode: ASTNode, path = ""): void => {
			const currentPath = path
				? `${path}.${currentNode.kind}`
				: currentNode.kind;

			// Check for required properties
			if (!currentNode.kind) {
				errors.push(`${currentPath}: Missing 'kind' property`);
			}

			// Check parent-child consistency
			if (currentNode.children) {
				currentNode.children.forEach((child, index) => {
					if (child.parent !== currentNode) {
						errors.push(
							`${currentPath}.children[${index}]: Parent reference mismatch`,
						);
					}
					validateNode(child, currentPath);
				});
			}

			// Validate specific node types
			switch (currentNode.kind) {
				case "InterfaceDeclaration": {
					const interfaceNode = currentNode as InterfaceDeclaration;
					if (!interfaceNode.name) {
						errors.push(`${currentPath}: Interface missing name`);
					}
					if (interfaceNode.properties) {
						interfaceNode.properties.forEach((prop, index) => {
							if (prop.parent !== interfaceNode) {
								errors.push(
									`${currentPath}.properties[${index}]: Parent reference mismatch`,
								);
							}
							validateNode(prop, currentPath);
						});
					}
					break;
				}

				case "PropertySignature": {
					const propNode = currentNode as PropertySignature;
					if (!propNode.name) {
						errors.push(`${currentPath}: Property missing name`);
					}
					if (!propNode.type) {
						errors.push(`${currentPath}: Property missing type`);
					} else {
						validateNode(propNode.type, currentPath);
					}
					break;
				}
			}
		};

		validateNode(node);

		return {
			isValid: errors.length === 0,
			errors,
		};
	}
}

/**
 * AST Traversal utilities
 */
export class ASTTraverser {
	/**
	 * Traverse AST with visitor pattern
	 */
	traverse<T extends ASTNode>(
		node: T,
		visitor: {
			enter?: (
				node: ASTNode,
				parent?: ASTNode,
				key?: string,
				index?: number,
			) => void | false;
			exit?: (
				node: ASTNode,
				parent?: ASTNode,
				key?: string,
				index?: number,
			) => void;
		},
	): void {
		this.traverseNode(node, visitor);
	}

	private traverseNode(
		node: ASTNode,
		visitor: {
			enter?: (
				node: ASTNode,
				parent?: ASTNode,
				key?: string,
				index?: number,
			) => void | false;
			exit?: (
				node: ASTNode,
				parent?: ASTNode,
				key?: string,
				index?: number,
			) => void;
		},
		parent?: ASTNode,
		key?: string,
		index?: number,
	): void {
		// Call enter visitor
		if (visitor.enter) {
			const shouldContinue = visitor.enter(node, parent, key, index);
			if (shouldContinue === false) {
				return; // Skip this subtree
			}
		}

		// Traverse children based on node type
		switch (node.kind) {
			case "InterfaceDeclaration": {
				const interfaceNode = node as InterfaceDeclaration;

				if (interfaceNode.typeParameters) {
					interfaceNode.typeParameters.forEach((param, idx) => {
						this.traverseNode(param, visitor, node, "typeParameters", idx);
					});
				}

				if (interfaceNode.extends) {
					interfaceNode.extends.forEach((ext, idx) => {
						this.traverseNode(ext, visitor, node, "extends", idx);
					});
				}

				if (interfaceNode.properties) {
					interfaceNode.properties.forEach((prop, idx) => {
						this.traverseNode(prop, visitor, node, "properties", idx);
					});
				}
				break;
			}

			case "PropertySignature": {
				const propNode = node as PropertySignature;
				if (propNode.type) {
					this.traverseNode(propNode.type, visitor, node, "type");
				}
				break;
			}

			case "ArrayType": {
				const arrayNode = node as ArrayType;
				if (arrayNode.elementType) {
					this.traverseNode(
						arrayNode.elementType,
						visitor,
						node,
						"elementType",
					);
				}
				break;
			}

			case "UnionType": {
				const unionNode = node as UnionType;
				if (unionNode.types) {
					unionNode.types.forEach((type, idx) => {
						this.traverseNode(type, visitor, node, "types", idx);
					});
				}
				break;
			}

			case "TypeReference": {
				const typeRefNode = node as TypeReference;
				if (typeRefNode.typeArguments) {
					typeRefNode.typeArguments.forEach((arg, idx) => {
						this.traverseNode(arg, visitor, node, "typeArguments", idx);
					});
				}
				break;
			}
		}

		// Traverse generic children if present
		if (node.children) {
			node.children.forEach((child, idx) => {
				this.traverseNode(child, visitor, node, "children", idx);
			});
		}

		// Call exit visitor
		if (visitor.exit) {
			visitor.exit(node, parent, key, index);
		}
	}

	/**
	 * Find nodes by predicate
	 */
	findNodes<T extends ASTNode>(
		root: ASTNode,
		predicate: (node: ASTNode) => node is T,
	): T[];
	findNodes(root: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode[];
	findNodes(root: ASTNode, predicate: (node: ASTNode) => boolean): ASTNode[] {
		const results: ASTNode[] = [];

		this.traverse(root, {
			enter: (node) => {
				if (predicate(node)) {
					results.push(node);
				}
			},
		});

		return results;
	}

	/**
	 * Find a node by ID
	 */
	findById(root: ASTNode, id: string): ASTNode | undefined {
		let result: ASTNode | undefined;

		this.traverse(root, {
			enter: (node) => {
				if (node.id === id) {
					result = node;
					return false; // Stop traversal
				}
			},
		});

		return result;
	}

	/**
	 * Get all nodes of a specific kind
	 */
	getNodesByKind<T extends ASTNode>(root: ASTNode, kind: string): T[] {
		return this.findNodes(root, (node): node is T => node.kind === kind);
	}

	/**
	 * Get path to a node (array of parent nodes)
	 */
	getNodePath(node: ASTNode): ASTNode[] {
		const path: ASTNode[] = [];
		let current: ASTNode | undefined = node;

		while (current) {
			path.unshift(current);
			current = current.parent;
		}

		return path;
	}
}

/**
 * Factory for creating commonly used AST patterns
 */
export class ASTPatterns {
	private builder = new ASTBuilder();

	/**
	 * Create a basic FHIR resource interface pattern
	 */
	createFHIRResourcePattern(
		resourceName: string,
		properties: Array<{
			name: string;
			type: TypeNode;
			optional?: boolean;
			documentation?: string;
		}>,
	): InterfaceDeclaration {
		// Add resourceType property
		const resourceTypeProperty = this.builder.createProperty(
			"resourceType",
			this.builder.createLiteralType(resourceName),
			{ documentation: `Resource type: ${resourceName}` },
		);

		// Create other properties
		const allProperties = [
			resourceTypeProperty,
			...properties.map((prop) =>
				this.builder.createProperty(prop.name, prop.type, {
					optional: prop.optional,
					documentation: prop.documentation,
				}),
			),
		];

		return this.builder.createInterface(resourceName, {
			exported: true,
			properties: allProperties,
			documentation: `FHIR ${resourceName} resource interface`,
		});
	}

	/**
	 * Create an optional property pattern
	 */
	createOptionalProperty(
		name: string,
		type: TypeNode,
		documentation?: string,
	): PropertySignature {
		return this.builder.createProperty(name, type, {
			optional: true,
			documentation,
		});
	}

	/**
	 * Create a required property pattern
	 */
	createRequiredProperty(
		name: string,
		type: TypeNode,
		documentation?: string,
	): PropertySignature {
		return this.builder.createProperty(name, type, {
			optional: false,
			documentation,
		});
	}

	/**
	 * Create an array property pattern
	 */
	createArrayProperty(
		name: string,
		elementType: TypeNode,
		optional = true,
		documentation?: string,
	): PropertySignature {
		return this.builder.createProperty(
			name,
			this.builder.createArrayType(elementType),
			{
				optional,
				documentation,
			},
		);
	}

	/**
	 * Create a union type property pattern
	 */
	createUnionProperty(
		name: string,
		types: TypeNode[],
		optional = true,
		documentation?: string,
	): PropertySignature {
		return this.builder.createProperty(
			name,
			this.builder.createUnionType(types),
			{
				optional,
				documentation,
			},
		);
	}
}
