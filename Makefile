AIDBOX_LICENSE_ID ?=

TYPECHECK = bunx tsc --noEmit

VERSION = $(shell cat package.json | grep version | sed -E 's/ *"version": "//' | sed -E 's/",.*//')

.PHONY: all generate-types lint lint-fix lint-unsafe typecheck \
	test \
	prepare-aidbox-runme test-all-example-generation test-other-example-generation \
	test-on-the-fly-example test-on-the-fly-norge-r4 test-on-the-fly-kbv-r4 \
	test-typescript-r4-example test-typescript-us-core-example test-typescript-sql-on-fhir-example \
	test-typescript-ccda-example test-local-package-folder-example test-mustache-java-r4-example \
	test-csharp-sdk generate-python-sdk generate-python-sdk-fhirpy \
	python-test-setup python-fhirpy-test-setup test-python-sdk test-python-fhirpy-sdk

all: test test-typescript-r4-example test-typescript-us-core-example test-typescript-ccda-example test-typescript-sql-on-fhir-example test-local-package-folder-example lint-unsafe test-all-example-generation

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
	bun test

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
	bun run examples/local-package-folder/generate.ts
	bun run examples/mustache/mustache-java-r4-gen.ts
	bun run examples/python/generate.ts
	bun run examples/python-fhirpy/generate.ts
	bun run examples/typescript-ccda/generate.ts
	bun run examples/typescript-r4/generate.ts
	bun run examples/typescript-sql-on-fhir/generate.ts
	bun run examples/typescript-us-core/generate.ts

test-other-example-generation: test-on-the-fly-example

test-on-the-fly-example: test-on-the-fly-norge-r4 test-on-the-fly-kbv-r4

test-on-the-fly-norge-r4: typecheck
	bun run examples/on-the-fly/norge-r4/generate.ts
	$(TYPECHECK) --project examples/on-the-fly/norge-r4/tsconfig.json
	bun test ./examples/on-the-fly/norge-r4/

test-on-the-fly-kbv-r4: typecheck
	bun run examples/on-the-fly/kbv-r4/generate.ts
	$(TYPECHECK) --project examples/on-the-fly/kbv-r4/tsconfig.json
	bun test ./examples/on-the-fly/kbv-r4/

test-typescript-r4-example: typecheck
	bun run examples/typescript-r4/generate.ts
	$(TYPECHECK) --project examples/typescript-r4/tsconfig.json
	bun test ./examples/typescript-r4/

test-typescript-us-core-example: typecheck
	bun run examples/typescript-us-core/generate.ts
	$(TYPECHECK) --project examples/typescript-us-core/tsconfig.json
	bun test ./examples/typescript-us-core/

test-typescript-sql-on-fhir-example: typecheck
	bun run examples/typescript-sql-on-fhir/generate.ts
	$(TYPECHECK) --project examples/typescript-sql-on-fhir/tsconfig.json

test-typescript-ccda-example: typecheck
	bun test test/unit/typeschema/transformer/ccda.test.ts
	bun run examples/typescript-ccda/generate.ts
	$(TYPECHECK) --project examples/typescript-ccda/tsconfig.json
	bun test --project examples/typescript-ccda/tsconfig.json \
		./examples/typescript-ccda/demo-cda.test.ts \
		./examples/typescript-ccda/demo-ccda.test.ts

test-local-package-folder-example: typecheck
	bun run examples/local-package-folder/generate.ts
	$(TYPECHECK) --project examples/local-package-folder/tsconfig.json
	bun test ./examples/local-package-folder/

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
PYTHON_EXAMPLE=./examples/python
PYTHON_FHIRPY_EXAMPLE=./examples/python-fhirpy

generate-python-sdk:
	$(TYPECHECK) --project examples/python/tsconfig.json
	bun run examples/python/generate.ts

generate-python-sdk-fhirpy:
	$(TYPECHECK) --project examples/python-fhirpy/tsconfig.json
	bun run examples/python-fhirpy/generate.ts

python-test-setup:
	@if [ ! -d "$(PYTHON_EXAMPLE)/venv" ]; then \
		cd $(PYTHON_EXAMPLE) && \
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

test-python-sdk: typecheck prepare-aidbox-runme generate-python-sdk python-test-setup
    # Run mypy in strict mode
	cd $(PYTHON_EXAMPLE) && \
         . venv/bin/activate && \
         mypy --strict .

	cd $(PYTHON_EXAMPLE) && \
         . venv/bin/activate && \
         python -m pytest test_sdk.py -v

	cd $(PYTHON_EXAMPLE) && \
         . venv/bin/activate && \
         python -m pytest test_raw_extension.py -v

test-python-fhirpy-sdk: typecheck prepare-aidbox-runme generate-python-sdk-fhirpy python-fhirpy-test-setup
    # Run mypy in strict mode
	cd $(PYTHON_FHIRPY_EXAMPLE) && \
       . venv/bin/activate && \
       mypy --strict .
