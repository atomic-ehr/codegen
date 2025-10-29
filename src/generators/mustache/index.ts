import {MustacheGenerator, MustacheGeneratorOptions} from './generator/MustacheGenerator';
import path from "node:path";
import {GeneratorOptions} from "@fscg/generators/generator";
import fs from "node:fs";

export function loadJsonFile<T>(filePath: string, defaultValue: T): T {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as T;
        }
        return defaultValue;
    } catch (e) {
        if(!defaultValue){
            throw e;
        }
        return defaultValue;
    }
}


export type FileBasedGeneratorOptions = GeneratorOptions & {
    mustacheLanguagePath: string;
};

type FileBasedMustacheGeneratorOptions = Pick<MustacheGeneratorOptions, 'debug' | 'renderings' | 'typeMap' | 'filters' | 'meta' | 'hooks' | 'nameTransformations' | 'unsaveCharacterPattern'> & {
    keywords?: string[];
}
export const DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS: FileBasedMustacheGeneratorOptions = {
    debug: 'OFF',
    hooks: {},
    meta:{},
    filters: {},
    unsaveCharacterPattern: /[^a-zA-Z0-9]/g,
    nameTransformations: {
        common: [],
        enumValue: [],
        type: [],
        field: [],
    },
    renderings: {
        utility: [],
        resource: [],
        complexType: []
    },
    typeMap: {}
};

export const createGenerator = (options: FileBasedGeneratorOptions): MustacheGenerator => {
    const sourceDir = path.resolve(options.mustacheLanguagePath);
    const optionsFromFile: FileBasedMustacheGeneratorOptions = loadJsonFile(path.resolve(sourceDir, 'config.json'), DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS);
    const mustacheOptions: MustacheGeneratorOptions = {
        ...options,
        debug: optionsFromFile.debug !== undefined ? optionsFromFile.debug : DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.debug,
        unsaveCharacterPattern: optionsFromFile.unsaveCharacterPattern ?? DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.unsaveCharacterPattern,
        meta:{
            ...DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.meta,
            ...(optionsFromFile.meta ?? {})
        },
        hooks:{
            ...DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.hooks,
            ...(optionsFromFile.hooks ?? {})
        },
        nameTransformations: {
            ...DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.nameTransformations,
            ...(optionsFromFile.nameTransformations ?? {})
        },
        renderings:{
            ...DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.renderings,
            ...(optionsFromFile.renderings ?? {})
        },
        typeMap: {
            ...DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.typeMap,
            ...options.typeMap,
            ...(optionsFromFile.typeMap ?? {})
        },
        filters: {
          ...DEFAULT_FILE_BASED_MUSTACHE_GENERATOR_OPTIONS.filters,
          ...(optionsFromFile.filters ?? {})
        },
        keywords: new Set<string>([...(options.keywords??[]),...(optionsFromFile.keywords??[])]),
        sources:{
            staticSource: path.resolve(sourceDir, 'static'),
            templateSource: path.resolve(sourceDir, 'templates')
        }
    }

    return new MustacheGenerator(mustacheOptions);
};
