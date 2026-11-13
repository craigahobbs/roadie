# Dependencies installed into the build virtual environment
TESTS_REQUIRE := bare-script
RUN_REQUIRE := markdown-up

# Python virtual environment paths
VENV_DIR := build/venv
VENV_BIN := $(VENV_DIR)/bin
VENV_BUILD := $(VENV_DIR).build
VENV_RUN := $(VENV_DIR).run

# Delegate a target to the planning tools project (plan/) - FILE and OUTPUT are relative to this directory
PLAN_MAKE = @$(MAKE) --no-print-directory -C plan $(1)$(if $(FILE), FILE="$(abspath $(FILE))")$(if $(OUTPUT), OUTPUT="$(abspath $(OUTPUT))")

# The MarkdownUp application port
PORT ?= 8080


.DEFAULT_GOAL := help


.PHONY: help
help:
	@echo "usage: make [clean|commit|doc|evaluate|lint|plan|run|test|test-tools|update]"
	@echo ""
	@echo "  make plan FILE=<plan.png> [OUTPUT=<plan.json>]  Engineer road plan options from a topo map image (Claude Code)"
	@echo "  make update FILE=<plan.json>              Update a road plan model with review feedback (Claude Code)"
	@echo "    (plan and update accept MODEL=<model> [default: opus] and EFFORT=<effort> [default: high],"
	@echo "     OLLAMA=1 to launch Claude Code with an Ollama model - MODEL then names the Ollama model,"
	@echo "     and GROK=1 to launch the Grok CLI instead - MODEL then names the Grok model)"
	@echo "  make run [FILE=<plan.json>]              View a road plan model in the browser"
	@echo "  make evaluate FILE=<plan.json> [DETAIL=1]  Print a road plan model's analysis and cost"
	@echo "  make doc                                 Print the road plan model documentation"
	@echo "  make commit                              Run the tests and lint"


# Run the tests then lint - the pre-commit gate
.PHONY: commit
commit: test test-tools lint


# Run the unit tests (TEST="testName" runs one test); -d surfaces builtin debug logs
.PHONY: test
test: $(VENV_BUILD)
	$(VENV_BIN)/bare -d -m test/runTests.bare$(if $(TEST), -v vUnittestTest "'$(TEST)'")


# Run the planning tools unit tests and lint (plan/)
.PHONY: test-tools
test-tools:
	$(call PLAN_MAKE,commit)


# Lint every script standalone. -x lints and executes (libraries + test files);
# -s lints the test runners without executing them (that's `make test`).
.PHONY: lint
lint: $(VENV_BUILD)
	$(VENV_BIN)/bare -x -m *.bare test/test*.bare
	$(VENV_BIN)/bare -s -m test/runTests.bare


# View a road plan model in a browser (MarkdownUp local server). The plan's directory is linked into
# the served directory so the plan (and its map image) can be fetched.
.PHONY: run
run: $(VENV_RUN)
ifeq ($(FILE),)
	$(VENV_BIN)/markdown-up -p $(PORT) roadie.md
else
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	rm -rf build/run
	mkdir -p build/run
	ln -s "$(abspath roadie.md)" "$(abspath roadie.bare)" "$(abspath roadieModel.bare)" build/run/
	ln -s "$(abspath $(dir $(FILE)))" build/run/plan
	$(VENV_BIN)/python3 -c "import time, urllib.parse, webbrowser; time.sleep(2); \
		webbrowser.open(\"http://127.0.0.1:$(PORT)/roadie.html#var.vFile='\" + \
		urllib.parse.quote('plan/$(notdir $(FILE))', safe='') + \"'\")" &
	$(VENV_BIN)/markdown-up -n -p $(PORT) build/run
endif


# Engineer road plan options from a topographic map image, and update an existing road plan model with review
# feedback (Claude Code or Grok) - see plan/Makefile and plan/PLAN.md
.PHONY: plan update
plan update:
	$(call PLAN_MAKE,$@)


# Print a road plan model's analysis and cost (DETAIL=1 adds the station table), and the road plan model documentation
.PHONY: evaluate doc
evaluate doc:
	$(call PLAN_MAKE,$@)


# Remove the build directory (and the virtual environment)
.PHONY: clean
clean:
	rm -rf build/


# Build the virtual environment with the bare CLI, once
$(VENV_BUILD):
	mkdir -p $(VENV_DIR)
	python3 -m venv --upgrade-deps $(VENV_DIR)
	$(VENV_BIN)/pip install $(TESTS_REQUIRE)
	touch $@

# Add the MarkdownUp server to the virtual environment, once
$(VENV_RUN): $(VENV_BUILD)
	$(VENV_BIN)/pip install $(RUN_REQUIRE)
	touch $@
