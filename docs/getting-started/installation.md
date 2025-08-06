# Installation

This guide covers different ways to install and set up Atomic EHR Codegen.

## Prerequisites

- **Bun** >= 1.0 (recommended) or **Node.js** >= 18
- **TypeScript** >= 5.0 (peer dependency)

## Installation Methods

### Global Installation (Recommended)

Install globally to use the CLI from anywhere:

```bash
# Using Bun (recommended)
bun install -g @atomic-ehr/codegen

# Using npm
npm install -g @atomic-ehr/codegen

# Using pnpm
pnpm install -g @atomic-ehr/codegen
```

After installation, verify it works:

```bash
atomic-codegen --version
atomic-codegen --help
```

### Project-local Installation

Install as a development dependency in your project:

```bash
# Using Bun
bun add -d @atomic-ehr/codegen

# Using npm
npm install --save-dev @atomic-ehr/codegen

# Using pnpm
pnpm add -D @atomic-ehr/codegen
```

Then run using your package manager's script runner:

```bash
# Using Bun
bunx atomic-codegen --help

# Using npm
npx atomic-codegen --help

# Using pnpm
pnpm exec atomic-codegen --help
```

### One-time Usage

Run without installation using package runners:

```bash
# Using Bun
bunx @atomic-ehr/codegen --help

# Using npm
npx @atomic-ehr/codegen --help

# Using pnpm
pnpm dlx @atomic-ehr/codegen --help
```

## Verify Installation

Check that everything is working correctly:

```bash
# Check version
atomic-codegen --version

# Run a simple command
atomic-codegen typeschema create --help

# Test with a small FHIR package
atomic-codegen typeschema create hl7.fhir.r4.core@4.0.1 --help
```

## Development Installation

If you want to contribute to the project or run the latest development version:

```bash
# Clone the repository
git clone https://github.com/atomic-ehr/codegen.git
cd codegen

# Install dependencies
bun install

# Build the project
bun run build

# Run the CLI
bun run cli

# Run tests
bun test
```

## Troubleshooting

### Common Issues

#### Permission Errors (Global Installation)

If you get permission errors during global installation:

```bash
# On macOS/Linux, try with sudo
sudo bun install -g @atomic-ehr/codegen

# Or configure npm to use a different directory
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

#### TypeScript Peer Dependency Warning

If you see TypeScript peer dependency warnings:

```bash
# Install TypeScript globally
bun install -g typescript

# Or locally in your project
bun add -d typescript
```

#### Command Not Found

If `atomic-codegen` command is not found after global installation:

1. Check your PATH includes the global bin directory
2. Restart your terminal
3. Try the full path: `~/.bun/bin/atomic-codegen` (Bun) or `~/.npm-global/bin/atomic-codegen` (npm)

### Getting Help

- Check the [troubleshooting guide](../troubleshooting.md)
- Open an issue on [GitHub](https://github.com/atomic-ehr/codegen/issues)
- Join our [Discord community](https://discord.gg/atomic-ehr)

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Configuration](../guides/configuration.md)
- [CLI Reference](../api-reference/cli.md)