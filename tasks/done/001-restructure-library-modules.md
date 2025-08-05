# Task: Restructure Code into Library Modules

## Priority
High

## Description
Restructure existing code from src/ into proper library modules according to the new architecture:
- Move typeschema logic to src/lib/typeschema/
- Move generator logic to src/lib/generators/
- Create src/lib/core/ for shared utilities
- Update imports and exports accordingly

## Acceptance Criteria
- [ ] Create new directory structure under src/lib/
- [ ] Move existing typeschema code to src/lib/typeschema/
- [ ] Move existing generator code to src/lib/generators/
- [ ] Create src/lib/core/ with shared utilities
- [ ] Update all import statements
- [ ] Ensure all existing tests pass
- [ ] Update main src/index.ts to export library interface

## Notes
- Preserve all existing functionality during restructure
- Maintain backward compatibility where possible
- Update package.json main/module fields if needed