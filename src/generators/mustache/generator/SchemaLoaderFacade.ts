import {SchemaLoader} from "@fscg/loader";
import {TypeRef, TypeSchema} from "@fscg/typeschema";
import {FilterType} from "@fscg/generators/mustache/types/FilterType";

export class SchemaLoaderFacade {
    private readonly complexTypesByUri: Record<string, TypeSchema> = {};
    private readonly resourcesByUri: Record<string, TypeSchema> = {};

    private readonly childResourceUrisByParentUri: Record<string, string[]> = {};
    private readonly childComplexTypeUrisByParentUri: Record<string, string[]> = {};

    private complexTypeRefs : TypeRef[] | undefined = undefined;
    private resourceRefs : TypeRef[] | undefined = undefined;

    constructor(private readonly loader: SchemaLoader, private readonly filters: {resource?: FilterType, complexType?: FilterType} ) {
        this.loader.complexTypes().forEach(schema => {
            this.complexTypesByUri[schema.identifier.url] = schema;
            if(schema.base){
                if(!this.childComplexTypeUrisByParentUri[schema.base.url]){
                    this.childComplexTypeUrisByParentUri[schema.base.url] = [];
                }
                this.childComplexTypeUrisByParentUri[schema.base.url].push(schema.identifier.url);
            }
        });
        this.loader.resources().forEach(schema => {
            this.resourcesByUri[schema.identifier.url] = schema;
            if(schema.base){
                if(!this.childResourceUrisByParentUri[schema.base.url]){
                    this.childResourceUrisByParentUri[schema.base.url] = [];
                }
                this.childResourceUrisByParentUri[schema.base.url].push(schema.identifier.url);
            }
        });
    }

    public get(typeRef: TypeRef){
        if(typeRef.kind === 'complex-type'){
            return this.getComplexType(typeRef);
        }
        if(typeRef.kind === 'resource'){
            return this.getResource(typeRef);
        }
        throw new Error(`Unknown type ${typeRef.kind}`);
    }

    public getComplexType(typeRef: TypeRef): TypeSchema | undefined {
        return this.complexTypesByUri[typeRef.url];
    }
    public getResource(typeRef: TypeRef): TypeSchema | undefined {
        return this.resourcesByUri[typeRef.url];
    }

    public getChildComplexTypes(parentTypeRef: TypeRef): TypeRef[] {
        return (this.childComplexTypeUrisByParentUri[parentTypeRef.url] ?? [])
            .map(uri => this.complexTypesByUri[uri])
            .map(t => t.identifier)
            .filter(t => this._checkFilter(t))
            .sort((a, b) => a.url.localeCompare(b.url));
    }
    public getChildResources(parentTypeRef: TypeRef): TypeRef[] {
        return (this.childResourceUrisByParentUri[parentTypeRef.url] ?? [])
            .map(uri => this.resourcesByUri[uri])
            .map(t => t.identifier)
            .filter(t => this._checkFilter(t))
            .sort((a, b) => a.url.localeCompare(b.url));
    }

    public getComplexTypes(): TypeRef[]{
        if(this.complexTypeRefs === undefined){
            this.complexTypeRefs = this.loader.complexTypes()
                .map(t=> t.identifier)
                .filter(t => this._checkFilter(t))
                .sort((a, b) => a.url.localeCompare(b.url));
        }
        return this.complexTypeRefs;
    }
    public getResources(): TypeRef[]{
        if(this.resourceRefs === undefined){
            this.resourceRefs = this.loader.resources()
                .map(t=> t.identifier)
                .filter(t => this._checkFilter(t))
                .sort((a, b) => a.url.localeCompare(b.url));
        }
        return this.resourceRefs;
    }

    private _checkFilter(type: TypeRef): boolean{
        if(type.kind !== 'complex-type' && type.kind !== 'resource'){
            return true;
        }
        if(!this.filters[type.kind]){
            return true;
        }
        const whitelist = this.filters[type.kind]?.whitelist ?? [];
        const blacklist = this.filters[type.kind]?.blacklist ?? [];
        if(!whitelist.length && !blacklist.length){
            return true;
        }
        if(blacklist.find(pattern => type.name.match(pattern))){
            return false;
        }
        if(whitelist.find(pattern => type.name.match(pattern))){
            return true;
        }
        return whitelist.length === 0;
    }
}