.DEFAULT_GOAL := thwh

MODEL ?= qwen3:8b
export MODEL
REVIEW_ROOT ?= $(CURDIR)
THEME ?= yhwh

.PHONY: help install thwh yhwh build-thwh build-yhwh run-thwh run-yhwh dawkins run-isolated guide test test-ui test-ui-headless package nix-shell ollama-serve ollama-pull ollama-models review-start review-status

help: ## List commands and show how to get started
	@printf '\nTHWH / YHWH — review and rehearsal apps\n\nmake (or make thwh) builds and runs the paired review app.\nmake yhwh builds and runs the company rehearsal; choose Start offline walkthrough.\nThe sample walkthrough needs no account or model login.\nRequires Node.js >=22.12, npm, Git, Python 3 for code review, and a desktop display.\nCodex is the default AI engine: xhigh reasoning, full access, no approval prompts.\nRun codex login before using that engine. Ollama and scripted offline rehearsal remain available in Settings.\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z][a-zA-Z-]*:.*## / { printf "  make %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\nUse make build-thwh / build-yhwh to prepare dependencies without launching,\nand make run-thwh / run-yhwh to launch without building. Both apps run from\nsource; there is no frontend compilation step.\nSee make guide for the complete walkthrough, shortcuts, data locations,\nsource map, and limitations. Use View > Toggle Developer Tools to inspect the UI.\n\nOverrides:\n  THWH_DATA_DIR=/absolute/path  Separate THWH data profile\n  YHWH_DATA_DIR=/absolute/path  Separate YHWH data profile\n  THEME=yhwh|nietzsche|dawkins   THWH interface level (default: yhwh)\n  REVIEW_ROOT=/path/to/review    THWH workspace (default: current directory)\n  YHWH_ELECTRON=/path/to/electron  Native Electron runtime\n  YHWH_CODEX=/path/to/codex    Codex CLI executable (default: codex on PATH)\n  MODEL=qwen3:8b               Model for make ollama-pull\n\nCore tests bind port 11434; stop Ollama before make test.\nUI tests save screenshots in artifacts/. Packaging writes to dist/.\n'

install: ## Install the exact locked development dependencies (requires network)
	npm ci

node_modules/.package-lock.json: package.json package-lock.json
	npm ci

build-thwh: node_modules/.package-lock.json ## Prepare THWH's locked dependencies

build-yhwh: node_modules/.package-lock.json ## Prepare YHWH's locked dependencies

thwh: build-thwh ## Build and run THWH, the paired review app (default)
	$(MAKE) run-thwh

yhwh: build-yhwh ## Build and run YHWH, the company rehearsal app
	$(MAKE) run-yhwh

run-thwh: ## Run THWH (THEME=yhwh|nietzsche|dawkins) without building
	./thwh --theme "$(THEME)" --root "$(REVIEW_ROOT)"

run-yhwh: ## Run YHWH without building
	npm start

dawkins: ## Open THWH's real ncurses interface in this terminal
	./thwh --theme dawkins --root "$(REVIEW_ROOT)"

run-isolated: build-yhwh ## Build and run YHWH with a fresh retained trial profile in /tmp
	@profile=$$(mktemp -d /tmp/yhwh-trial.XXXXXX) || exit 1; \
	printf 'Trial data is retained at: %s\nResume with: YHWH_DATA_DIR="%s" make yhwh\n' "$$profile" "$$profile"; \
	YHWH_DATA_DIR="$$profile" $(MAKE) run-yhwh

guide: ## Read the full usage guide, feature walkthrough, and code map
	@cat README.md

test: ## Run core tests using temporary Git repositories (port 11434 must be free)
	npm test

test-ui: ## Exercise the full Electron UI with temporary data; requires a display
	npm run test:ui

test-ui-headless: ## Run the UI workflow on Linux using Xvfb (install Xvfb separately)
	xvfb-run -a npm run test:ui

package: ## Create a host-platform app in dist/; replaces that platform's prior build
	npm run package

review-start: ## Open the shared hunk review in a terminal; REVIEW_ROOT defaults to the current directory
	./review --root "$(REVIEW_ROOT)" start

review-status: ## Show the existing paired review sequence without accepting rounds
	./review --root "$(REVIEW_ROOT)" status

nix-shell: ## Enter the provided Nix development shell with native Electron
	nix-shell shell.nix

ollama-serve: ## Start optional local AI server in this terminal (requires Ollama)
	ollama serve

ollama-pull: ## Download MODEL; then select Local model / Ollama and its name in Settings
	ollama pull "$$MODEL"

ollama-models: ## List downloaded models to choose from in the app's Settings
	ollama list
