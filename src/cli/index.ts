#!/usr/bin/env bun
/**
 * TypeSchema CLI
 * 
 * Command-line interface for generating TypeSchema from FHIR packages
 */

import { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import { translate } from '@atomic-ehr/fhirschema';
import { transformFHIRSchema } from '../typeschema/core/transformer';
import { transformValueSet } from '../typeschema/value-set/processor';
import * as fs from 'fs/promises';
import * as path from 'path';

interface CLIOptions {
  packages: string[];
  outputDir?: string;
  separatedFiles?: boolean;
  treeshake?: string[];
  dropCache?: boolean;
  verbose?: boolean;
}

// Parse command line arguments
function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    packages: [],
    verbose: false
  };
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    
    switch (arg) {
      case '-o':
      case '--output':
        options.outputDir = args[++i];
        break;
      case '--separated-files':
        options.separatedFiles = true;
        break;
      case '--treeshake':
        options.treeshake = args[++i].split(',');
        break;
      case '--drop-cache':
        options.dropCache = true;
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
      case '--version':
        console.log('type-schema version 0.0.1');
        process.exit(0);
      default:
        if (arg.startsWith('-')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
        options.packages.push(arg);
    }
    i++;
  }
  
  return options;
}

function printHelp() {
  console.log(`Type Schema Generator for FHIR packages

Usage: type-schema [options] [<package-name>]

Options:
  -o, --output DIR      Output directory or .ndjson file
      --separated-files Output each type schema to a separate file
      --treeshake TYPES List of required types to include in output
      --drop-cache      Drop all package caches
  -v, --verbose         Enable verbose output
      --version         Print version information and exit
  -h, --help            Show this help message

Examples:
  type-schema hl7.fhir.r4.core@4.0.1                              # Output to stdout
  type-schema -v hl7.fhir.r4.core@4.0.1                           # Verbose mode
  type-schema -o output hl7.fhir.r4.core@4.0.1                    # Output to directory
  type-schema -o result.ndjson hl7.fhir.r4.core@4.0.1             # Output to file
  type-schema -o output --separated-files hl7.fhir.r4.core@4.0.1  # Separate files
  type-schema --treeshake Patient,Observation hl7.fhir.r4.core     # Only specified types`);
}

// Log function that respects verbose flag
function log(message: string, verbose: boolean) {
  if (verbose) {
    console.error(message);
  }
}

// Save schemas as NDJSON
async function saveAsNDJSON(schemas: any[], outputFile: string) {
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  const lines = schemas.map(s => JSON.stringify(s));
  await fs.writeFile(outputFile, lines.join('\n'));
}

// Save schemas as separate files
async function saveAsSeparateFiles(schemas: any[], outputDir: string, verbose: boolean) {
  for (const schema of schemas) {
    const identifier = schema.identifier;
    const filePath = path.join(outputDir, identifier.package, `${identifier.name}.ts.json`);
    
    log(`Saving type schema: ${identifier.name} to ${filePath}`, verbose);
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2));
  }
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  
  if (options.packages.length === 0) {
    console.error('Error: No packages specified');
    printHelp();
    process.exit(1);
  }
  
  // Create canonical manager
  const manager = CanonicalManager({
    packages: options.packages,
    workingDir: options.dropCache ? `tmp/fhir-${Date.now()}` : 'tmp/fhir'
  });
  
  log('Initializing canonical manager...', options.verbose);
  await manager.init();
  
  // Process all StructureDefinitions
  const allSchemas: any[] = [];
  
  log('Processing StructureDefinitions...', options.verbose);
  const structureDefinitions = await manager.search({ type: 'StructureDefinition' });
  
  for (const sd of structureDefinitions) {
    log(`Processing ${sd.name}...`, options.verbose);
    
    // Convert to FHIRSchema
    const fhirSchema = translate(sd);
    
    // Extract package info
    const packageInfo = {
      name: sd.package?.name || 'undefined',
      version: sd.package?.version || 'undefined'
    };
    
    // Transform to TypeSchema
    const schemas = await transformFHIRSchema(fhirSchema, manager, packageInfo);
    allSchemas.push(...schemas);
  }
  
  // Process ValueSets
  log('Processing ValueSets...', options.verbose);
  const valueSets = await manager.search({ type: 'ValueSet' });
  
  for (const vs of valueSets) {
    log(`Processing ValueSet ${vs.id}...`, options.verbose);
    
    const packageInfo = {
      name: vs.package?.name || 'undefined',
      version: vs.package?.version || 'undefined'
    };
    
    const schema = await transformValueSet(vs, manager, packageInfo);
    allSchemas.push(schema);
  }
  
  // Apply treeshaking if requested
  let finalSchemas = allSchemas;
  if (options.treeshake) {
    log(`Treeshaking to include only: ${options.treeshake.join(', ')}`, options.verbose);
    // TODO: Implement treeshaking logic
    console.error('Warning: Treeshaking not yet implemented');
  }
  
  // Output results
  if (options.outputDir) {
    if (options.outputDir.endsWith('.ndjson')) {
      log(`Saving to NDJSON file: ${options.outputDir}`, options.verbose);
      await saveAsNDJSON(finalSchemas, options.outputDir);
    } else if (options.separatedFiles) {
      log(`Saving to separate files in: ${options.outputDir}`, options.verbose);
      await saveAsSeparateFiles(finalSchemas, options.outputDir, options.verbose);
    } else {
      // Default to NDJSON in directory
      const outputFile = path.join(options.outputDir, `${options.packages.join('-')}.ndjson`);
      log(`Saving to NDJSON file: ${outputFile}`, options.verbose);
      await saveAsNDJSON(finalSchemas, outputFile);
    }
  } else {
    // Output to stdout
    for (const schema of finalSchemas) {
      console.log(JSON.stringify(schema));
    }
  }
  
  log('Processing completed successfully', options.verbose);
  
  // Cleanup
  await manager.destroy();
}

// Run the CLI
main().catch(error => {
  console.error('Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});