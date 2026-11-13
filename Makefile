.DEFAULT_GOAL := yhwh
VAULT ?=

.PHONY: help yhwh build run install test test-ui check 3d 3d-build 3d-install 3d-check obsidian obsidian-deps obsidian-build obsidian-install obsidian-check

help: ## Show commands, requirements, and useful overrides
	@printf '\nYHWH — run these commands from the project directory.\nPlain make builds the default app and opens it in the current directory.\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z0-9][a-zA-Z0-9-]*:.*## / { printf "  make %-19s %s\n", $$1, $$2 }' Makefile
	@printf '\nRequirements: Make, Node >=22.12, npm, and Bash. Opening apps needs a desktop.\nThe default app may need Python 3 and a C++ toolchain to build node-pty.\nmake check includes UI tests on Xvfb; install Xvfb first.\n3D also needs Python 3 and file; 3d-check needs a working display (or Xvfb).\nThe plugin runs inside Obsidian; obsidian-check needs no desktop.\n\n'
	@printf 'Useful overrides (passed to the existing app commands):\n  make THEME=dawkins              Choose yhwh, nietzsche, or dawkins\n  make install PREFIX=/somewhere  Install bin/yhwh and completions there\n  make 3d OPEN="/path/to/files"    Start the 3D app at a path\n  make obsidian-install VAULT="/path/to/vault"\n  YHWH_ELECTRON=/path/to/electron make  Use a native Electron runtime\n  YHWH_DATA_DIR=/path/to/state make     Use a separate default-app profile\n  YHWH_3D_DATA_DIR=/path/to/state make 3d  Use a separate 3D profile\nOn NixOS: make -C yhwh nix-shell supplies native Electron and build tools.\n\n'
	@printf 'Full commands and guides: make -C yhwh help; make -C yhwh-3d help;\n  bin/yhwh-obsidian help; README.md.\nPlugin packaging and publication stay in bin/yhwh-obsidian.\nOlder shared source and review apps: make -C root help (root/src).\n\n'

yhwh: ## Build and open the default YHWH app (also plain make)
build: ## Build the default app without opening it
run: ## Open the already-built default app
install: ## Build and install bin/yhwh and shell completions
test: ## Run the default app's core tests
test-ui: ## Build and test the default app on your desktop
check: ## Run the default app's core and headless UI checks
yhwh:
	$(MAKE) -C yhwh build
	./bin/yhwh $(if $(THEME),--theme "$(THEME)",)
run:
	./bin/yhwh
build install test test-ui check:
	$(MAKE) -C yhwh $@

3d: ## Build, install, and open YHWH 3D
	$(MAKE) -C yhwh-3d run
3d-build: ## Build YHWH 3D without opening or installing it
	$(MAKE) -C yhwh-3d build
3d-install: ## Build and install bin/yhwh-3d and a missing sample rc.3d
	$(MAKE) -C yhwh-3d install
3d-check: ## Run the 3D app's core and Electron/WebGL UI checks
	$(MAKE) -C yhwh-3d check

obsidian: ## Show the Obsidian plugin CLI's commands and options
	./bin/yhwh-obsidian help
obsidian-deps: yhwh-obsidian/node_modules/.package-lock.json ## Install the plugin's locked development dependencies
yhwh-obsidian/node_modules/.package-lock.json: yhwh-obsidian/package.json yhwh-obsidian/package-lock.json
	npm --prefix yhwh-obsidian ci
obsidian-build: obsidian-deps ## Build the Obsidian plugin
	./bin/yhwh-obsidian build
obsidian-install: ## Install the plugin into VAULT; enable it in Obsidian afterwards
	@test -n "$(VAULT)" || { printf '%s\n' 'Use make obsidian-install VAULT="/path/to/vault"'; exit 1; }
	./bin/yhwh-obsidian install "$(VAULT)"
obsidian-check: obsidian-deps ## Type-check and test the Obsidian plugin
	./bin/yhwh-obsidian check
