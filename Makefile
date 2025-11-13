AIDBOX_LICENSE_ID ?=

TYPECHECK = bunx tsc --noEmit
FORMAT = bunx biome format --write
LINT = bunx biome lint --diagnostic-level=error --write --unsafe
TEST = bun test

.PHONY: all typecheck test-typeschema test-register test-codegen test-typescript-r4-example

all: test-codegen test-typescript-r4-example test-typescript-ccda-example lint-unsafe

lint:
	$(LINT)

lint-unsafe:
	bunx biome lint --write --unsafe

typecheck:
	$(TYPECHECK)

format:
	$(FORMAT)

test-typeschema: typecheck format lint
	$(TEST) typeschema

test-register: typecheck format lint
	$(TEST) register

test-codegen: typecheck format lint
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


test-typescript-r4-example: typecheck format lint
	bun run examples/typescript-r4/generate.ts
	$(TYPECHECK) --project tsconfig.example-typescript-r4.json
	cd examples/typescript-r4 && bun run demo.ts > /dev/null

test-typescript-ccda-example: typecheck format lint
	$(TEST) test/unit/typeschema/transformer/ccda.test.ts
	bun run examples/typescript-ccda/generate.ts
	$(TYPECHECK) --project tsconfig.example-ccda.json
	# cd examples/typescript-r4 && bun run demo.ts > /dev/null

test-csharp-sdk: typecheck format prepare-aidbox-runme lint
	$(TYPECHECK) --project tsconfig.example-csharp.json
	bun run examples/csharp/generate.ts
	cd examples/csharp && dotnet restore
	cd examples/csharp && dotnet build
	cd examples/csharp && dotnet test

PYTHON=python3
PYTHON_SDK_EXAMPLE=./examples/python

test-python-sdk: typecheck format prepare-aidbox-runme lint
	$(TYPECHECK) --project tsconfig.example-python.json
	bun run examples/python/generate.ts

	@if [ ! -d "$(PYTHON_SDK_EXAMPLE)/venv" ]; then \
		cd $(PYTHON_SDK_EXAMPLE) && \
		$(PYTHON) -m venv venv && \
		. venv/bin/activate && \
		pip install -r generated/requirements.txt; \
	fi

	cd $(PYTHON_SDK_EXAMPLE) && \
		. venv/bin/activate && \
		python -m pytest test_sdk.py -v
