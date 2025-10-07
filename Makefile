TYPECHECK = bunx tsc --noEmit
FORMAT = bunx biome format --write
LINT = bunx biome lint --diagnostic-level=error --write --unsafe
TEST = bun test

.PHONY: all test-typeschema test-register test-codegen test-typescript-r4-example

all: test-codegen test-typescript-r4-example

test-typeschema:
	$(TYPECHECK)
	$(FORMAT)
	$(LINT)
	$(TEST) typeschema

test-register:
	$(TYPECHECK)
	$(FORMAT)
	$(LINT)
	$(TEST) register

test-codegen:
	$(TYPECHECK)
	$(FORMAT)
	$(LINT)
	$(TEST)

test-typescript-r4-example:
	$(TYPECHECK)
	$(FORMAT)
	$(LINT)
	bun run examples/typescript-r4/generate.ts
	$(TYPECHECK) --project tsconfig.example-typescript-r4.json
	cd examples/typescript-r4 && bun run demo.ts > /dev/null
