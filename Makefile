AIDBOX_LICENSE_ID ?=

TYPECHECK = bunx tsc --noEmit

VERSION = $(shell cat package.json | grep version | sed -E 's/ *"version": "//' | sed -E 's/",.*//')

.PHONY: all generate-types lint lint-fix lint-unsafe typecheck \
	test test-multi-package \
	prepare-aidbox-runme test-all-example-generation test-other-example-generation \
	test-on-the-fly-example test-on-the-fly-norge-r4 test-on-the-fly-kbv-r4 test-on-the-fly-ccda \
	test-typescript-r4-us-core-example test-typescript-custom-packages-example \
	test-mustache-java-r4-example \
	test-csharp-sdk generate-python-r4-us-core-sdk generate-python-sdk-fhirpy \
	python-r4-us-core-test-setup python-fhirpy-test-setup \
	test-python-sdk test-python-fhirpy-sdk test-python-r4-us-core-example

all: test test-multi-package test-typescript-r4-us-core-example test-typescript-custom-packages-example lint-unsafe test-all-example-generation

generate-types:
	bun run scripts/generate-types.ts

lint:
	bunx biome check

lint-fix:
	bunx biome check --write

lint-unsafe:
	bunx biome check --write --unsafe

typecheck:
	$(TYPECHECK)

test: typecheck
	@find test -name "*.test.ts" -not -path "*/multi-package/*" | sort | \
		xargs -P 1 -I{} sh -c 'echo "==> {}" && bun test {} || exit 255'

test-multi-package: typecheck
	bun test test/api/write-generator/multi-package/cda.test.ts
	bun test test/api/write-generator/multi-package/local-package.test.ts
	bun test test/api/write-generator/multi-package/sql-on-fhir.test.ts

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

test-all-example-generation: test-other-example-generation
	bun run examples/csharp/generate.ts
	bun run examples/typescript-custom-packages/generate.ts
	bun run examples/mustache/mustache-java-r4-gen.ts
	bun run examples/python-r4-us-core/generate.ts
	bun run examples/python-fhirpy/generate.ts
	bun run examples/typescript-r4-us-core/generate.ts

test-other-example-generation: test-on-the-fly-example

test-on-the-fly-example: test-on-the-fly-norge-r4 test-on-the-fly-kbv-r4 test-on-the-fly-ccda

test-on-the-fly-norge-r4: typecheck
	bun run examples/on-the-fly/norge-r4/generate.ts
	$(TYPECHECK) --project examples/on-the-fly/norge-r4/tsconfig.json
	bun test ./examples/on-the-fly/norge-r4/

test-on-the-fly-kbv-r4: typecheck
	bun run examples/on-the-fly/kbv-r4/generate.ts
	$(TYPECHECK) --project examples/on-the-fly/kbv-r4/tsconfig.json
	bun test ./examples/on-the-fly/kbv-r4/

test-on-the-fly-ccda: typecheck
	bun run examples/on-the-fly/ccda/generate.ts
	$(TYPECHECK) --project examples/on-the-fly/ccda/tsconfig.json
	bun test ./examples/on-the-fly/ccda/

test-typescript-r4-us-core-example: typecheck
	bun run examples/typescript-r4-us-core/generate.ts
	$(TYPECHECK) --project examples/typescript-r4-us-core/tsconfig.json
	bun test ./examples/typescript-r4-us-core/

test-typescript-custom-packages-example: typecheck
	bun run examples/typescript-custom-packages/generate.ts
	$(TYPECHECK) --project examples/typescript-custom-packages/tsconfig.json
	bun test ./examples/typescript-custom-packages/

test-mustache-java-r4-example: typecheck
	bun run examples/mustache/mustache-java-r4-gen.ts
	$(TYPECHECK) --project examples/mustache/tsconfig.examples-mustache.json

test-csharp-sdk: typecheck prepare-aidbox-runme
	$(TYPECHECK) --project examples/csharp/tsconfig.json
	bun run examples/csharp/generate.ts
	cd examples/csharp && dotnet restore
	cd examples/csharp && dotnet build
	cd examples/csharp && dotnet test

PYTHON=python3.13
PYTHON_R4_US_CORE_EXAMPLE=./examples/python-r4-us-core
PYTHON_FHIRPY_EXAMPLE=./examples/python-fhirpy

generate-python-r4-us-core-sdk:
	$(TYPECHECK) --project examples/python-r4-us-core/tsconfig.json
	bun run examples/python-r4-us-core/generate.ts

generate-python-sdk-fhirpy:
	$(TYPECHECK) --project examples/python-fhirpy/tsconfig.json
	bun run examples/python-fhirpy/generate.ts

python-r4-us-core-test-setup:
	@if [ ! -d "$(PYTHON_R4_US_CORE_EXAMPLE)/venv" ]; then \
		cd $(PYTHON_R4_US_CORE_EXAMPLE) && \
		$(PYTHON) -m venv venv && \
		. venv/bin/activate && \
		pip install -r fhir_types/requirements.txt; \
	fi

python-fhirpy-test-setup:
	@if [ ! -d "$(PYTHON_FHIRPY_EXAMPLE)/venv" ]; then \
		cd $(PYTHON_FHIRPY_EXAMPLE) && \
		$(PYTHON) -m venv venv && \
		. venv/bin/activate && \
		pip install -r fhir_types/requirements.txt && \
		pip install fhirpy; \
	fi

# Offline: mypy + profile/bundle/extension tests (no Aidbox required).
test-python-r4-us-core-example: typecheck generate-python-r4-us-core-sdk python-r4-us-core-test-setup
	cd $(PYTHON_R4_US_CORE_EXAMPLE) && \
	     . venv/bin/activate && \
	     mypy .

	cd $(PYTHON_R4_US_CORE_EXAMPLE) && \
	     . venv/bin/activate && \
	     python -m pytest --ignore=test_sdk.py -v

# Live SDK client tests via client.py (require Aidbox).
test-python-sdk: typecheck prepare-aidbox-runme generate-python-r4-us-core-sdk python-r4-us-core-test-setup
	cd $(PYTHON_R4_US_CORE_EXAMPLE) && \
	     . venv/bin/activate && \
	     python -m pytest test_sdk.py -v

test-python-fhirpy-sdk: typecheck prepare-aidbox-runme generate-python-sdk-fhirpy python-fhirpy-test-setup
	cd $(PYTHON_FHIRPY_EXAMPLE) && \
	   . venv/bin/activate && \
	   mypy .
