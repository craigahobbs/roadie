# Roadie's top-level makefile - it delegates to the project's two subprojects:
#
#   viewer/  The Roadie viewer - a JavaScript web application (javascript-build)
#   plan/    The planning tools and instructions - JavaScript (javascript-build)

.DEFAULT_GOAL := help


# Delegate a target to a subproject - FILE and OUTPUT are relative to this directory. Other variables given on the
# command line (TEST, DETAIL, MODEL, EFFORT, PORT, ...) are passed along by make.
SUBMAKE = @$(MAKE) --no-print-directory -C $(1) $(2)$(if $(FILE), FILE="$(abspath $(FILE))")$(if $(OUTPUT), OUTPUT="$(abspath $(OUTPUT))")


.PHONY: help
help:
	@echo "usage: make [clean|commit|doc|evaluate|gh-pages|lint|plan|run|site|superclean|test|update]"
	@echo ""
	@echo "  make plan FILE=<plan>.site.json [OUTPUT=<plan.json>]  Engineer road plan options for a road site (Claude Code)"
	@echo "  make update FILE=<plan.json>               Update a road plan model with review feedback (Claude Code)"
	@echo "    (plan and update accept MODEL=<model> [default: opus] and EFFORT=<effort> [default: high],"
	@echo "     OLLAMA=1 to launch Claude Code with an Ollama model - MODEL then names the Ollama model,"
	@echo "     and GROK=1 to launch the Grok CLI instead - MODEL then names the Grok model)"
	@echo "  make run [FILE=<plan.json>]                View a road plan model in the browser"
	@echo "  make evaluate FILE=<plan.json> [DETAIL=1]  Print a road plan model's analysis and cost"
	@echo "  make doc                                   Print the road plan model documentation"
	@echo "  make commit                                Run the viewer's and the planning tools' tests and lint"
	@echo "  make site                                  Stage the project's web site (build/gh-pages/)"
	@echo "  make gh-pages                              Update the project's gh-pages branch checkout (../roadie.gh-pages)"


# The pre-commit gate, and its parts - the viewer's (tests, lint, documentation, and 100% coverage) and the planning
# tools' (tests and lint)
.PHONY: commit test lint
commit test lint:
	$(call SUBMAKE,viewer,$@)
	$(call SUBMAKE,plan,$@)


# View a road plan model in the browser (the viewer)
.PHONY: run
run:
	$(call SUBMAKE,viewer,$@)


# Engineer road plan options for a road site (a road site model - the road's start and end points and its planning
# notes), and update an existing road plan model with review feedback (Claude Code or Grok) - see plan/Makefile and
# plan/PLAN.md
.PHONY: plan update
plan update:
	$(call SUBMAKE,plan,$@)


# Print a road plan model's analysis and cost (DETAIL=1 adds the station table)
.PHONY: evaluate
evaluate:
	$(call SUBMAKE,plan,$@)


# Print the road plan model documentation
.PHONY: doc
doc:
	@$(MAKE) -s --no-print-directory -C viewer build/npm.build
	@node viewer/bin/roadie.js doc


# Stage the project's web site - the documentation at its root (index.html renders README.md), the planning
# instructions, the example plan, and the viewer application (and its README) in viewer/. The site's READMEs link to
# the other Markdown documents as rendered Markdown ("#url=plan/PLAN.md&<header ID>"), not to the Markdown files.
SITE_LINKS := sed -E 's/\]\(([^):\#]*\.md)\#([^)]*)\)/](\#url=\1\&\2)/g; s/\]\(([^):\#]*\.md)\)/](\#url=\1)/g'

.PHONY: site
site:
	$(call SUBMAKE,viewer,app)
	rm -rf build/gh-pages/
	mkdir -p build/gh-pages/example/ build/gh-pages/plan/
	cp index.html build/gh-pages/
	$(SITE_LINKS) README.md > build/gh-pages/README.md
	cp example/example.json example/example.png example/screenshot.png build/gh-pages/example/
	cp plan/PLAN.md build/gh-pages/plan/
	cp -R viewer/build/app build/gh-pages/viewer
	$(SITE_LINKS) viewer/README.md > build/gh-pages/viewer/README.md


# Update the project's gh-pages branch checkout (../roadie.gh-pages) with the web site - commit and push it to publish.
# The site is staged after the pre-commit gate (not with it, under "make -j") - both stage the viewer application.
.PHONY: gh-pages
gh-pages: commit
	@$(MAKE) --no-print-directory site
	if [ ! -d ../$(notdir $(CURDIR)).gh-pages ]; then git clone -b gh-pages `git config --get remote.origin.url` ../$(notdir $(CURDIR)).gh-pages; fi
	cd ../$(notdir $(CURDIR)).gh-pages && git pull
	rsync -rv --delete --exclude=.git/ build/gh-pages/ ../$(notdir $(CURDIR)).gh-pages
	touch ../$(notdir $(CURDIR)).gh-pages/.nojekyll


# Remove the build directories
.PHONY: clean superclean
clean superclean:
	$(call SUBMAKE,viewer,$@)
	$(call SUBMAKE,plan,$@)
	rm -rf build/
