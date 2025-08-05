# Task: Update package.json for New CLI Structure

## Priority
High

## Description
Update package.json and related configuration for the new CLI structure:
- Update binary name to atomic-codegen
- Update scripts to use new CLI structure
- Add new dependencies if needed
- Update package metadata

## Acceptance Criteria
- [ ] Update bin field to use "atomic-codegen" instead of "type-schema"
- [ ] Update CLI-related scripts to use new command structure
- [ ] Add any new dependencies required by the new architecture
- [ ] Update package description and keywords
- [ ] Update README with new CLI examples
- [ ] Update any references to old CLI name in scripts
- [ ] Ensure backward compatibility scripts if needed
- [ ] Test package installation and CLI availability

## Notes
- Consider providing migration guide for existing users
- Maintain existing script functionality where possible
- Update any CI/CD scripts that use the CLI