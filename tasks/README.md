# Task Management

This directory contains task files organized by status.

## Structure

- `todo/` - Tasks that need to be done
- `in-progress/` - Tasks currently being worked on
- `done/` - Completed tasks

## Task File Format

Each task is a markdown file with the naming convention: `NNN-task-description.md`

Example: `001-implement-parser.md`

## Task Template

```markdown
# Task: [Title]

## Priority
High | Medium | Low

## Description
What needs to be done

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Notes
Any additional context or dependencies
```

## Workflow

1. Create new tasks in `todo/`
2. Move to `in-progress/` when starting work
3. Move to `done/` when completed
4. Optionally add completion notes to the file