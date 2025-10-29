import fs, { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { type Command as Commander, Option } from 'commander';
import { GeneratorError, generatorsRegistry } from '../generators-registry';
import { logger } from '../logger';
import { executeTypeSchema, TYPE_SCHEMA_VERSION } from '../utils/type-schema';
import { BaseCommand } from './command';
import crypto from 'node:crypto';

/**
 * Command to generate code from FHIR schema
 */
export class GenerateCommand extends BaseCommand {
    /**
     * Register the command with the commander instance
     * @param program - The commander program instance
     */
    register(program: Commander): void {
        const option = new Option('-g, --generator <name>', 'Generator to use').conflicts(
            'custom-generator',
        );

        const filesOption = new Option(
            '-f, --files <files...>',
            'TypeSchema source *.ngjson files',
        ).conflicts('packages');

        const packageOption = new Option(
            '-p, --packages <names...>',
            'Source fhir packages (example: hl7.fhir.r4.core@4.0.1)',
        ).conflicts('files');

        program
            .command('generate')
            .description('Generate code from FHIR Schema')
            .addOption(option)
            .addOption(filesOption)
            .addOption(packageOption)
            .requiredOption('-o, --output <directory>', 'Output directory')
            .option('--mustache-language <directory>', 'Path to Mustache language files')
            .option('--custom-generator <path>', 'Additional path to look for custom generators')
            .option(
                '--types-only',
                'Generate only type definitions directly in the output directory',
            )
            .option(
                '--type-schema-exec <command>',
                'Custom command to execute type-schema (e.g. "java --jar type-schema.jar")',
            )
            .option('--fhir-schema <paths...>', 'Additional FHIR schema files to include')
            .option(
                '--py-sdk-package <n>',
                'Root package name for Python package hierarchy (e.g., "fhirsdk" or "aidbox.my_package")',
                'fhirsdk',
            )
            .option(
                '--py-allow-extra-fields',
                'Allow extra fields in Python resource models without validation (default: false, extra fields are forbidden)',
            )
            .option('--profile', 'Enable profile generation')
            .option('--with-debug-comment', 'Enable debug comments in generated code')
            .option(
                '--cashed-type-schema <path>',
                'A path to an existing type-schema ndjson file (used if type-schema fails to generate)',
            )
            .hook('preSubcommand', (thisCommand) => {
                const options = thisCommand.opts();
                if (!options.files && !options.packages) {
                    logger.error('Either --files or --packages must be specified');
                    process.exit(1);
                }
            })
            .hook('preAction', async (thisCommand: Commander) => {
                try {
                    const options = thisCommand.opts();

                    await generatorsRegistry.initialize();

                    if (options.customGenerator) {
                        generatorsRegistry.addCustomGeneratorPath(options.customGenerator);
                        await generatorsRegistry.discoverCustomGenerators();
                    }

                    const generator = generatorsRegistry.get(
                        options.generator,
                        options.customGenerator,
                    );
                    if (!generator) {
                        const availableGenerators = generatorsRegistry.getGeneratorNames();
                        logger.error(`Unknown generator: ${options.generator}`);
                        logger.warn(`Available generators: ${availableGenerators.join(', ')}`);
                        logger.warn(`Run 'fscg generators' to see all available generators`);
                        process.exit(1);
                    }

                    if (options.files) {
                        const files = options.files;
                        for (const file of files) {
                            const filePath = path.resolve(file);
                            if (!existsSync(filePath)) {
                                logger.error(`Input file doesn't exist: ${filePath}`);
                                process.exit(1);
                            }
                        }
                    }
                } catch (error) {
                    this.handleError("can't initialize generator", error);
                }
            })
            .action(async (options) => {
                try {
                    const outputDir = path.resolve(process.cwd(), options.output);
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }

                    logger.infoHighlight(
                        `Starting code generation with ${options.generator ?? options.customGenerator} generator...`,
                    );

                    if (options.packages) {
                        logger.info('Processing packages with type-schema...');
                        try {
                            const cacheDir = './tmp';
                            const cachePath = this.buildCachePath(
                                options.packages,
                                options.fhirSchema,
                                cacheDir,
                            );
                            let typeSchemaNdJson: string | undefined = undefined;
                            try {
                                typeSchemaNdJson = await executeTypeSchema(
                                    options.packages,
                                    TYPE_SCHEMA_VERSION,
                                    options.typeSchemaExec,
                                    options.fhirSchema,
                                    cacheDir,
                                    cachePath,
                                );
                            } catch {
                                logger.warn(
                                    'Failed to generate type schema, trying to collect a cashed version...',
                                );
                                let pathToSchema: string | null = options.cashedTypeSchema;
                                if (!pathToSchema) {
                                    logger.warn(
                                        `No path to schema is provided, trying to use a default path (${cachePath})...`,
                                    );
                                    pathToSchema = cachePath;
                                }
                                try {
                                    typeSchemaNdJson = readFileSync(pathToSchema, 'utf-8');
                                } catch (err) {
                                    this.handleError('Error reading file:', err);
                                }
                            }

                            if (!typeSchemaNdJson) {
                                this.handleError(
                                    'can not generate type schemas',
                                    new Error('No schemas found'),
                                );
                            }

                            const generator = await generatorsRegistry.createGenerator(
                                options.generator ?? options.customGenerator,
                                {
                                    outputDir,
                                    jsonDocuments: typeSchemaNdJson,
                                    typesOnly: options.typesOnly,
                                    withDebugComment: options.withDebugComment,
                                    profile: options.profile,
                                    ...(options.generator === 'python'
                                        ? {
                                              sdkPackage: options.pySdkPackage,
                                              allowExtraFields: options.pyAllowExtraFields,
                                          }
                                        : {}),
                                    ...(options.generator === 'typescript'
                                        ? {
                                              sdkPackage: options.tsSdkPackage,
                                          }
                                        : {}),
                                    ...(options.generator === 'mustache'
                                        ? {
                                            mustacheLanguagePath: options.mustacheLanguage,
                                        }
                                        : {}),
                                },
                            );

                            await generator.init();
                            generator.generate();
                        } catch (error) {
                            this.handleError("can't generate sdk", error);
                        }
                    }

                    // TODO: merge flows
                    if (options.files) {
                        logger.info('Processing files with type-schema...');
                        const generator = await generatorsRegistry.createGenerator(
                            options.generator ?? options.customGenerator,
                            {
                                outputDir,
                                files: options.files,
                                typesOnly: options.typesOnly,
                                withDebugComment: options.withDebugComment,
                                profile: options.profile,
                                ...(options.generator === 'python'
                                    ? {
                                          sdkPackage: options.pySdkPackage,
                                          allowExtraFields: options.pyAllowExtraFields,
                                      }
                                    : {}),
                                ...(options.generator === 'typescript'
                                    ? {
                                          sdkPackage: options.tsSdkPackage,
                                      }
                                    : {}),
                            },
                        );

                        await generator.init();
                        generator.generate();
                    }

                    logger.success(`Successfully generated code to ${options.output}`);
                } catch (error) {
                    this.handleError('can not generate SDK', error);
                }
            });
    }

    private buildCachePath(packages: string[], fhirSchemaFiles: string[], baseDir: string) {
        const hash = crypto
            .createHash('md5')
            .update(JSON.stringify({ packages, fhirSchemaFiles }))
            .digest('hex');
        return path.join(baseDir, `schema-cache-${hash}.ndjson`);
    }

    private handleError(msg: string, error: unknown): never {
        if (error instanceof GeneratorError) {
            logger.error(`Generator error: ${msg}: ${error.message}`);
        } else {
            logger.error(`Error: ${msg}: ${String(error)}`);
        }
        if (error instanceof Error) {
            logger.error(error.stack ?? '');
        }
        process.exit(1);
    }
}
