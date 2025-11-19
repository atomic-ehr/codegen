import type { NameGenerator } from "@mustache/generator/NameGenerator";
import type { LambdaMixin } from "@mustache/types";
import { camelCase, kebabCase, pascalCase, snakeCase } from "@root/api/writer-generator/utils";

export class LambdaMixinProvider {
    private readonly lambda: LambdaMixin["lambda"];
    constructor(private readonly nameGenerator: NameGenerator) {
        this.lambda = {
            saveTypeName: () => (text, render) => this.nameGenerator.generateType(render(text)),
            saveEnumValueName: () => (text, render) => this.nameGenerator.generateEnumValue(render(text)),
            saveFieldName: () => (text, render) => this.nameGenerator.generateField(render(text)),

            camelCase: () => (text, render) => camelCase(render(text)),
            snakeCase: () => (text, render) => snakeCase(render(text)),
            pascalCase: () => (text, render) => pascalCase(render(text)),
            kebabCase: () => (text, render) => kebabCase(render(text)),
            lowerCase: () => (text, render) => render(text).toLowerCase(),
            upperCase: () => (text, render) => render(text).toUpperCase(),
        };
    }

    public apply<T extends Record<string, unknown>>(target: T): T & LambdaMixin {
        return {
            ...target,
            lambda: this.lambda,
        };
    }
}
