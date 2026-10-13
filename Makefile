# Dependencies installed into the build virtual environment
TESTS_REQUIRE := bare-script
RUN_REQUIRE := markdown-up
PLAN_REQUIRE := numpy scipy pillow matplotlib

# Python virtual environment paths
VENV_DIR := build/venv
VENV_BIN := $(VENV_DIR)/bin
VENV_BUILD := $(VENV_DIR).build
VENV_RUN := $(VENV_DIR).run
VENV_PLAN := $(VENV_DIR).plan

# The MarkdownUp application port
PORT ?= 8080


.DEFAULT_GOAL := help


.PHONY: help
help:
	@echo "usage: make [clean|commit|doc|evaluate|lint|plan|run|test|test-tools|update]"
	@echo ""
	@echo "  make plan FILE=<plan.png> [OUTPUT=<plan.json>]  Engineer road plan options from a topo map image (Claude Code)"
	@echo "  make update FILE=<plan.json>              Update a road plan model with review feedback (Claude Code)"
	@echo "    (plan and update accept MODEL=<model> [default: $(MODEL)] and EFFORT=<effort> [default: $(EFFORT)],"
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


# Run the planning tools unit tests
.PHONY: test-tools
test-tools: $(VENV_PLAN)
	cd tools && ../$(VENV_BIN)/python3 -m unittest -v test_plan_tools


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


# Engineer road plan options from a topographic map image - launches Claude Code (or Grok) with the planning
# instructions (PLAN.md). Outputs OUTPUT (default is "<plan>.json"); intermediate work files go in the
# output's ".work/" directory (e.g., "<plan>.work/").
PLAN_OUTPUT = $(if $(OUTPUT),$(OUTPUT),$(basename $(FILE)).json)
PLAN_WORK = $(basename $(PLAN_OUTPUT)).work

# The Claude Code model and effort level for the plan and update sessions. OLLAMA=1 launches Claude Code
# with an Ollama model instead ("ollama launch claude") - MODEL then names the Ollama model, and when it
# isn't given Ollama chooses the model (it prompts if needed). GROK=1 launches the Grok CLI instead -
# MODEL then names the Grok model, and when it isn't given Grok uses its default model.
MODEL = opus
EFFORT = high
MODEL_ARG = $(if $(filter command line,$(origin MODEL)),--model "$(MODEL)")
ifdef GROK
AGENT = grok $(MODEL_ARG)
else ifdef OLLAMA
AGENT = ollama launch claude $(MODEL_ARG) --
else
AGENT = claude --model "$(MODEL)"
endif

# The agent session's display name argument (the Grok CLI doesn't name sessions)
AGENT_NAME = $(if $(GROK),,--name "$(1)")

.PHONY: plan
plan: $(VENV_BUILD) $(VENV_PLAN)
	@test -n "$(FILE)" || (echo 'usage: make plan FILE=<plan.png> [OUTPUT=<plan.json>] [MODEL=<model>] [EFFORT=<effort>] [OLLAMA=1|GROK=1]' && exit 1)
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	mkdir -p "$(PLAN_WORK)"
	$(AGENT) \
		--allowedTools "Bash($(VENV_BIN)/python3 tools/plan_tools.py *) Bash($(VENV_BIN)/python3 $(PLAN_WORK)/scripts/*) \
Bash(make evaluate *) Bash(make doc)" \
		--permission-mode acceptEdits \
		--effort "$(EFFORT)" \
		$(call AGENT_NAME,Roadie: $(notdir $(FILE))) \
		"Engineer cost-optimal road plan options for the topographic map image \"$(FILE)\" by following the \
instructions in PLAN.md exactly. Write the road plan model to \"$(PLAN_OUTPUT)\" and put intermediate \
work files in \"$(PLAN_WORK)/\". The Python tools are run with \"$(VENV_BIN)/python3 tools/plan_tools.py\"."


# Update an existing road plan model with review feedback (Claude Code or Grok) - the session asks for the feedback
UPDATE_WORK = $(basename $(FILE)).work

.PHONY: update
update: $(VENV_BUILD) $(VENV_PLAN)
	@test -n "$(FILE)" || (echo 'usage: make update FILE=<plan.json> [MODEL=<model>] [EFFORT=<effort>] [OLLAMA=1|GROK=1]' && exit 1)
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	mkdir -p "$(UPDATE_WORK)"
	$(AGENT) \
		--allowedTools "Bash($(VENV_BIN)/python3 tools/plan_tools.py *) Bash($(VENV_BIN)/python3 $(UPDATE_WORK)/scripts/*) \
Bash(make evaluate *) Bash(make doc)" \
		--permission-mode acceptEdits \
		--effort "$(EFFORT)" \
		$(call AGENT_NAME,Roadie update: $(notdir $(FILE))) \
		"Update the road plan model \"$(FILE)\" with review feedback by following the \"Updating a plan\" \
instructions in PLAN.md exactly. Intermediate work files (including any from the original planning \
session) are in \"$(UPDATE_WORK)/\". The Python tools are run with \"$(VENV_BIN)/python3 tools/plan_tools.py\". \
Ask me for the review feedback first."


# Print a road plan model's analysis and cost (DETAIL=1 adds the station table)
.PHONY: evaluate
evaluate: $(VENV_BUILD)
	@test -n "$(FILE)" || (echo 'usage: make evaluate FILE=<plan.json> [DETAIL=1]' && exit 1)
	@$(VENV_BIN)/bare -m roadieCLI.bare -c 'return roadieCLIMain()' -v vFile "'$(FILE)'"$(if $(DETAIL), -v vDetail true)


# Print the road plan model documentation
.PHONY: doc
doc: $(VENV_BUILD)
	@$(VENV_BIN)/bare -m roadieCLI.bare -c 'return roadieCLIMain()' -v vDoc true


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

# Add the planning tool dependencies to the virtual environment, once
$(VENV_PLAN): $(VENV_BUILD)
	$(VENV_BIN)/pip install $(PLAN_REQUIRE)
	touch $@
