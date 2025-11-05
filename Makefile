AIDBOX_LICENSE_ID ?=

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

prepare-aidbox-runme:
	@if [ ! -f "example/docker-compose.yaml" ]; then \
    echo "Download docker-compose.yaml to run Aidbox and set BOX_ROOT_CLIENT_SECRET to <SECRET>"; \
    if [ -n "***" ]; then \
        curl -s https://aidbox.app/runme/l/*** | sed 's/BOX_ROOT_CLIENT_SECRET: .*/BOX_ROOT_CLIENT_SECRET: <SECRET>/' > examples/docker-compose.yaml; \
    else \
      	curl -s https://aidbox.app/runme/fscg | sed 's/BOX_ROOT_CLIENT_SECRET: .*/BOX_ROOT_CLIENT_SECRET: <SECRET>/' > examples/docker-compose.yaml; \
        echo "WARN: Open http://localhost:8080 and add Aidbox license"; \
    	fi; \
	fi
	@docker compose -f examples/docker-compose.yaml up --wait


test-typescript-r4-example: typecheck format
	$(LINT)
	bun run examples/typescript-r4/generate.ts
	$(TYPECHECK) --project tsconfig.example-typescript-r4.json
	cd examples/typescript-r4 && bun run demo.ts > /dev/null

test-typescript-ccda-example: typecheck format
	$(LINT)
	$(TEST) test/unit/typeschema/transformer/ccda.test.ts
	bun run examples/typescript-ccda/generate.ts
	$(TYPECHECK) --project tsconfig.example-typescript-ccda.json
	cd examples/typescript-r4 && bun run demo.ts > /dev/null

test-csharp-sdk: typecheck format prepare-aidbox-runme
	$(LINT)
	$(TYPECHECK) --project tsconfig.example-csharp.json
	bun run examples/csharp/generate.ts
	cd examples/csharp && dotnet restore && dotnet build & dotnet test
