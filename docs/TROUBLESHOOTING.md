# Troubleshooting

Common issues and solutions when using Atomic EHR Codegen.

## Installation Issues

### Command Not Found

**Problem**: `atomic-codegen: command not found` after installation

**Solutions**:

1. **Check global installation path**:
   ```bash
   # For Bun
   echo $PATH | grep -o "[^:]*\.bun[^:]*"
   
   # For npm
   npm config get prefix
   ```

2. **Add to PATH** (if missing):
   ```bash
   # Bun (add to ~/.bashrc or ~/.zshrc)
   export PATH="$HOME/.bun/bin:$PATH"
   
   # npm
   export PATH="$HOME/.npm-global/bin:$PATH"
   ```

3. **Use package runners**:
   ```bash
   # Instead of global install
   bunx @atomic-ehr/codegen --help
   npx @atomic-ehr/codegen --help
   ```

### Permission Errors

**Problem**: Permission denied during global installation

**Solutions**:

1. **Use package manager's fix**:
   ```bash
   # npm - configure different directory
   npm config set prefix ~/.npm-global
   
   # Then install
   npm install -g @atomic-ehr/codegen
   ```

2. **Use sudo** (not recommended):
   ```bash
   sudo bun install -g @atomic-ehr/codegen
   ```

3. **Use local installation**:
   ```bash
   # Install locally instead
   bun add -d @atomic-ehr/codegen
   bunx atomic-codegen --help
   ```

### TypeScript Peer Dependency Warning

**Problem**: Peer dependency warnings about TypeScript

**Solution**:
```bash
# Install TypeScript
bun install -g typescript
# or
npm install -g typescript

# For projects, install locally
bun add -d typescript
```

## Configuration Issues

### Configuration Not Found

**Problem**: Tool can't find configuration file

**Diagnostic**:
```bash
# Check current directory
pwd
ls -la | grep atomic-codegen

# Show what configuration is being used
atomic-codegen config show
```

**Solutions**:

1. **Create configuration**:
   ```bash
   atomic-codegen config init
   ```

2. **Specify configuration explicitly**:
   ```bash
   atomic-codegen --config ./my-config.json typeschema create
   ```

3. **Check file naming**:
   ```bash
   # Supported names
   .atomic-codegen.json
   .atomic-codegen.js
   atomic-codegen.config.json
   atomic-codegen.config.js
   ```

### Configuration Validation Errors

**Problem**: Invalid configuration file

**Diagnostic**:
```bash
atomic-codegen config validate --verbose
```

**Common fixes**:

1. **JSON syntax errors**:
   ```bash
   # Validate JSON syntax
   cat .atomic-codegen.json | jq .
   ```

2. **Missing required fields**:
   ```json
   {
     "typeschema": {
       "packages": ["hl7.fhir.r4.core@4.0.1"],
       "outputFormat": "ndjson",
       "validation": true
     }
   }
   ```

3. **Invalid field values**:
   ```json
   {
     "generator": {
       "target": "typescript",  // not "typscript"
       "namespaceStyle": "nested",  // not "flatten"
       "fileNaming": "PascalCase"  // not "pascal"
     }
   }
   ```

## FHIR Package Issues

### Package Not Found

**Problem**: Cannot find FHIR package

```
Error: Package 'hl7.fhir.r4.core@4.0.1' not found
```

**Solutions**:

1. **Check package name and version**:
   ```bash
   # List available packages (if registry supports it)
   atomic-codegen typeschema create --help
   
   # Common package names
   hl7.fhir.r4.core@4.0.1
   hl7.fhir.us.core@6.1.0
   hl7.fhir.r5.core@5.0.0
   ```

2. **Clear package cache**:
   ```bash
   atomic-codegen typeschema create --drop-cache hl7.fhir.r4.core@4.0.1
   ```

3. **Check network connectivity**:
   ```bash
   # Test connection to FHIR registry
   curl -I https://packages.fhir.org/
   ```

### Package Download Timeout

**Problem**: Package download times out

**Solutions**:

1. **Increase timeout** (if supported):
   ```bash
   # Use verbose mode to see progress
   atomic-codegen --verbose typeschema create hl7.fhir.r4.core@4.0.1
   ```

2. **Check proxy settings**:
   ```bash
   # Set proxy if needed
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   ```

3. **Use cached packages**:
   ```bash
   # Don't drop cache
   atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1
   ```

## Generation Issues

### Empty Output

**Problem**: Code generation produces no files

**Diagnostic**:
```bash
# Use verbose mode
atomic-codegen --verbose generate typescript -i schemas.ndjson -o ./types

# Check input file
ls -la schemas.ndjson
head -5 schemas.ndjson

# Validate input
atomic-codegen typeschema validate schemas.ndjson
```

**Solutions**:

1. **Check input file format**:
   ```bash
   # Should be NDJSON (newline-delimited JSON)
   cat schemas.ndjson | head -1 | jq .
   ```

2. **Verify schemas contain data**:
   ```bash
   wc -l schemas.ndjson  # Should show number of schemas
   grep -c '"kind":' schemas.ndjson  # Count schema types
   ```

3. **Check output directory permissions**:
   ```bash
   mkdir -p ./types
   touch ./types/test.txt  # Test write permissions
   rm ./types/test.txt
   ```

### TypeScript Compilation Errors

**Problem**: Generated TypeScript code has compilation errors

**Diagnostic**:
```bash
# Check TypeScript version
bunx tsc --version

# Compile generated files
bunx tsc --noEmit types/fhir/*.ts
```

**Solutions**:

1. **Update TypeScript**:
   ```bash
   bun add -d typescript@latest
   ```

2. **Check tsconfig.json**:
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

3. **Regenerate with correct settings**:
   ```bash
   atomic-codegen generate typescript \
     -i schemas.ndjson \
     -o ./types \
     --format
   ```

### Python Import Errors

**Problem**: Generated Python modules can't be imported

**Solutions**:

1. **Check __init__.py files**:
   ```bash
   # Should have __init__.py in each directory
   find ./fhir_models -name "__init__.py" | head -5
   ```

2. **Add to Python path**:
   ```python
   import sys
   sys.path.append('./fhir_models')
   
   from patient import Patient
   ```

3. **Use proper package structure**:
   ```bash
   # Regenerate with proper structure
   atomic-codegen generate python \
     -i schemas.ndjson \
     -o ./src/fhir_models \
     --namespace-style nested
   ```

## Performance Issues

### Slow Generation

**Problem**: Code generation takes very long

**Solutions**:

1. **Use treeshaking**:
   ```json
   {
     "typeschema": {
       "packages": ["hl7.fhir.r4.core@4.0.1"],
       "treeshaking": ["Patient", "Observation", "Encounter"]
     }
   }
   ```

2. **Reduce package scope**:
   ```bash
   # Instead of full US Core
   atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1
   # Add specific profiles later
   ```

3. **Use separate output format**:
   ```json
   {
     "typeschema": {
       "outputFormat": "separate"  // Instead of merged
     }
   }
   ```

### Memory Issues

**Problem**: Out of memory errors during generation

**Solutions**:

1. **Increase memory limit**:
   ```bash
   # For Node.js/Bun
   NODE_OPTIONS="--max-old-space-size=8192" atomic-codegen generate typescript
   ```

2. **Process in batches**:
   ```bash
   # Split large TypeSchema files
   atomic-codegen typeschema merge \
     schemas1.ndjson schemas2.ndjson \
     --filter-kinds resource \
     -o resources-only.ndjson
   ```

3. **Use streaming processing** (if available):
   ```json
   {
     "generator": {
       "streaming": true  // If supported
     }
   }
   ```

## Validation Issues

### Schema Validation Errors

**Problem**: TypeSchema validation fails

**Diagnostic**:
```bash
atomic-codegen typeschema validate --verbose schemas.ndjson
```

**Solutions**:

1. **Check schema format**:
   ```bash
   # Each line should be valid JSON
   cat schemas.ndjson | jq -c . > /dev/null
   ```

2. **Fix malformed schemas**:
   ```bash
   # Remove invalid lines
   cat schemas.ndjson | jq -c . > valid-schemas.ndjson
   ```

3. **Regenerate TypeSchema**:
   ```bash
   atomic-codegen typeschema create \
     --validation \
     hl7.fhir.r4.core@4.0.1 \
     -o new-schemas.ndjson
   ```

### Generated Code Validation

**Problem**: Generated code fails validation

**Solutions**:

1. **Run formatter**:
   ```bash
   # TypeScript
   bunx prettier --write types/fhir/*.ts
   
   # Python
   python -m black fhir_models/
   ```

2. **Check linting rules**:
   ```bash
   # Disable problematic rules
   /* eslint-disable @typescript-eslint/no-unused-vars */
   ```

3. **Regenerate with formatting**:
   ```bash
   atomic-codegen generate typescript \
     -i schemas.ndjson \
     -o ./types \
     --format
   ```

## Debug Mode

Enable debug logging for detailed troubleshooting:

```bash
# Global debug mode
atomic-codegen --debug --log-file debug.log typeschema create hl7.fhir.r4.core@4.0.1

# Verbose with JSON logging
atomic-codegen --verbose --log-format json typeschema create hl7.fhir.r4.core@4.0.1

# Check log file
tail -f debug.log
```

## Getting Help

### Community Support

1. **GitHub Issues**: [Report bugs and ask questions](https://github.com/atomic-ehr/codegen/issues)
2. **Discussions**: [Community discussions](https://github.com/atomic-ehr/codegen/discussions)
3. **Discord**: [Join our community](https://discord.gg/atomic-ehr)

### Reporting Issues

When reporting issues, include:

1. **Version information**:
   ```bash
   atomic-codegen --version
   bun --version  # or node --version
   ```

2. **Configuration**:
   ```bash
   atomic-codegen config show
   ```

3. **Command that failed**:
   ```bash
   atomic-codegen --verbose <your-command-here>
   ```

4. **Error logs**:
   ```bash
   atomic-codegen --debug --log-file error.log <command>
   # Attach error.log to issue
   ```

5. **Environment**:
   - Operating system
   - Shell (bash, zsh, etc.)
   - Package manager used

### Common Fix Patterns

1. **Clear cache and retry**:
   ```bash
   atomic-codegen typeschema create --drop-cache <packages>
   ```

2. **Regenerate from scratch**:
   ```bash
   rm -rf schemas/ types/
   atomic-codegen typeschema create <packages>
   atomic-codegen generate typescript
   ```

3. **Use minimal configuration**:
   ```json
   {
     "typeschema": {
       "packages": ["hl7.fhir.r4.core@4.0.1"],
       "validation": false
     },
     "generator": {
       "target": "typescript",
       "outputDir": "./types"
     }
   }
   ```

4. **Check dependencies**:
   ```bash
   # Verify all peer dependencies
   bun install
   bunx tsc --version
   ```

Remember: When in doubt, start with the simplest possible configuration and gradually add complexity once the basics are working.