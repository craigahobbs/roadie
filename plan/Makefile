# Download javascript-build
JAVASCRIPT_BUILD_DIR ?= ../../javascript-build
define WGET
ifeq '$$(wildcard $(notdir $(1)))' ''
$$(info Downloading $(notdir $(1)))
$$(shell [ -f $(JAVASCRIPT_BUILD_DIR)/$(notdir $(1)) ] && cp $(JAVASCRIPT_BUILD_DIR)/$(notdir $(1)) . || $(call WGET_CMD, $(1)))
endif
endef
WGET_CMD = if command -v wget >/dev/null 2>&1; then wget -q -c $(1); else curl -f -Os $(1); fi
$(eval $(call WGET, https://craigahobbs.github.io/javascript-build/Makefile.base))
$(eval $(call WGET, https://craigahobbs.github.io/javascript-build/jsdoc.json))
$(eval $(call WGET, https://craigahobbs.github.io/javascript-build/eslint.config.js))


# The planning tools aren't published
GHPAGES_SRC :=


# Lint the command line, too. The coordinate names "x", "y", and "z" are allowed - they're the model's.
ESLINT_ARGS := --rule '{"id-length": ["error", {"exceptions": ["x", "y", "z"]}]}' bin/ lib/ test/


# The planning tools' modules are covered - the viewer's modules they use are covered by the viewer's tests
C8_ARGS := --100 --all --src lib/ --src test/


# Include javascript-build
JSDOC_ARGS := -c jsdoc.json -r README.md lib/
include Makefile.base


# The Roadie viewer project - the planning tools use its road plan model
VIEWER := ../viewer
VIEWER_BUILD := $(VIEWER)/build/npm.build


ROADIE := node $(VIEWER)/bin/roadie.js


clean:
	rm -rf Makefile.base jsdoc.json eslint.config.js


help:
	@echo "            [evaluate|plan|run|update]"
	@echo ""
	@echo "  make plan FILE=<plan>.site.json [OUTPUT=<plan.json>]  Engineer road plan options for a road site (Claude Code)"
	@echo "  make update FILE=<plan.json>               Update a road plan model with review feedback (Claude Code)"
	@echo "    (plan and update accept MODEL=<model> [default: $(MODEL)] and EFFORT=<effort> [default: $(EFFORT)],"
	@echo "     OLLAMA=1 to launch Claude Code with an Ollama model - MODEL then names the Ollama model,"
	@echo "     and GROK=1 to launch the Grok CLI instead - MODEL then names the Grok model)"
	@echo "  make evaluate FILE=<plan.json> [DETAIL=1]  Print a road plan model's analysis and cost"
	@echo "  make run [FILE=<plan.json>]                View a road plan model in the browser (the Roadie viewer)"


# The planning tools' tests need the viewer's packages
build/npm.build: $(VIEWER_BUILD)

$(VIEWER_BUILD):
	@$(MAKE) --no-print-directory -C $(VIEWER) build/npm.build


# Engineer road plan options for a road site - launches Claude Code (or Grok) with the planning instructions
# (PLAN.md). FILE is the road site model ("<plan>.site.json"). Outputs OUTPUT (default is "<plan>.json");
# intermediate work files go in the output's ".work/" directory (e.g., "<plan>.work/").
PLAN_OUTPUT = $(if $(OUTPUT),$(OUTPUT),$(patsubst %.site,%,$(basename $(FILE))).json)
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

# The planning tools' command - its full path, so the agent session can run it from any directory
PLAN_TOOL = node $(CURDIR)/bin/plan.js

# The commands the agent session may run without asking - the planning tools, its own scripts, and the evaluator
AGENT_TOOLS = Bash($(PLAN_TOOL) *) Bash(node bin/plan.js *) Bash(node $(1)/scripts/*) Bash(make evaluate *)

# The agent session's tools - the planning tools' command line, and the modules its scripts may import
AGENT_PROMPT = The planning tools' command (\"plan.js\" in PLAN.md) is \"$(PLAN_TOOL)\" - run it as it is, from any \
directory. Their modules are in \"$(CURDIR)/lib/\", and the viewer's are in \"$(abspath $(VIEWER))/lib/\".

.PHONY: plan
plan: build/npm.build
	@test -n "$(FILE)" || (echo 'usage: make plan FILE=<plan>.site.json [OUTPUT=<plan.json>] [MODEL=<model>] [EFFORT=<effort>] [OLLAMA=1|GROK=1]' && exit 1)
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	@test "$(PLAN_OUTPUT)" != "$(FILE)" || (echo 'error: "$(FILE)" is not a road site model file ("<plan>.site.json") - use OUTPUT to name the road plan model' && exit 1)
	mkdir -p "$(PLAN_WORK)"
	$(AGENT) \
		--allowedTools "$(call AGENT_TOOLS,$(PLAN_WORK))" \
		--permission-mode acceptEdits \
		--effort "$(EFFORT)" \
		$(call AGENT_NAME,Roadie: $(notdir $(FILE))) \
		"Engineer cost-optimal road plan options for the road site \"$(FILE)\" by following the instructions in \
PLAN.md exactly. Write the road plan model to \"$(PLAN_OUTPUT)\" and put intermediate work files in \
\"$(PLAN_WORK)/\". $(AGENT_PROMPT)"


# Update an existing road plan model with review feedback (Claude Code or Grok) - the session asks for the feedback
UPDATE_WORK = $(basename $(FILE)).work

.PHONY: update
update: build/npm.build
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
session) are in \"$(UPDATE_WORK)/\". $(AGENT_PROMPT) Ask me for the review feedback first."


# Print a road plan model's analysis and cost (DETAIL=1 adds the station table)
.PHONY: evaluate
evaluate: $(VIEWER_BUILD)
	@test -n "$(FILE)" || (echo 'usage: make evaluate FILE=<plan.json> [DETAIL=1]' && exit 1)
	@$(ROADIE) evaluate "$(FILE)"$(if $(DETAIL), --detail)


# View a road plan model in the browser (the Roadie viewer)
.PHONY: run
run:
	@$(MAKE) --no-print-directory -C $(VIEWER) run$(if $(FILE), FILE="$(abspath $(FILE))")
