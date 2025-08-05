/**
 * Generate command for TypeScript types
 */

import { generateTypes } from '../../generator';
import { resolve } from 'path';

export interface GenerateCommandOptions {
  output: string;
  package?: string;
  verbose?: boolean;
}

export async function generateCommand(options: GenerateCommandOptions): Promise<void> {
  const outputDir = resolve(options.output);
  const packagePath = options.package ? resolve(options.package) : undefined;

  console.log('Generating FHIR TypeScript types...');
  console.log(`Output directory: ${outputDir}`);
  
  if (packagePath) {
    console.log(`Package: ${packagePath}`);
  } else {
    console.log('Using default FHIR R4 core package');
  }

  try {
    await generateTypes({
      outputDir,
      packagePath,
      verbose: options.verbose
    });
    
    console.log('✨ Type generation completed successfully!');
  } catch (error) {
    console.error('❌ Error generating types:', error);
    throw error;
  }
}