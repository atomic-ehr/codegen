# Task: Implement New CLI Command Structure

## Priority
High

## Description
Implement the new CLI structure with typeschema and generate subcommand groups:
- Replace current CLI with command-based structure
- Implement typeschema subcommands (create, validate, merge)
- Implement generate subcommands (typescript)
- Add proper help and error handling

## Acceptance Criteria
- [ ] Create new CLI structure with yargs subcommands
- [ ] Implement `atomic-codegen typeschema create` command
- [ ] Implement `atomic-codegen typeschema validate` command  
- [ ] Implement `atomic-codegen typeschema merge` command
- [ ] Implement `atomic-codegen generate typescript` command
- [ ] Add comprehensive help text for all commands
- [ ] Implement proper error handling and validation
- [ ] Add command aliases and shortcuts
- [ ] Ensure all commands work with library modules
- [ ] Create CLI integration tests

## Notes
- Maintain backward compatibility where possible
- Focus on intuitive command discovery
- Provide helpful error messages and suggestions