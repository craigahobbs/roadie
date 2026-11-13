# The planning tools' dependencies, and pylint
TESTS_REQUIRE := numpy scipy pillow matplotlib pylint


# Download python-build
PYTHON_BUILD_DIR ?= ../../python-build
define WGET
ifeq '$$(wildcard $(notdir $(1)))' ''
$$(info Downloading $(notdir $(1)))
$$(shell [ -f $(PYTHON_BUILD_DIR)/$(notdir $(1)) ] && cp $(PYTHON_BUILD_DIR)/$(notdir $(1)) . || $(call WGET_CMD, $(1)))
endif
endef
WGET_CMD = if command -v wget >/dev/null 2>&1; then wget -q -c $(1); else curl -f -Os $(1); fi
$(eval $(call WGET, https://craigahobbs.github.io/python-build/Makefile.tool))
$(eval $(call WGET, https://craigahobbs.github.io/python-build/pylintrc))


# Include python-build
include Makefile.tool


# The Roadie viewer project - its command line evaluates road plan models
VIEWER := ../viewer
VIEWER_BUILD := $(VIEWER)/build/npm.build
ROADIE := node $(VIEWER)/bin/roadie.js


clean:
	rm -rf Makefile.tool pylintrc __pycache__/


help:
	@echo "            [doc|evaluate|plan|update]"
	@echo ""
	@echo "  make plan FILE=<plan.png> [OUTPUT=<plan.json>]  Engineer road plan options from a topo map image (Claude Code)"
	@echo "  make update FILE=<plan.json>               Update a road plan model with review feedback (Claude Code)"
	@echo "    (plan and update accept MODEL=<model> [default: $(MODEL)] and EFFORT=<effort> [default: $(EFFORT)],"
	@echo "     OLLAMA=1 to launch Claude Code with an Ollama model - MODEL then names the Ollama model,"
	@echo "     and GROK=1 to launch the Grok CLI instead - MODEL then names the Grok model)"
	@echo "  make evaluate FILE=<plan.json> [DETAIL=1]  Print a road plan model's analysis and cost"
	@echo "  make doc                                   Print the road plan model documentation"


# Run the planning tools unit tests
test: $(DEFAULT_VENV_BUILD)
	$(DEFAULT_VENV_PYTHON) -m unittest -v test_plan_tools


# Run pylint on the planning tools
lint: $(DEFAULT_VENV_BUILD)
	$(DEFAULT_VENV_PYTHON) -m pylint -j 0 plan_tools.py


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

# The commands the agent session may run without asking - the planning tools, its own scripts, and the evaluator
AGENT_TOOLS = Bash($(DEFAULT_VENV_PYTHON) plan_tools.py *) Bash($(DEFAULT_VENV_PYTHON) $(1)/scripts/*) \
Bash(make evaluate *) Bash(make doc)

.PHONY: plan
plan: $(DEFAULT_VENV_BUILD) $(VIEWER_BUILD)
	@test -n "$(FILE)" || (echo 'usage: make plan FILE=<plan.png> [OUTPUT=<plan.json>] [MODEL=<model>] [EFFORT=<effort>] [OLLAMA=1|GROK=1]' && exit 1)
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	mkdir -p "$(PLAN_WORK)"
	$(AGENT) \
		--allowedTools "$(call AGENT_TOOLS,$(PLAN_WORK))" \
		--permission-mode acceptEdits \
		--effort "$(EFFORT)" \
		$(call AGENT_NAME,Roadie: $(notdir $(FILE))) \
		"Engineer cost-optimal road plan options for the topographic map image \"$(FILE)\" by following the \
instructions in PLAN.md exactly. Write the road plan model to \"$(PLAN_OUTPUT)\" and put intermediate \
work files in \"$(PLAN_WORK)/\". The Python tools are run with \"$(DEFAULT_VENV_PYTHON) plan_tools.py\"."


# Update an existing road plan model with review feedback (Claude Code or Grok) - the session asks for the feedback
UPDATE_WORK = $(basename $(FILE)).work

.PHONY: update
update: $(DEFAULT_VENV_BUILD) $(VIEWER_BUILD)
	@test -n "$(FILE)" || (echo 'usage: make update FILE=<plan.json> [MODEL=<model>] [EFFORT=<effort>] [OLLAMA=1|GROK=1]' && exit 1)
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	mkdir -p "$(UPDATE_WORK)"
	$(AGENT) \
		--allowedTools "$(call AGENT_TOOLS,$(UPDATE_WORK))" \
		--permission-mode acceptEdits \
		--effort "$(EFFORT)" \
		$(call AGENT_NAME,Roadie update: $(notdir $(FILE))) \
		"Update the road plan model \"$(FILE)\" with review feedback by following the \"Updating a plan\" \
instructions in PLAN.md exactly. Intermediate work files (including any from the original planning \
session) are in \"$(UPDATE_WORK)/\". The Python tools are run with \"$(DEFAULT_VENV_PYTHON) plan_tools.py\". \
Ask me for the review feedback first."


# Print a road plan model's analysis and cost (DETAIL=1 adds the station table)
.PHONY: evaluate
evaluate: $(VIEWER_BUILD)
	@test -n "$(FILE)" || (echo 'usage: make evaluate FILE=<plan.json> [DETAIL=1]' && exit 1)
	@$(ROADIE) evaluate "$(FILE)"$(if $(DETAIL), --detail)


# Print the road plan model documentation
.PHONY: doc
doc: $(VIEWER_BUILD)
	@$(ROADIE) doc


# View a road plan model in the browser (the Roadie viewer)
.PHONY: run
run:
	@$(MAKE) --no-print-directory -C $(VIEWER) run$(if $(FILE), FILE="$(abspath $(FILE))")


# Install the viewer's packages - its command line needs them
$(VIEWER_BUILD):
	@$(MAKE) --no-print-directory -C $(VIEWER) build/npm.build
