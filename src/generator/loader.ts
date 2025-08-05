/**
 * Schema Loader
 * 
 * Loads FHIR schemas using @atomic-ehr/fhirschema and @atomic-ehr/fhir-canonical-manager
 * and transforms them to TypeSchema format using the existing typeschema module.
 */

import { CanonicalManager } from '@atomic-ehr/fhir-canonical-manager';
import { FHIRSchema } from '@atomic-ehr/fhirschema';
import { 
  transformFHIRSchemas,
  TypeSchema,
  TypeSchemaBinding,
  TypeSchemaValueSet,
  AnyTypeSchema,
  isTypeSchema,
  isTypeSchemaBinding,
  isTypeSchemaValueSet
} from '../typeschema';

export interface LoaderOptions {
  packagePath?: string;
  fhirVersion?: string;
  verbose?: boolean;
}

export interface LoadedSchemas {
  resources: TypeSchema[];
  complexTypes: TypeSchema[];
  primitiveTypes: TypeSchema[];
  bindings: TypeSchemaBinding[];
  valueSets: TypeSchemaValueSet[];
}

export class SchemaLoader {
  private canonicalManager: any;
  private options: LoaderOptions;

  constructor(options: LoaderOptions = {}) {
    this.options = options;
    this.canonicalManager = CanonicalManager({
      packages: options.packagePath ? [options.packagePath] : ['hl7.fhir.r4.core@4.0.1'],
      workingDir: 'tmp/fhir'
    });
  }

  /**
   * Load and transform FHIR schemas from a package or local path
   */
  async load(): Promise<LoadedSchemas> {
    // Initialize canonical manager
    await this.canonicalManager.init();

    // Get all structure definitions
    const structureDefinitions = await this.canonicalManager.search({ type: 'StructureDefinition' });
    
    if (this.options.verbose) {
      console.log(`Found ${structureDefinitions.length} StructureDefinitions`);
    }

    // Convert to FHIR schemas
    const { translate } = await import('@atomic-ehr/fhirschema');
    const fhirSchemas = structureDefinitions.map((sd: any) => translate(sd));

    // Transform to TypeSchema format
    const typeSchemas = await transformFHIRSchemas(fhirSchemas, {
      packageInfo: {
        name: 'hl7.fhir.r4.core',
        version: '4.0.1',
        fhirVersions: ['4.0.1']
      },
      verbose: this.options.verbose
    });

    // Categorize schemas
    const result: LoadedSchemas = {
      resources: [],
      complexTypes: [],
      primitiveTypes: [],
      bindings: [],
      valueSets: []
    };

    for (const schema of typeSchemas) {
      if (isTypeSchema(schema)) {
        switch (schema.identifier.kind) {
          case 'resource':
            result.resources.push(schema);
            break;
          case 'complex-type':
            result.complexTypes.push(schema);
            break;
          case 'primitive-type':
            result.primitiveTypes.push(schema);
            break;
        }
      } else if (isTypeSchemaBinding(schema)) {
        result.bindings.push(schema);
      } else if (isTypeSchemaValueSet(schema)) {
        result.valueSets.push(schema);
      }
    }

    if (this.options.verbose) {
      console.log(`Categorized schemas:`);
      console.log(`  - Resources: ${result.resources.length}`);
      console.log(`  - Complex Types: ${result.complexTypes.length}`);
      console.log(`  - Primitive Types: ${result.primitiveTypes.length}`);
      console.log(`  - Bindings: ${result.bindings.length}`);
      console.log(`  - Value Sets: ${result.valueSets.length}`);
    }

    return result;
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    if (this.canonicalManager && this.canonicalManager.destroy) {
      await this.canonicalManager.destroy();
    }
  }

  /**
   * Load schemas from NDJSON file (for testing or custom schemas)
   */
  async loadFromNDJSON(filePath: string): Promise<LoadedSchemas> {
    const file = Bun.file(filePath);
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    const fhirSchemas: FHIRSchema[] = [];
    for (const line of lines) {
      try {
        const schema = JSON.parse(line) as FHIRSchema;
        fhirSchemas.push(schema);
      } catch (e) {
        console.error('Failed to parse NDJSON line:', e);
      }
    }

    // Transform to TypeSchema format
    const typeSchemas = await transformFHIRSchemas(fhirSchemas, {
      verbose: this.options.verbose
    });

    // Categorize schemas (same as above)
    const result: LoadedSchemas = {
      resources: [],
      complexTypes: [],
      primitiveTypes: [],
      bindings: [],
      valueSets: []
    };

    for (const schema of typeSchemas) {
      if (isTypeSchema(schema)) {
        switch (schema.identifier.kind) {
          case 'resource':
            result.resources.push(schema);
            break;
          case 'complex-type':
            result.complexTypes.push(schema);
            break;
          case 'primitive-type':
            result.primitiveTypes.push(schema);
            break;
        }
      } else if (isTypeSchemaBinding(schema)) {
        result.bindings.push(schema);
      } else if (isTypeSchemaValueSet(schema)) {
        result.valueSets.push(schema);
      }
    }

    if (this.options.verbose) {
      console.log(`Categorized schemas:`);
      console.log(`  - Resources: ${result.resources.length}`);
      console.log(`  - Complex Types: ${result.complexTypes.length}`);
      console.log(`  - Primitive Types: ${result.primitiveTypes.length}`);
      console.log(`  - Bindings: ${result.bindings.length}`);
      console.log(`  - Value Sets: ${result.valueSets.length}`);
    }

    return result;
  }
}