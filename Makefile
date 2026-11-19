.DEFAULT_GOAL := yhwh
WORKSPACE ?= $(CURDIR)
REPO_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
APP_DIR := $(REPO_DIR)/yhwh
SHADDAI_DIR := $(APP_DIR)/shaddai
TARGETS := yhwh deps build run develop install uninstall check test test-ui three three-build three-check obsidian obsidian-build obsidian-check obsidian-install company company-check clean package nix-shell mobile-build mobile-sync mobile-check android android-apk android-run ios
.PHONY: $(TARGETS) help tty tty-deps tty-build tty-check
$(TARGETS):
	$(MAKE) -C "$(APP_DIR)" WORKSPACE="$(WORKSPACE)" $@

help:
	@$(MAKE) --no-print-directory -C "$(APP_DIR)" help
	@printf '%s\n' '' 'make tty             Open Shaddai in a terminal (OPEN=PATH)' \
	    'make tty-deps        Set up the Shaddai Python environment' \
	    'make tty-build       Build the Shaddai console diagnostic' \
	    'make tty-check       Test Shaddai in a PTY'

tty-deps:
	$(MAKE) -C "$(SHADDAI_DIR)" deps

tty-build: tty-deps
	$(MAKE) -C "$(SHADDAI_DIR)" build

tty: tty-deps
	cd "$(WORKSPACE)" && \
	    YHWH_HOME="$${YHWH_HOME:-$(REPO_DIR)}" PATH="$(APP_DIR)/bin:$$PATH" \
	    "$(SHADDAI_DIR)/bin/shaddai" $(if $(OPEN),-- "$(OPEN)")

tty-check: tty-deps
	$(MAKE) -C "$(SHADDAI_DIR)" check
