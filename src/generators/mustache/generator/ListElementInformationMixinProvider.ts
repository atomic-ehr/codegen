import {ListElementInformationMixin} from "@fscg/generators/mustache/types/ListElementInformationMixin";

export class ListElementInformationMixinProvider {
    private static _array<T> (value: T[] | Set<T>): T[] {
        return Array.isArray(value) ? value : Array.from(value);
    }

    public apply<T extends Record<string, unknown>>(source: T): T{
        return this._addListElementInformation(source) as T;
    }

    private _addListElementInformation(value: unknown): unknown {
        if (Array.isArray(value) || value instanceof Set) {
            return ListElementInformationMixinProvider._array(value).map((v, index, array) => {
                if(typeof v === 'object' && v !== null){
                    return {
                        ...(this._addListElementInformation(v) as Record<string, unknown>),
                        '-index': index,
                        '-length': array.length,
                        '-first': index === 0,
                        '-last': index === array.length - 1,
                    } satisfies ListElementInformationMixin
                }
                return v;
            });
        }

        if (value !== null && typeof value === "object") {
            const obj = value as Record<string, unknown>;
            const result: Record<string, unknown> = {};
            for (const [key, val] of Object.entries(obj)) {
                result[key] = this._addListElementInformation(val);
            }
            return result;
        }

        return value;
    }
}