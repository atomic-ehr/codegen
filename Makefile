TYPECHECK = bunx tsc --noEmit
FORMAT = bunx biome format --write
LINT = bunx biome lint --diagnostic-level=error --write --unsafe
TEST = bun test

.PHONY: all typecheck test-typeschema test-register test-codegen test-typescript-r4-example

all: test-codegen test-typescript-r4-example

typecheck:
	$(TYPECHECK)

format:
	$(FORMAT)

test-typeschema: typecheck format
	$(LINT)
	$(TEST) typeschema

test-register: typecheck format
	$(LINT)
	$(TEST) register

test-codegen: typecheck format
	$(LINT)
	$(TEST)

test-typescript-r4-example: typecheck format
	$(LINT)
	bun run examples/typescript-r4/generate.ts
	$(TYPECHECK) --project tsconfig.example-typescript-r4.json
	cd examples/typescript-r4 && bun run demo.ts > /dev/null
