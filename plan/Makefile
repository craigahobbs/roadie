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


clean:
	rm -rf Makefile.base jsdoc.json eslint.config.js


# The planning tools' tests need the viewer's packages
build/npm.build: $(VIEWER_BUILD)

$(VIEWER_BUILD):
	$(MAKE) -C $(VIEWER) build/npm.build
