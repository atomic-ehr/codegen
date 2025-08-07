#!/usr/bin/env bun

/**
 * Configuration-Based Generation Example
 *
 * This example demonstrates how to use a configuration file
 * to manage complex generation scenarios.
 */

import { APIBuilder, loadConfig } from '@atomic-ehr/codegen';

async function generateWithConfig() {
  console.log('⚙️  Generating with Configuration File...\n');

  try {
    // Load configuration from file
    const config = await loadConfig('./atomic-codegen.config.ts');

    console.log('📋 Configuration loaded:');
    console.log(`   - Packages: ${config.input?.packages?.length || 0}`);
    console.log(`   - Files: ${config.input?.files?.length || 0}`);
    console.log(`   - TypeScript output: ${config.output?.typescript?.outputDir}`);
    console.log(`   - REST client output: ${config.output?.restClient?.outputDir}`);
    console.log('');

    // Create API builder with config options
    const api = new APIBuilder(config.options);

    // Add input sources from config
    if (config.input?.packages) {
      for (const pkg of config.input.packages) {
        api.fromPackage(pkg);
      }
    }

    if (config.input?.files) {
      api.fromFiles(...config.input.files);
    }

    if (config.input?.schemas) {
      api.fromSchemas(config.input.schemas);
    }

    // Generate TypeScript types if configured
    if (config.output?.typescript) {
      console.log('🔧 Generating TypeScript types...');

      const tsResult = await api
        .typescript(config.output.typescript)
        .outputTo(config.output.typescript.outputDir)
        .onProgress((phase, current, total, message) => {
          console.log(`   [${phase}] ${current}/${total}: ${message || ''}`);
        })
        .generate();

      if (tsResult.success) {
        console.log(`✅ TypeScript generation completed!`);
        console.log(`   📁 Output: ${tsResult.outputDir}`);
        console.log(`   📄 Files: ${tsResult.filesGenerated.length}`);
      } else {
        console.error('❌ TypeScript generation failed:', tsResult.errors);
      }

      // Reset for next generation
      api.reset();
    }

    // Generate REST client if configured
    if (config.output?.restClient) {
      console.log('\n🌐 Generating REST API client...');

      // Re-add input sources since we reset
      if (config.input?.packages) {
        for (const pkg of config.input.packages) {
          api.fromPackage(pkg);
        }
      }

      const clientResult = await api
        .restClient(config.output.restClient)
        .outputTo(config.output.restClient.outputDir)
        .onProgress((phase, current, total, message) => {
          console.log(`   [${phase}] ${current}/${total}: ${message || ''}`);
        })
        .generate();

      if (clientResult.success) {
        console.log(`✅ REST client generation completed!`);
        console.log(`   📁 Output: ${clientResult.outputDir}`);
        console.log(`   📄 Files: ${clientResult.filesGenerated.length}`);
      } else {
        console.error('❌ REST client generation failed:', clientResult.errors);
      }
    }

    console.log('\n🎉 All configured generations completed!');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Alternative: Use CLI with config file
async function showCLIUsage() {
  console.log('\n📝 CLI Usage with Configuration:');
  console.log(`
# Generate using configuration file
bun atomic-codegen generate --config ./atomic-codegen.config.ts

# Override specific options
bun atomic-codegen generate typescript \\
  --config ./atomic-codegen.config.ts \\
  --output ./custom-output \\
  --verbose

# Generate only REST client from config
bun atomic-codegen generate rest-client \\
  --config ./atomic-codegen.config.ts
  `);
}

// Run if called directly
if (import.meta.main) {
  await generateWithConfig();
  await showCLIUsage();
}

export { generateWithConfig };
