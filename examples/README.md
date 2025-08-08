# Examples

This directory contains examples demonstrating the current capabilities and future roadmap of Atomic FHIR Codegen.

## Current Examples

### ✅ Working Examples (v1.0)

- **`basic-usage.ts`** - Demonstrates current working functionality
  - Basic FHIR R4 core type generation
  - TypeScript generation with configuration
  - Type-safe resource creation examples

### 🔮 Preview Examples

- **`rest-client-preview.ts`** - Shows planned REST client API (not yet implemented)
  - Preview of REST client generation (Phase 1)
  - Smart chained search examples (Phase 2)  
  - Operation generation examples (Phase 3)

## Running Examples

```bash
# Run working examples
bun run example:basic basic     # Generate basic FHIR types
bun run example:basic us-core   # US Core (limited support)
bun run example:basic usage     # Demonstrate type usage

# Run preview/roadmap examples
bun run example:preview         # Show roadmap preview
```

## Current Status

### ✅ Fully Supported
- FHIR R4 core package (`hl7.fhir.r4.core@4.0.1`)
- TypeScript interface generation
- Basic resource types (Patient, Observation, etc.)
- Fluent API builder pattern
- CLI interface

### 🚧 In Development (Phase 0)
- **Profile Support** - US Core profiles partially working
- **Extension Handling** - Basic implementation, needs refinement
- **Multi-Package Dependencies** - Core functionality present, needs debugging

### 📋 Planned Features
- **REST Client Generation** (Q2 2024)
- **Smart Chained Search** (Q3 2024)
- **Operation Generation** (Q4 2024)

## Contributing

See our [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on helping implement roadmap features.

## Known Limitations

1. **US Core Profiles**: While basic parsing works, some US Core profiles may not generate correctly due to complex constraints
2. **Extensions**: Basic extension support exists but needs more comprehensive implementation
3. **Custom Packages**: Works for simple cases but needs refinement for complex dependency chains
4. **Profile Inheritance**: Complex profile hierarchies not fully resolved

These limitations are being addressed in Phase 0 of our roadmap.

---

**Note**: Examples marked with 🔮 show planned API design but are not yet functional. They serve as specifications for future development.