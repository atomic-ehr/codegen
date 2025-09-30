import { defineConfig } from "./src";

export default defineConfig({
    outputDir: "./generated",
    overwrite: true,
    validate: true,
    cache: true,
    typeSchema: {
        treeshake: ["Patient"],
        enablePersistence: true,
        cacheDir: ".typeschema-cache",
    },
    packages: ["hl7.fhir.r4.core@4.0.1"],
    typescript: {
        includeDocuments: true,
        namingConvention: "PascalCase",
        includeProfiles: false,
        includeExtensions: false,
        generateIndex: true,
        strictMode: true,
        generateValueSets: true,
        includeValueSetHelpers: true,
        valueSetStrengths: ["required", "preferred"],
        valueSetMode: "custom",
    },
});
