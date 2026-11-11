.DEFAULT_GOAL := yhwh
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PREFIX ?= $(abspath $(APP_DIR)/..)
THEME ?=
NODE ?= node
export YHWH_NODE := $(shell command -v $(NODE))

.PHONY: help deps build install yhwh run dawkins nietzsche test test-ui test-ui-headless check guide package nix-shell clean
help: ## Show the app's commands, setup, and configuration
	@printf '\nYHWH — files, a shell, and somewhere to think.\n\nmake builds and opens the app through ./bin/yhwh.\nRequires Node >=22.12, npm, Bash for rc files, and a desktop.\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z][a-zA-Z-]*:.*## / { printf "  make %-19s %s\n", $$1, $$2 }' "$(APP_DIR)/Makefile"
	@printf '\nConfig (all optional): /etc/yhwh/rc → ~/.config/yhwh/rc → ancestor .yhwh/rc\nCLI: ./bin/yhwh help. No vault. No per-directory state.\nOverrides: THEME=yhwh|nietzsche|dawkins, PREFIX=/install/prefix,\nYHWH_ELECTRON=/native/electron, YHWH_CONFIG_HOME=/config, YHWH_DATA_DIR=/state.\nScreenshots: build/screenshots/. Guide: README.md.\n\n'
node_modules/.package-lock.json: package.json package-lock.json
	npm ci --include=dev

deps: node_modules/.package-lock.json ## Install the locked dependencies
build: deps ## Build the editor and terminal UI
	npm run build
install: build ## Install ../bin/yhwh and shell completions (override PREFIX)
	$(NODE) scripts/install.cjs "$(PREFIX)/bin"
yhwh: build ## Build and open YHWH (default)
	./bin/yhwh $(if $(THEME),--theme "$(THEME)",)
run: ## Open the built app through yhwh
	./bin/yhwh

dawkins: build ## Open the monochrome Dawkins interface
	./bin/yhwh --theme dawkins
nietzsche: build ## Open Nietzsche mode
	./bin/yhwh --theme nietzsche

test: deps ## Test configuration, filesystem, CLI, and real shell behavior
	npm test
test-ui: build ## Test the Electron UI with temporary files and settings
	npm run test:ui
test-ui-headless: build ## Run the Electron UI tests with a temporary X display
	$(NODE) scripts/headless.cjs test/ui.cjs
check: test test-ui-headless ## Run all automated checks
guide: ## Read the full guide
	@cat README.md
package: build ## Package the desktop app for this operating system
	npm run package
nix-shell: ## Enter a Nix shell with native Electron and build tools
	nix-shell shell.nix
clean: ## Remove generated UI and packages
	rm -rf build
