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


# The application is published by the project's top-level makefile
GHPAGES_SRC :=


# Lint the command line and the tools, too. The coordinate names "x", "y", and "z" are allowed - they're the model's.
ESLINT_ARGS := --rule '{"id-length": ["error", {"exceptions": ["x", "y", "z"]}]}' bin/ lib/ test/ tools/


# Include javascript-build
USE_JSDOM := 1
include Makefile.base


# The local web server port
PORT ?= 8080

# The road plans for the canvas check
PLANS ?= ../example/example.json


clean:
	rm -rf Makefile.base jsdoc.json eslint.config.js


help:
	@echo '            [app|check|run]'
	@echo ''
	@echo '  make run [FILE=<plan.json>]    View a road plan in the browser'
	@echo '  make app                       Stage the application (build/app/)'
	@echo '  make check [PLANS="..."]       Check the canvas 3D drawings against the SVG drawing'


# Stage the application - the page, its stylesheet, its source modules, and the schema-markdown package's (the page's
# import map resolves "schema-markdown/" there). The command line module isn't part of the application.
.PHONY: app
commit: app
app: build/npm.build
	rm -rf build/app/
	mkdir -p build/app/schema-markdown/
	cp -R index.html app.css lib build/app/
	rm build/app/lib/cli.js
	cp -R node_modules/schema-markdown/lib build/app/schema-markdown/


# View a road plan in the browser - the plan's directory is linked into the served directory so the plan (and its map
# image) can be fetched
.PHONY: run
run: app
	rm -rf build/run/
	mkdir -p build/run/
	cp -R build/app/. build/run/
ifeq ($(FILE),)
	(sleep 1 && open "http://127.0.0.1:$(PORT)/") &
else
	@test -f "$(FILE)" || (echo 'error: "$(FILE)" does not exist' && exit 1)
	ln -s "$(abspath $(dir $(FILE)))" build/run/plan
	(sleep 1 && open "http://127.0.0.1:$(PORT)/#var.vFile='plan%2F$(notdir $(FILE))'") &
endif
	node tools/serve.js build/run $(PORT)


# Check the canvas 3D drawings' operations (the explorer's and the report's) against the SVG drawing
.PHONY: check
check:
	node tools/checkCanvas.js $(PLANS)

