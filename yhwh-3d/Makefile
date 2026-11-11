.DEFAULT_GOAL := run
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
LAUNCHER_DIR := $(abspath $(APP_DIR)/../bin)
export PATH := $(LAUNCHER_DIR):$(PATH)
.PHONY: help deps build install run yhwh-3d test test-ui check config guide
help: ## Show commands and keyboard shortcuts
	@printf '\nYHWH 3D — a spatial filesystem, editor and real shell.\n\n'
	@awk 'BEGIN { FS = ":.*## " } /^[a-zA-Z][a-zA-Z0-9_ -]*:.*## / { printf "  make %-15s %s\n", $$1, $$2 }' "$(APP_DIR)/Makefile"
	@printf '\nNode >=22.12, npm, Python 3, Bash, file, and Electron. On NixOS the launcher obtains native Electron.\nOpen: ../bin/yhwh-3d [path]   or   yhwh 3d [path] when the default app is installed.\nCtrl+E Files · Ctrl+D focus Files · Ctrl+B shell · Ctrl+T focus tab\nAlt+Up parent · Ctrl+P commands · Ctrl+S save · Ctrl+Shift+V pretty\nConfig: /etc/yhwh, XDG_CONFIG_HOME/yhwh, ~/config/yhwh, ancestor .yhwh directories.\nEach layer applies rc then rc.3d in the same Bash session. See README.md.\n'
deps: node_modules/.package-lock.json
node_modules/.package-lock.json: package.json package-lock.json
	npm --prefix "$(APP_DIR)" ci --no-audit --no-fund
build: deps ## Bundle the offline WebGL scene, editor and terminal
	npm --prefix "$(APP_DIR)" run build
install: build ## Install ../bin/yhwh-3d and a non-overwriting ~/config/yhwh/rc.3d
	node "$(APP_DIR)/scripts/install.cjs"
run yhwh-3d: install ## Build and open the app with the yhwh-3d command (default)
	yhwh-3d $(if $(OPEN),"$(OPEN)",)
test: deps ## Test config, filesystem and PTY behavior in temporary directories
	npm --prefix "$(APP_DIR)" test
test-ui: build ## Run the real Electron + WebGL workflow and save screenshots
	npm --prefix "$(APP_DIR)" run test:ui
check: test test-ui ## Run all behavior checks
guide: ## Read the app, configuration and plugin documentation
	@cat "$(APP_DIR)/README.md"
config: ## Print the sample 3D configuration
	@cat "$(APP_DIR)/config/rc.3d"
