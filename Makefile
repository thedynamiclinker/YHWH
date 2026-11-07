.DEFAULT_GOAL := help

MODEL ?= qwen3:8b
export MODEL
REVIEW_ROOT ?= $(CURDIR)

.PHONY: help install run run-isolated guide test test-ui test-ui-headless package nix-shell ollama-serve ollama-pull ollama-models review-start review-status

help: ## List commands and show how to get started (default)
	@printf '\nYHWH — Electron desktop app\n\nFirst run: make install, codex login, then make run\nRequires Node.js >=22.12, npm, Git, Python 3 for code review, and a desktop display.\nCodex is the default AI engine: xhigh reasoning, full access, no approval prompts.\nOllama and scripted offline rehearsal remain available in Settings.\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z][a-zA-Z-]*:.*## / { printf "  make %-20s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf '\nIn the app: companies, proposals, Git import, patch/hunk editing, company\nreviews, feedback, handoff revisions, approvals, Kanbun tasks, chat, exports,\nand the shared CLI/desktop paired code review. Choose Code review in the sidebar.\nSee make guide for the complete walkthrough, shortcuts, data locations,\nsource map, and limitations. Use View > Toggle Developer Tools to inspect the UI.\n\nOverrides (also work with make run):\n  YHWH_DATA_DIR=/absolute/path  Separate persistent data profile\n  YHWH_ELECTRON=/path/to/electron  Native Electron runtime\n  YHWH_CODEX=/path/to/codex    Codex CLI executable (default: codex on PATH)\n  MODEL=qwen3:8b               Model for make ollama-pull\n\nCore tests bind port 11434; stop Ollama before make test.\nUI tests save screenshots in artifacts/. Packaging writes to dist/.\n'

install: ## Install the exact locked development dependencies (requires network)
	npm ci

run: ## Launch the app; first launch creates a demo company and Git proposals
	npm start

run-isolated: ## Launch a fresh trial profile in /tmp; print its retained data location
	@profile=$$(mktemp -d /tmp/yhwh-trial.XXXXXX) || exit 1; \
	printf 'Trial data is retained at: %s\nResume with: YHWH_DATA_DIR="%s" make run\n' "$$profile" "$$profile"; \
	YHWH_DATA_DIR="$$profile" npm start

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
