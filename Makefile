AIDBOX_LICENSE_ID ?=

TYPECHECK = bunx tsc --noEmit
FORMAT = bunx biome format --write
LINT = bunx biome check --write
TEST = bun test
VERSION = $(shell cat package.json | grep version | sed -E 's/ *"version": "//' | sed -E 's/",.*//')

.PHONY: all typecheck test-typeschema test-register test-codegen test-typescript-r4-example

all: test-codegen test-typescript-r4-example test-typescript-ccda-example test-typescript-sql-on-fhir-example lint-unsafe

generate-types:
	bun run scripts/generate-types.ts

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
	$(TYPECHECK) --project examples/typescript-r4/tsconfig.json
	cd examples/typescript-r4 && bun run demo.ts > /dev/null

test-typescript-sql-on-fhir-example: typecheck format lint
	bun run examples/typescript-sql-on-fhir/generate.ts
	$(TYPECHECK) --project examples/typescript-sql-on-fhir/tsconfig.json

test-typescript-ccda-example: typecheck format lint
	$(TEST) test/unit/typeschema/transformer/ccda.test.ts
	bun run examples/typescript-ccda/generate.ts
	$(TYPECHECK) --project examples/typescript-ccda/tsconfig.json

test-csharp-sdk: typecheck format prepare-aidbox-runme lint
	$(TYPECHECK) --project examples/csharp/tsconfig.json
	bun run examples/csharp/generate.ts
	cd examples/csharp && dotnet restore
	cd examples/csharp && dotnet build
	cd examples/csharp && dotnet test

PYTHON=python3.13
PYTHON_SDK_EXAMPLE=./examples/python
PYTHON_GENERAL_EXAMPLE_DIR_NAME = fhir_types
PYTHON_FHIRPY_EXAMPLE_DIR_NAME = fhir_types_with_FhirBaseModel

generate-python-sdk:
	$(TYPECHECK) --project examples/python/tsconfig.json
	bun run examples/python/generate.ts

generate-python-sdk-fhirpy:
	$(TYPECHECK) --project examples/python/tsconfig.json
	bun run examples/python/fhirpy_generate.ts

python-test-setup:
	@if [ ! -d "$(PYTHON_SDK_EXAMPLE)/venv" ]; then \
		cd $(PYTHON_SDK_EXAMPLE) && \
		$(PYTHON) -m venv venv && \
		. venv/bin/activate && \
		pip install -r fhir_types/requirements.txt; \
	fi

test-python-sdk: typecheck format prepare-aidbox-runme lint generate-python-sdk python-test-setup
    # Run mypy in strict mode
	cd $(PYTHON_SDK_EXAMPLE) && \
         . venv/bin/activate && \
         mypy --strict $(PYTHON_GENERAL_EXAMPLE_DIR_NAME)

	cd $(PYTHON_SDK_EXAMPLE) && \
         . venv/bin/activate && \
         python -m pytest test_sdk.py -v

test-python-fhirpy-sdk: typecheck format prepare-aidbox-runme lint generate-python-sdk-fhirpy python-test-setup
    # Run mypy in strict mode
	cd $(PYTHON_SDK_EXAMPLE) && \
       . venv/bin/activate && \
       mypy --strict $(PYTHON_FHIRPY_EXAMPLE_DIR_NAME)

release:
	echo Push tag for $(VERSION)
	git tag -a v$(VERSION) -m "Release $(VERSION)"
	git push origin v$(VERSION)
