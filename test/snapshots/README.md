# Test Snapshots

This directory contains snapshot files for testing generated code consistency.

## How Snapshots Work

Snapshots capture the expected output of code generation at a specific point in time. When tests run:

1. **First run**: If no snapshot exists, the current output is saved as the expected result
2. **Subsequent runs**: The current output is compared against the saved snapshot
3. **Failures**: If output doesn't match the snapshot, the test fails and shows the difference

## Updating Snapshots

To update snapshots when the expected output changes:

```bash
UPDATE_SNAPSHOTS=1 bun test
```

This will update all snapshots to match the current output.

## Snapshot Files

- `*.snap` - Expected output snapshots
- `*.actual` - Actual output when tests fail (for debugging)

## Best Practices

1. **Review changes**: Always review snapshot updates to ensure they're intentional
2. **Keep focused**: Use specific, focused snapshots rather than large ones
3. **Version control**: Commit snapshot files to version control
4. **Clean up**: Remove unused snapshots when tests are deleted

## Common Patterns

### TypeScript Interface Snapshots
```typescript
// Generated interface structure
export interface Patient {
  resourceType: "Patient";
  id?: string;
  // ...
}
```

### Type Guard Snapshots
```typescript
// Generated type guard functions
export function isPatient(value: unknown): value is Patient {
  // validation logic
}
```

### Module Export Snapshots
```typescript
// Generated index files
export * from './Patient';
export * from './Observation';
```