import fs from "node:fs";
import path from "node:path";
import {Rendering} from "@fscg/generators/mustache/types/Rendering";


export class TemplateFileCache {
    private readonly templateBaseDir: string;
    private readonly templateCache: Record<string, string> = {};
    constructor(templateBaseDir: string) {
        this.templateBaseDir = path.resolve(templateBaseDir);
    }

    private _normalizeName(name: string): string{
        if(name.endsWith('.mustache')){
            return name;
        }
        return `${name}.mustache`;
    }

    public read(template: Pick<Rendering, 'source'>): string{
        return this.readTemplate(template.source);
    }
    public readTemplate(name: string): string{
        const normalizedName = this._normalizeName(name);
        if(!this.templateCache[normalizedName]){
            this.templateCache[normalizedName] = fs.readFileSync(path.join(this.templateBaseDir, normalizedName), 'utf-8');
        }
        return this.templateCache[normalizedName];
    }
}