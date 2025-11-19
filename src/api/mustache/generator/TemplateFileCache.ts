import fs from "node:fs";
import Path from "node:path";
import type { Rendering } from "@mustache/types";

export class TemplateFileCache {
    private readonly templateBaseDir: string;
    private readonly templateCache: Record<string, string> = {};
    constructor(templateBaseDir: string) {
        this.templateBaseDir = Path.resolve(templateBaseDir);
    }

    private _normalizeName(name: string): string {
        if (name.endsWith(".mustache")) {
            return name;
        }
        return `${name}.mustache`;
    }

    public read(template: Pick<Rendering, "source">): string {
        return this.readTemplate(template.source);
    }
    public readTemplate(name: string): string {
        const normalizedName = this._normalizeName(name);
        if (!this.templateCache[normalizedName]) {
            this.templateCache[normalizedName] = fs.readFileSync(
                Path.join(this.templateBaseDir, normalizedName),
                "utf-8",
            );
        }
        return this.templateCache[normalizedName];
    }
}
