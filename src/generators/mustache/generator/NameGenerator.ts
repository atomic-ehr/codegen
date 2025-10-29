import {ClassField, NestedTypeSchema, TypeRef, TypeSchema} from "@fscg/typeschema";

export type NameTransformation = {
    pattern: RegExp | string,
    format: string
}
export type DistinctNameConfigurationType<T> = {
    common: T,
    enumValue: T,
    type: T,
    field: T,
}

export class NameGenerator {

    constructor(
        private readonly keywords: Set<string>,
        private readonly typeMap: Record<string, string>,
        private readonly nameTransformations: DistinctNameConfigurationType<NameTransformation[]>,
        private readonly unsaveCharacterPattern: string | RegExp
    ) {
    }

    private _replaceUnsaveChars(name: string): string {
        const pattern = this.unsaveCharacterPattern instanceof RegExp ? this.unsaveCharacterPattern : new RegExp(this.unsaveCharacterPattern, 'g');
        return name.replace(pattern, '_');
    }


    private _applyNameTransformations(name: string, transformations: NameTransformation[]): string {
        for (const transformation of this.nameTransformations.common) {
            name = name.replace(transformation.pattern instanceof RegExp ? transformation.pattern : new RegExp(transformation.pattern, 'g'), transformation.format);
        }
        for (const transformation of transformations) {
            name = name.replace(transformation.pattern instanceof RegExp ? transformation.pattern : new RegExp(transformation.pattern,'g'), transformation.format);
        }
        return name;
    }

    private _generateTypeName(name: string): string {
        if(this.typeMap[name]) {
            name = this.typeMap[name];
        }else{
            name = this._applyNameTransformations(name, this.nameTransformations.type);
            name = name.charAt(0).toUpperCase() + name.slice(1);
            if (this.keywords.has(name)) {
                return `_${name}`;
            }
            name = this._replaceUnsaveChars(name);
        }
        return name;
    }

    public generateEnumType(name: string): string {
        return this._generateTypeName(name);
    }

    private _generateTypeFromTypeRef(typeRef: TypeRef): string {
        if(typeRef.kind === 'primitive-type'){
            return this._generateTypeName(typeRef.name);
        }
        return this._generateTypeName(typeRef.url.split('/').pop()?.split('#').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join('') ?? '<UNKNOWN>');
    }


    public generateFieldType(schema: ClassField): string{
        if(schema.enum){
            return this.generateEnumType(schema.binding?.name ?? schema.type.name);
        }
        return this._generateTypeFromTypeRef(schema.type);
    }

    public generateType(schemaOrRefOrString: TypeSchema | NestedTypeSchema | TypeRef | string): string {
        if(typeof schemaOrRefOrString === 'string'){
            return this._generateTypeName(schemaOrRefOrString);
        }
        if('url' in schemaOrRefOrString){
            return this._generateTypeFromTypeRef(schemaOrRefOrString);
        }
        return this._generateTypeFromTypeRef(schemaOrRefOrString.identifier);
    }

    public generateField(name: string): string {
        name = this._applyNameTransformations(name, this.nameTransformations.field);
        if (this.keywords.has(name)) {
            return `_${name}`;
        }
        name = this._replaceUnsaveChars(name);
        return name;
    }
    public generateEnumValue(name: string): string {
        name = this._applyNameTransformations(name, this.nameTransformations.enumValue);
        if (this.keywords.has(name)) {
            return `_${name}`;
        }
        name = this._replaceUnsaveChars(name).toUpperCase();
        return name;
    }

}