# Troubleshooting Guide

This guide helps you resolve common issues when using Atomic EHR Codegen.

## Quick Diagnostics

Before diving into specific issues, run these diagnostic commands:

```bash
# Check CLI installation
atomic-codegen --version

# Validate configuration
atomic-codegen config validate

# Test with verbose output
atomic-codegen generate typescript -o ./test-output -v

# Check available generators
atomic-codegen generators list
```

## Common Issues

### 1. Installation and Setup Issues

#### Issue: `atomic-codegen: command not found`

**Symptoms:**
```bash
$ atomic-codegen --version
atomic-codegen: command not found
```

**Solutions:**

1. **Check installation:**
   ```bash
   # If installed globally
   bun install -g @atomic-ehr/codegen
   
   # If using from source
   cd /path/to/codegen
   bun install
   bun link
   ```

2. **Check PATH:**
   ```bash
   # Add to your shell profile (.bashrc, .zshrc, etc.)
   export PATH="$HOME/.bun/bin:$PATH"
   ```

3. **Use npx/bunx:**
   ```bash
   bunx @atomic-ehr/codegen --version
   ```

#### Issue: Permission denied errors

**Symptoms:**
```bash
Error: EACCES: permission denied, mkdir '/output/directory'
```

**Solutions:**

1. **Check directory permissions:**
   ```bash
   ls -la /path/to/parent/directory
   chmod 755 /path/to/parent/directory
   ```

2. **Use a different output directory:**
   ```bash
   atomic-codegen generate typescript -o ~/my-types
   ```

3. **Run with appropriate permissions:**
   ```bash
   sudo atomic-codegen generate typescript -o /system/directory
   ```

### 2. Package and Network Issues

#### Issue: FHIR package not found

**Symptoms:**
```bash
Error: Package 'hl7.fhir.r4.core@4.0.1' not found
Error: Failed to download package from registry
```

**Solutions:**

1. **Verify package name and version:**
   ```bash
   # Check available packages at https://packages.fhir.org/
   # Common packages:
   # - hl7.fhir.r4.core@4.0.1
   # - hl7.fhir.us.core@6.1.0
   # - hl7.fhir.r5.core@5.0.0
   ```

2. **Check network connectivity:**
   ```bash
   curl -I https://packages.fhir.org/
   ```

3. **Use proxy settings if needed:**
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

4. **Try with explicit package:**
   ```bash
   atomic-codegen generate typescript --package hl7.fhir.r4.core@4.0.1 -o ./output
   ```

#### Issue: Network timeout or slow downloads

**Symptoms:**
```bash
Error: Request timeout while downloading package
Warning: Download is taking longer than expected
```

**Solutions:**

1. **Increase timeout:**
   ```bash
   export ATOMIC_CODEGEN_TIMEOUT=300000  # 5 minutes
   ```

2. **Use cached packages:**
   ```bash
   # Check cache location
   atomic-codegen config show | grep cache
   
   # Clear cache if corrupted
   rm -rf ~/.atomic-codegen/cache
   ```

3. **Download manually:**
   ```bash
   # Download package manually and use local file
   wget https://packages.fhir.org/hl7.fhir.r4.core/4.0.1
   atomic-codegen typeschema create ./hl7.fhir.r4.core-4.0.1.tgz -o schema.ndjson
   ```

### 3. Configuration Issues

#### Issue: Configuration file not found or invalid

**Symptoms:**
```bash
Error: Configuration file '.atomic-codegen.json' is invalid
Warning: No configuration file found, using defaults
```

**Solutions:**

1. **Initialize configuration:**
   ```bash
   atomic-codegen config init --template typescript
   ```

2. **Validate configuration:**
   ```bash
   atomic-codegen config validate
   ```

3. **Check configuration syntax:**
   ```bash
   # Validate JSON syntax
   cat .atomic-codegen.json | jq .
   ```

4. **Use minimal configuration:**
   ```json
   {
     "version": "1.0.0",
     "generator": {
       "target": "typescript",
       "outputDir": "./generated"
     }
   }
   ```

#### Issue: Environment variables not working

**Symptoms:**
```bash
# Environment variable ignored
export OUTPUT_DIR=./my-output
atomic-codegen generate typescript  # Still uses default output
```

**Solutions:**

1. **Use correct prefix:**
   ```bash
   # Wrong
   export OUTPUT_DIR=./my-output
   
   # Correct
   export ATOMIC_CODEGEN_OUTPUT_DIR=./my-output
   ```

2. **Check variable names:**
   ```bash
   # List all supported environment variables
   atomic-codegen config show --show-sources
   ```

3. **Verify variable is set:**
   ```bash
   env | grep ATOMIC_CODEGEN
   ```

### 4. Generation Issues

#### Issue: TypeScript compilation errors in generated code

**Symptoms:**
```bash
error TS2304: Cannot find name 'Resource'
error TS2322: Type 'string' is not assignable to type 'ResourceType'
```

**Solutions:**

1. **Check TypeScript configuration:**
   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "ES2020",
       "strict": true,
       "skipLibCheck": true
     }
   }
   ```

2. **Regenerate with correct settings:**
   ```bash
   atomic-codegen generate typescript -o ./generated --clean
   ```

3. **Check import paths:**
   ```typescript
   // Correct imports
   import { Patient } from './generated';
   import * as primitives from './generated/types/primitives';
   ```

#### Issue: Memory errors during generation

**Symptoms:**
```bash
Error: JavaScript heap out of memory
FATAL ERROR: Ineffective mark-compacts near heap limit
```

**Solutions:**

1. **Increase memory limit:**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=8192"
   atomic-codegen generate typescript -o ./output
   ```

2. **Use streaming mode:**
   ```bash
   atomic-codegen generate typescript -o ./output --streaming
   ```

3. **Generate in smaller batches:**
   ```bash
   # Generate only specific resources
   atomic-codegen generate typescript -o ./output --include "Patient,Observation"
   ```

#### Issue: Slow generation performance

**Symptoms:**
- Generation takes very long time
- High CPU usage
- Process appears stuck

**Solutions:**

1. **Use verbose mode to see progress:**
   ```bash
   atomic-codegen generate typescript -o ./output -v
   ```

2. **Enable parallel processing:**
   ```bash
   export ATOMIC_CODEGEN_PARALLEL=true
   atomic-codegen generate typescript -o ./output
   ```

3. **Use cached TypeSchema:**
   ```bash
   # Create TypeSchema once
   atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 -o schema.ndjson
   
   # Reuse for multiple generations
   atomic-codegen generate typescript -i schema.ndjson -o ./output
   ```

### 5. Output and File Issues

#### Issue: Generated files are empty or incomplete

**Symptoms:**
- Empty TypeScript files
- Missing resource types
- Incomplete interfaces

**Solutions:**

1. **Check input schema:**
   ```bash
   # Validate TypeSchema
   atomic-codegen typeschema validate schema.ndjson
   ```

2. **Regenerate with clean output:**
   ```bash
   rm -rf ./output
   atomic-codegen generate typescript -o ./output -v
   ```

3. **Check for filtering:**
   ```bash
   # Remove any include/exclude filters
   atomic-codegen generate typescript -o ./output --no-filter
   ```

#### Issue: Import/export errors in generated code

**Symptoms:**
```typescript
// Generated code has issues
export { Patient } from './Patient';  // File not found
import { Resource } from '../types/base';  // Module not found
```

**Solutions:**

1. **Check file structure:**
   ```bash
   find ./generated -name "*.ts" | head -10
   ```

2. **Regenerate with correct structure:**
   ```bash
   atomic-codegen generate typescript -o ./generated --file-structure nested
   ```

3. **Verify index file:**
   ```bash
   cat ./generated/index.ts
   ```

### 6. Runtime and Usage Issues

#### Issue: Type errors when using generated types

**Symptoms:**
```typescript
const patient: Patient = {
  resourceType: 'Patient',  // Error: Type '"Patient"' is not assignable
  // ...
};
```

**Solutions:**

1. **Check type imports:**
   ```typescript
   // Ensure correct import
   import { Patient } from './generated';
   // or
   import { Patient } from './generated/resources/Patient';
   ```

2. **Verify generated types:**
   ```bash
   # Check if Patient type exists
   grep -n "interface Patient" ./generated/resources/Patient.ts
   ```

3. **Use type assertion if needed:**
   ```typescript
   const patient = {
     resourceType: 'Patient' as const,
     // ...
   } satisfies Patient;
   ```

#### Issue: Value set types not working

**Symptoms:**
```typescript
// Value set types not recognized
const code: AdministrativeGenderValueSet = 'male';  // Error
```

**Solutions:**

1. **Check value set generation:**
   ```bash
   ls ./generated/types/valuesets.ts
   cat ./generated/types/valuesets.ts | grep AdministrativeGender
   ```

2. **Import value sets:**
   ```typescript
   import { AdministrativeGenderValueSet } from './generated/types/valuesets';
   ```

3. **Regenerate with value sets:**
   ```bash
   atomic-codegen generate typescript -o ./generated --include-valuesets
   ```

## Advanced Troubleshooting

### Debug Mode

Enable debug logging for detailed information:

```bash
export ATOMIC_CODEGEN_LOG_LEVEL=debug
atomic-codegen generate typescript -o ./output -v
```

### Cache Issues

Clear caches if experiencing persistent issues:

```bash
# Clear all caches
rm -rf ~/.atomic-codegen/cache

# Clear specific package cache
rm -rf ~/.atomic-codegen/cache/hl7.fhir.r4.core@4.0.1
```

### Configuration Debugging

Show all configuration sources:

```bash
atomic-codegen config show --show-sources --verbose
```

### Performance Profiling

Profile generation performance:

```bash
export ATOMIC_CODEGEN_PROFILE=true
atomic-codegen generate typescript -o ./output -v
```

## Getting Help

### Self-Help Resources

1. **Check documentation:**
   - [Getting Started Guide](./GETTING_STARTED.md)
   - [Configuration Guide](./CONFIGURATION.md)
   - [API Documentation](./FHIR_TYPE_GENERATION.md)

2. **Review examples:**
   ```bash
   ls examples/
   cat examples/generate-types.ts
   ```

3. **Run diagnostics:**
   ```bash
   atomic-codegen --help
   atomic-codegen config validate
   atomic-codegen generators list
   ```

### Community Support

1. **GitHub Issues:**
   - Search existing issues: https://github.com/atomic-ehr/codegen/issues
   - Create new issue with:
     - Operating system and version
     - Bun/Node.js version
     - Command that failed
     - Full error message
     - Configuration file (if applicable)

2. **Discussion Forums:**
   - GitHub Discussions for questions and ideas
   - Stack Overflow with `atomic-ehr-codegen` tag

### Issue Reporting Template

When reporting issues, include:

```bash
# System information
bun --version
atomic-codegen --version
uname -a

# Configuration
atomic-codegen config show

# Command that failed
atomic-codegen generate typescript -o ./output -v

# Error output
[paste full error message]

# Additional context
[describe what you were trying to achieve]
```

## Prevention Tips

### Best Practices

1. **Use configuration files:**
   ```bash
   atomic-codegen config init --template typescript
   ```

2. **Version control configuration:**
   ```bash
   git add .atomic-codegen.json
   ```

3. **Use specific package versions:**
   ```json
   {
     "typeschema": {
       "packages": ["hl7.fhir.r4.core@4.0.1"]
     }
   }
   ```

4. **Test in CI/CD:**
   ```yaml
   # .github/workflows/test.yml
   - name: Generate FHIR types
     run: atomic-codegen generate typescript -o ./generated
   ```

5. **Keep dependencies updated:**
   ```bash
   bun update @atomic-ehr/codegen
   ```

### Monitoring

Set up monitoring for production usage:

```bash
# Log generation metrics
atomic-codegen generate typescript -o ./output --metrics > generation.log

# Monitor file sizes
du -sh ./generated/
```

Remember: Most issues can be resolved by checking configuration, clearing caches, or regenerating with verbose output. When in doubt, start with the basics and work your way up to more complex solutions.
