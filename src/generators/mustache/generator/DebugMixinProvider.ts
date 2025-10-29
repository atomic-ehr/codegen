import {DebugMixin} from "@fscg/generators/mustache/types/DebugMixin";


export class DebugMixinProvider {

    constructor(private readonly mode: 'FORMATTED' | 'COMPACT') {
    }

    public apply<T extends Record<string, unknown>> (target: T): T & DebugMixin {
        return this._addDebug(target) as T & DebugMixin;
    }

    private _addDebug(value: unknown): unknown {
        if (Array.isArray(value)) {
            return value.map(v => this._addDebug(v));
        }

        if (value !== null && typeof value === "object") {
            const obj = value as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            const debugString = JSON.stringify(
                obj,
                null,
                this.mode === 'FORMATTED' ? 2 : undefined
            );
            for (const [key, val] of Object.entries(obj)) {
                result[key] = this._addDebug(val);
            }
            result["debug"] = debugString;
            return result;
        }

        return value;
    }
}