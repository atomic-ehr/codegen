# Task: Add Configuration System

## Priority
Medium

## Description
Implement a comprehensive configuration system supporting:
- Configuration files (.atomic-codegen.json)
- Environment variable overrides (ATOMIC_CODEGEN_*)
- Command-line argument precedence
- Validation and defaults

## Acceptance Criteria
- [ ] Create configuration schema with TypeScript interfaces
- [ ] Implement configuration file loading (.atomic-codegen.json)
- [ ] Add environment variable support (ATOMIC_CODEGEN_*)
- [ ] Implement configuration precedence (CLI > env > config file > defaults)
- [ ] Add configuration validation with helpful error messages
- [ ] Create configuration management utility class
- [ ] Add configuration examples and documentation
- [ ] Implement config validation command
- [ ] Create unit tests for configuration system

## Notes
- Use consistent naming conventions for env vars
- Provide clear validation messages
- Consider workspace vs global configuration