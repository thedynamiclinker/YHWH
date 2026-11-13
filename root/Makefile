.DEFAULT_GOAL := thwh

ROOT_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
APP_DIR := $(ROOT_DIR)/src
export YHWH_VAULT_ROOT := $(abspath $(ROOT_DIR)/..)
REVIEW_ROOT ?= $(abspath $(YHWH_VAULT_ROOT)/../EchoIQ)
THEME ?= yhwh
MODEL ?= qwen3:8b
export MODEL

.PHONY: help install thwh yhwh build-thwh build-yhwh run-thwh run-yhwh dawkins run-isolated reset guide test test-ui test-ui-headless package review-start review-status verify-migration nix-shell ollama-serve ollama-pull ollama-models

help: ## List commands and show how to get started
	@printf '\nmake -C root builds and opens THWH; make -C root yhwh opens the company app.\nBoth run from root/src; there is no frontend compilation step.\nStart practice needs no model or login. Requires Node.js >=22.12, npm, Git, Python 3, and a desktop display.\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z][a-zA-Z -]*:.*## / { printf "  make %-20s %s\n", $$1, $$2 }' "$(ROOT_DIR)/Makefile"
	@printf '\nOverrides: THEME=yhwh|nietzsche|dawkins, REVIEW_ROOT=/path/to/review,\nTHWH_DATA_DIR=/path/to/profile, YHWH_DATA_DIR=/path/to/profile,\nYHWH_ELECTRON=/path/to/electron, YHWH_CODEX=/path/to/codex, MODEL=qwen3:8b.\nCore tests bind port 11434; stop Ollama before make test.\nScreenshots: root/src/build/screenshots/. Packages: root/src/build/packages/.\n'

install: ## Install the locked development dependencies
	npm --prefix "$(APP_DIR)" ci

$(APP_DIR)/node_modules/.package-lock.json: $(APP_DIR)/package.json $(APP_DIR)/package-lock.json
	npm --prefix "$(APP_DIR)" ci

build-thwh build-yhwh: $(APP_DIR)/node_modules/.package-lock.json ## Prepare the shared locked dependencies

thwh: build-thwh ## Build and open THWH, the paired review app (default)
	$(MAKE) -C "$(ROOT_DIR)" run-thwh

yhwh: build-yhwh ## Build and open YHWH, the company rehearsal app
	$(MAKE) -C "$(ROOT_DIR)" run-yhwh

run-thwh: ## Open THWH without installing dependencies
	"$(APP_DIR)/bin/thwh" --theme "$(THEME)" --root "$(REVIEW_ROOT)"

run-yhwh: ## Open YHWH without installing dependencies
	npm --prefix "$(APP_DIR)" start -- --theme "$(THEME)"

dawkins: build-thwh ## Open THWH's monochrome desktop interface
	"$(APP_DIR)/bin/thwh" --theme dawkins --root "$(REVIEW_ROOT)"

run-isolated: build-yhwh ## Open YHWH with a fresh retained trial profile
	@profile=$$(mktemp -d /tmp/yhwh-trial.XXXXXX) || exit 1; \
	printf 'Trial data is retained at: %s\nResume with: YHWH_DATA_DIR="%s" make -C "$(ROOT_DIR)" yhwh\n' "$$profile" "$$profile"; \
	YHWH_DATA_DIR="$$profile" $(MAKE) -C "$(ROOT_DIR)" run-yhwh

reset: ## Reset tutorial and accepted review rounds, with backups (close the app first)
	python3 "$(APP_DIR)/scripts/reset-echoiq-review.py" --root "$(REVIEW_ROOT)"
	node "$(APP_DIR)/scripts/reset-tutorial.cjs"

guide: ## Read the usage guide and walkthrough
	@cat "$(APP_DIR)/README.md"

test: build-thwh ## Run core tests against temporary repositories
	npm --prefix "$(APP_DIR)" test

test-ui: build-thwh ## Run all four Electron UI workflows with temporary data
	npm --prefix "$(APP_DIR)" run test:ui

test-ui-headless: build-thwh ## Run the UI workflows under Xvfb
	xvfb-run -a npm --prefix "$(APP_DIR)" run test:ui

package: build-thwh ## Create a host-platform app in src/build/packages/
	npm --prefix "$(APP_DIR)" run package

review-start: ## Open the shared terminal review in REVIEW_ROOT
	"$(APP_DIR)/bin/review" --root "$(REVIEW_ROOT)" start

review-status: ## Show the paired review without accepting rounds
	"$(APP_DIR)/bin/review" --root "$(REVIEW_ROOT)" status

verify-migration: ## Verify the original source inventory and repository bundles
	python3 "$(APP_DIR)/scripts/verify-migration.py"

nix-shell: ## Enter the Nix development shell with native Electron
	nix-shell "$(APP_DIR)/shell.nix"

ollama-serve: ## Start the optional local AI server
	ollama serve

ollama-pull: ## Download MODEL for use in Settings
	ollama pull "$$MODEL"

ollama-models: ## List downloaded models
	ollama list
