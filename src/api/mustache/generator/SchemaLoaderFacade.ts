import type { FilterType } from "@mustache/types";
import type { TypeSchemaIndex } from "@root/typeschema/utils";
import type { Identifier, RegularTypeSchema, TypeSchema } from "@typeschema/types";

export class SchemaLoaderFacade {
    private readonly complexTypesByUri: Record<string, TypeSchema> = {};
    private readonly resourcesByUri: Record<string, TypeSchema> = {};

    private readonly childResourceUrisByParentUri: Record<string, string[]> = {};
    private readonly childComplexTypeUrisByParentUri: Record<string, string[]> = {};

    private complexTypeRefs: Identifier[] | undefined = undefined;
    private resourceRefs: Identifier[] | undefined = undefined;

    constructor(
        private readonly tsIndex: TypeSchemaIndex,
        private readonly filters: { resource?: FilterType; complexType?: FilterType },
    ) {
        this.tsIndex.collectComplexTypes().forEach((schema: RegularTypeSchema) => {
            this.complexTypesByUri[schema.identifier.url] = schema;
            if (schema.base) {
                if (!this.childComplexTypeUrisByParentUri[schema.base.url]) {
                    this.childComplexTypeUrisByParentUri[schema.base.url] = [];
                }
                this.childComplexTypeUrisByParentUri[schema.base.url]?.push(schema.identifier.url);
            }
        });
        this.tsIndex.collectResources().forEach((schema: RegularTypeSchema) => {
            this.resourcesByUri[schema.identifier.url] = schema;
            if (schema.base) {
                if (!this.childResourceUrisByParentUri[schema.base.url]) {
                    this.childResourceUrisByParentUri[schema.base.url] = [];
                }
                this.childResourceUrisByParentUri[schema.base.url]?.push(schema.identifier.url);
            }
        });
    }

    public get(typeRef: Identifier) {
        if (typeRef.kind === "complex-type") {
            return this.getComplexType(typeRef);
        }
        if (typeRef.kind === "resource") {
            return this.getResource(typeRef);
        }
        throw new Error(`Unknown type ${typeRef.kind}`);
    }

    public getComplexType(typeRef: Identifier): TypeSchema | undefined {
        return this.complexTypesByUri[typeRef.url];
    }
    public getResource(typeRef: Identifier): TypeSchema | undefined {
        return this.resourcesByUri[typeRef.url];
    }

    public getChildComplexTypes(parentTypeRef: Identifier): Identifier[] {
        return (this.childComplexTypeUrisByParentUri[parentTypeRef.url] ?? [])
            .map((uri) => this.complexTypesByUri[uri])
            .map((t: any) => t.identifier)
            .filter((t: any) => this._checkFilter(t))
            .sort((a: any, b: any) => a.url.localeCompare(b.url));
    }
    public getChildResources(parentTypeRef: Identifier): Identifier[] {
        return (this.childResourceUrisByParentUri[parentTypeRef.url] ?? [])
            .map((uri) => this.resourcesByUri[uri])
            .map((t: any) => t.identifier)
            .filter((t: any) => this._checkFilter(t))
            .sort((a: any, b: any) => a.url.localeCompare(b.url));
    }

    public getComplexTypes(): Identifier[] {
        if (this.complexTypeRefs === undefined) {
            this.complexTypeRefs = this.tsIndex
                .collectComplexTypes()
                .map((t: any) => t.identifier)
                .filter((t: any) => this._checkFilter(t))
                .sort((a: any, b: any) => a.url.localeCompare(b.url));
        }
        return this.complexTypeRefs;
    }
    public getResources(): Identifier[] {
        if (this.resourceRefs === undefined) {
            this.resourceRefs = this.tsIndex
                .collectResources()
                .map((t: any) => t.identifier)
                .filter((t: any) => this._checkFilter(t))
                .sort((a: any, b: any) => a.url.localeCompare(b.url));
        }
        return this.resourceRefs;
    }

    private _checkFilter(type: Identifier): boolean {
        if (type.kind !== "complex-type" && type.kind !== "resource") {
            return true;
        }
        if (!this.filters[type.kind as "resource" | "complexType"]) {
            return true;
        }
        const whitelist = this.filters[type.kind as "resource" | "complexType"]?.whitelist ?? [];
        const blacklist = this.filters[type.kind as "resource" | "complexType"]?.blacklist ?? [];
        if (!whitelist.length && !blacklist.length) {
            return true;
        }
        if (blacklist.find((pattern: any) => type.name.match(pattern as any))) {
            return false;
        }
        if (whitelist.find((pattern: any) => type.name.match(pattern as any))) {
            return true;
        }
        return whitelist.length === 0;
    }
}
