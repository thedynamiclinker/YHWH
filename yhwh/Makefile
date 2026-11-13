.DEFAULT_GOAL := yhwh
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
WORKSPACE ?= $(CURDIR)
NODE ?= node
export YHWH_NODE := $(shell command -v $(NODE))
.PHONY: yhwh help deps build run develop install uninstall check test test-ui three three-build three-check obsidian obsidian-build obsidian-check obsidian-install company company-check clean package nix-shell
help:
	@cat "$(APP_DIR)/etc/make-help.txt"
node_modules/.package-lock.json: package.json package-lock.json
	npm ci --include=dev
	touch "$@"
deps: node_modules/.package-lock.json
build: deps
	$(NODE) bin/build.cjs

yhwh: deps
	$(NODE) bin/build.cjs default
	cd "$(WORKSPACE)" && "$(APP_DIR)/bin/yhwh" open default $(if $(THEME),--theme "$(THEME)",)
run:
	cd "$(WORKSPACE)" && "$(APP_DIR)/bin/yhwh" open default
develop install: build
	$(NODE) bin/prefix.cjs $@ $(if $(PREFIX),"$(PREFIX)",)
uninstall:
	$(NODE) bin/prefix.cjs uninstall $(if $(PREFIX),"$(PREFIX)",)
check: verify-deps
	$(NODE) bin/build.cjs
	$(MAKE) test
	$(NODE) bin/default/headless.cjs src/yhwh-default/test/ui.cjs src/yhwh-three/test/ui.cjs
test: verify-deps
	$(NODE) --test test/*.test.cjs
	$(NODE) --test src/yhwh-default/test/*.test.cjs
	$(NODE) --test src/yhwh-three/test/*.test.cjs
	npm --prefix src/yhwh-obsidian run check
	npm --prefix src/yhwh-obsidian test
	$(MAKE) company-check
test-ui: build
	$(NODE) src/yhwh-default/test/ui.cjs
	$(NODE) src/yhwh-three/test/ui.cjs
three-build: deps
	$(NODE) bin/build.cjs three
three: three-build
	cd "$(WORKSPACE)" && "$(APP_DIR)/bin/yhwh" open three $(if $(OPEN),"$(OPEN)",)
three-check: three-build
	$(NODE) --test src/yhwh-three/test/*.test.cjs
	$(NODE) bin/default/headless.cjs src/yhwh-three/test/ui.cjs
obsidian:
	./bin/yhwh-obsidian --help
obsidian-build: deps
	$(NODE) bin/build.cjs obsidian
obsidian-check: verify-deps
	npm --prefix src/yhwh-obsidian run check
	npm --prefix src/yhwh-obsidian test
obsidian-install: obsidian-build
	@test -n "$(VAULT)" || { printf '%s\n' 'Use VAULT=/path/to/vault'; exit 1; }
	cd "$(WORKSPACE)" && "$(APP_DIR)/bin/yhwh-obsidian" install "$(VAULT)"
company: deps
	$(NODE) bin/company/start.cjs
company-check: verify-deps
	npm --prefix src/company test
clean:
	$(NODE) -e 'require("node:fs").rmSync("var/tmp/yhwh",{recursive:true,force:true})'
package: build
	mkdir -p var/tmp/yhwh/packages
	npm pack --pack-destination var/tmp/yhwh/packages
nix-shell:
	nix-shell src/yhwh-default/shell.nix

.PHONY: verify-deps
verify-deps:
	@$(NODE) -e 'try { require.resolve("esbuild"); require.resolve("@inquirer/prompts"); } catch { console.error("Dependencies missing. Run make deps first."); process.exit(1); }'
