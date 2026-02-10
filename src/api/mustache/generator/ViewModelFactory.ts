import { ListElementInformationMixinProvider } from "@mustache/generator/ListElementInformationMixinProvider";
import type { NameGenerator } from "@mustache/generator/NameGenerator";
import type {
    EnumViewModel,
    FieldViewModel,
    NamedViewModel,
    ResolvedTypeViewModel,
    RootViewModel,
    TypeViewModel,
    ViewModel,
} from "@mustache/types";
import { PRIMITIVE_TYPES } from "@mustache/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { IsPrefixed } from "@root/utils/types";
import {
    type ChoiceFieldInstance,
    type Field,
    type Identifier,
    isComplexTypeIdentifier,
    isNotChoiceDeclarationField,
    isResourceIdentifier,
    type NestedType,
    type RegularField,
    type TypeSchema,
} from "@typeschema/types";

export type ViewModelCache = {
    resourcesByUri: Record<string, TypeViewModel>;
    complexTypesByUri: Record<string, TypeViewModel>;
};

export class ViewModelFactory {
    private arrayMixinProvider: ListElementInformationMixinProvider = new ListElementInformationMixinProvider();

    constructor(
        private readonly tsIndex: TypeSchemaIndex,
        private readonly nameGenerator: NameGenerator,
        private readonly filterPred: (id: Identifier) => boolean,
    ) {}

    public createUtility(): RootViewModel<ViewModel> {
        return this._createForRoot();
    }

    public createComplexType(
        typeRef: Identifier,
        cache: ViewModelCache = { resourcesByUri: {}, complexTypesByUri: {} },
    ): RootViewModel<ResolvedTypeViewModel> {
        const base = this._createForComplexType(typeRef, cache);
        const parents = this._createParentsFor(base.schema, cache);
        const children = this._createChildrenFor(typeRef, cache);
        const inheritedFields = parents.flatMap((p) => p.fields);
        return this.arrayMixinProvider.apply({
            ...this._createForRoot(),
            ...base,
            parents,
            children,
            inheritedFields,
            allFields: [...base.fields, ...parents.flatMap((p) => p.fields)],

            hasChildren: children.length > 0,
            hasParents: parents.length > 0,
            hasInheritedFields: inheritedFields.length > 0,
        });
    }
    public createResource(
        typeRef: Identifier,
        cache: ViewModelCache = { resourcesByUri: {}, complexTypesByUri: {} },
    ): RootViewModel<ResolvedTypeViewModel> {
        const base = this._createForResource(typeRef, cache);
        const parents = this._createParentsFor(base.schema, cache);
        const children = this._createChildrenFor(typeRef, cache);
        const inheritedFields = parents.flatMap((p) => p.fields);
        return this.arrayMixinProvider.apply({
            ...this._createForRoot(),
            ...base,
            parents,
            children,
            inheritedFields,
            allFields: [...base.fields, ...inheritedFields],

            hasChildren: children.length > 0,
            hasParents: parents.length > 0,
            hasInheritedFields: inheritedFields.length > 0,
        });
    }

    private _createFor(typeRef: Identifier, cache: ViewModelCache, nestedIn?: TypeSchema): TypeViewModel {
        if (typeRef.kind === "complex-type") {
            return this._createForComplexType(typeRef, cache, nestedIn);
        }
        if (typeRef.kind === "resource") {
            return this._createForResource(typeRef, cache, nestedIn);
        }
        throw new Error(`Unknown type ${typeRef.kind}`);
    }

    private _createForComplexType(typeRef: Identifier, cache: ViewModelCache, nestedIn?: TypeSchema): TypeViewModel {
        const type = this.tsIndex.resolve(typeRef);
        if (!type) {
            throw new Error(`ComplexType ${typeRef.name} not found`);
        }
        if (!Object.hasOwn(cache.complexTypesByUri, type.identifier.url)) {
            cache.complexTypesByUri[type.identifier.url] = this._createTypeViewModel(type, cache, nestedIn);
        }
        const res = cache.complexTypesByUri[type.identifier.url];
        if (!res) throw new Error(`ComplexType ${typeRef.name} not found`);
        return res;
    }

    private _createForResource(typeRef: Identifier, cache: ViewModelCache, nestedIn?: TypeSchema): TypeViewModel {
        const type = this.tsIndex.resolve(typeRef);
        if (!type) {
            throw new Error(`Resource ${typeRef.name} not found`);
        }
        if (!Object.hasOwn(cache.resourcesByUri, type.identifier.url)) {
            cache.resourcesByUri[type.identifier.url] = this._createTypeViewModel(type, cache, nestedIn);
        }
        const res = cache.resourcesByUri[type.identifier.url];
        if (!res) throw new Error(`Resource ${typeRef.name} not found`);
        return res;
    }

    private _createChildrenFor(typeRef: Identifier, cache: ViewModelCache, nestedIn?: TypeSchema): TypeViewModel[] {
        if (isComplexTypeIdentifier(typeRef)) {
            return this.tsIndex
                .resourceChildren(typeRef)
                .filter(isComplexTypeIdentifier)
                .filter(this.filterPred)
                .map((childRef: Identifier) => this._createFor(childRef, cache, nestedIn));
        }
        if (isResourceIdentifier(typeRef)) {
            return this.tsIndex
                .resourceChildren(typeRef)
                .filter(isResourceIdentifier)
                .filter(this.filterPred)
                .map((childRef: Identifier) => this._createFor(childRef, cache, nestedIn));
        }
        return [];
    }

    private _createParentsFor(base: TypeSchema | NestedType, cache: ViewModelCache) {
        const parents: TypeViewModel[] = [];
        let parentRef: Identifier | undefined = "base" in base ? base.base : undefined;
        while (parentRef) {
            parents.push(this._createFor(parentRef, cache, undefined));
            const parent = this.tsIndex.resolve(parentRef);
            parentRef = parent && "base" in parent ? parent.base : undefined;
        }
        return parents;
    }

    private _createForNestedType(
        nested: NestedType,
        cache: ViewModelCache,
        nestedIn?: TypeSchema,
    ): ResolvedTypeViewModel {
        const base = this._createTypeViewModel(nested, cache, nestedIn);
        const parents = this._createParentsFor(nested, cache);
        const children = this._createChildrenFor(nested.identifier, cache, nestedIn);
        const inheritedFields = parents.flatMap((p) => p.fields);
        return {
            ...base,
            parents,
            children,
            inheritedFields,
            allFields: [...base.fields, ...inheritedFields],

            hasChildren: children.length > 0,
            hasParents: parents.length > 0,
            hasInheritedFields: inheritedFields.length > 0,
        };
    }

    private _createTypeViewModel(
        schema: TypeSchema | NestedType,
        cache: ViewModelCache,
        nestedIn?: TypeSchema,
    ): TypeViewModel {
        const fields = Object.entries(("fields" in schema ? schema.fields : {}) ?? {});
        const nestedComplexTypes = this._collectNestedComplex(schema, cache);
        const nestedEnums = this._collectNestedEnums(fields as [string, Field][]);
        const dependencies = this._collectDependencies(schema);
        const name: NamedViewModel = {
            name: schema.identifier.name,
            saveName: this.nameGenerator.generateType(schema),
        };
        return {
            nestedComplexTypes,
            nestedEnums,
            dependencies,
            isNested: !!nestedIn,
            schema: schema,
            ...name,
            isResource: this._createIsResource(schema.identifier),
            isComplexType: this._createIsComplexType(schema.identifier),

            hasFields: fields.length > 0,
            hasNestedComplexTypes: nestedComplexTypes.length > 0,
            hasNestedEnums: nestedEnums.length > 0,
            fields: fields
                .filter((entry): entry is [string, RegularField | ChoiceFieldInstance] =>
                    isNotChoiceDeclarationField(entry[1]),
                )
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([fieldName, field]) => {
                    return {
                        owner: name,
                        schema: field,
                        name: fieldName,
                        saveName: this.nameGenerator.generateField(fieldName),
                        typeName: this.nameGenerator.generateFieldType(field),

                        isArray: field.array ?? false,
                        isRequired: field.required ?? false,
                        isEnum: !!field.enum && !field.enum.isOpen,

                        isSizeConstrained: field.min !== undefined || field.max !== undefined,
                        min: field.min,
                        max: field.max,

                        isResource: this._createIsResource(field.type),
                        isComplexType: this._createIsComplexType(field.type),
                        isPrimitive: this._createIsPrimitiveType(field.type),

                        isCode: field.type?.name === "code",
                        isIdentifier: field.type?.name === "Identifier",
                        isReference: field.type?.name === "Reference",
                    };
                }),
        };
    }

    private _collectDependencies(schema: TypeSchema | NestedType): TypeViewModel["dependencies"] {
        const dependencies: TypeViewModel["dependencies"] = {
            resources: [],
            complexTypes: [],
        };
        if ("dependencies" in schema && schema.dependencies) {
            schema.dependencies
                .filter((dependency) => dependency.kind === "complex-type")
                .map((dependency) => ({ name: dependency.name, saveName: this.nameGenerator.generateType(dependency) }))
                .forEach((dependency) => {
                    dependencies.complexTypes.push(dependency);
                });
            schema.dependencies
                .filter((dependency) => dependency.kind === "resource")
                .map((dependency) => ({ name: dependency.name, saveName: this.nameGenerator.generateType(dependency) }))
                .forEach((dependency) => {
                    dependencies.resources.push(dependency);
                });
        }
        if ("nested" in schema && schema.nested) {
            schema.nested
                .map((nested) => this._collectDependencies(nested))
                .forEach((d) => {
                    d.complexTypes
                        .filter(
                            (complexType) =>
                                !dependencies.complexTypes.some((dependency) => dependency.name === complexType.name),
                        )
                        .forEach((complexType) => {
                            dependencies.complexTypes.push(complexType);
                        });
                    d.resources
                        .filter(
                            (resource) =>
                                !dependencies.resources.some((dependency) => dependency.name === resource.name),
                        )
                        .forEach((resource) => {
                            dependencies.resources.push(resource);
                        });
                });
        }
        return dependencies;
    }

    private _createIsResource(typeRef: Identifier): Record<IsPrefixed<string>, boolean> | false {
        if (typeRef.kind !== "resource") {
            return false;
        }
        return Object.fromEntries(
            this.tsIndex
                .collectResources()
                .map((e) => e.identifier)
                .map((resourceRef: Identifier) => [
                    `is${resourceRef.name.charAt(0).toUpperCase() + resourceRef.name.slice(1)}`,
                    resourceRef.url === typeRef.url,
                ]),
        ) as Record<IsPrefixed<string>, boolean>;
    }
    private _createIsComplexType(typeRef: Identifier): Record<IsPrefixed<string>, boolean> | false {
        if (typeRef.kind !== "complex-type" && typeRef.kind !== "nested") {
            return false;
        }
        return Object.fromEntries(
            this.tsIndex
                .collectComplexTypes()
                .map((e) => e.identifier)
                .map((complexTypeRef: Identifier) => [
                    `is${complexTypeRef.name.charAt(0).toUpperCase() + complexTypeRef.name.slice(1)}`,
                    complexTypeRef.url === typeRef.url,
                ]),
        ) as Record<IsPrefixed<string>, boolean>;
    }
    private _createIsPrimitiveType(typeRef: Identifier): Record<IsPrefixed<string>, boolean> | false {
        if (typeRef.kind !== "primitive-type") {
            return false;
        }
        return Object.fromEntries(
            PRIMITIVE_TYPES.map((type) => [`is${type.charAt(0).toUpperCase()}${type.slice(1)}`, typeRef.name === type]),
        ) as FieldViewModel["isPrimitive"];
    }

    private _collectNestedComplex(schema: TypeSchema | NestedType, cache: ViewModelCache): ResolvedTypeViewModel[] {
        const nested: ResolvedTypeViewModel[] = [];
        if ("nested" in schema && schema.nested) {
            schema.nested
                .map((nested) => this._createForNestedType(nested, cache, schema))
                .forEach((n) => {
                    nested.push(n);
                });
        }
        return nested;
    }
    private _collectNestedEnums(fields: [string, Field][]): EnumViewModel[] {
        const nestedEnumValues: Record<string, Set<string>> = {};
        fields.forEach(([fieldName, fieldSchema]) => {
            if ("enum" in fieldSchema && fieldSchema.enum && !fieldSchema.enum.isOpen) {
                const name = ("binding" in fieldSchema && fieldSchema.binding?.name) ?? fieldName;
                if (typeof name === "string") {
                    nestedEnumValues[name] = nestedEnumValues[name] ?? new Set<string>();
                    fieldSchema.enum.values.forEach(nestedEnumValues[name].add.bind(nestedEnumValues[name]));
                }
            }
        });
        return Object.entries(nestedEnumValues).map(([name, values]) => ({
            name: name,
            saveName: this.nameGenerator.generateEnumType(name),
            values: Array.from(values).map((value) => ({
                name: value,
                saveName: this.nameGenerator.generateEnumValue(value),
            })),
        }));
    }

    private _createForRoot(): Pick<RootViewModel<unknown>, "resources" | "complexTypes"> {
        return this.arrayMixinProvider.apply({
            complexTypes: this.tsIndex
                .collectComplexTypes()
                .map((e) => e.identifier)
                .map((typeRef: Identifier) => ({
                    name: typeRef.name,
                    saveName: this.nameGenerator.generateType(typeRef),
                })),
            resources: this.tsIndex
                .collectResources()
                .map((e) => e.identifier)
                .map((typeRef: Identifier) => ({
                    name: typeRef.name,
                    saveName: this.nameGenerator.generateType(typeRef),
                })),
        });
    }
}
