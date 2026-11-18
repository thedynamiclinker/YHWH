.DEFAULT_GOAL := yhwh
WORKSPACE ?= $(CURDIR)
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))/yhwh
TARGETS := yhwh help deps build run tty tty-deps tty-build tty-check develop install uninstall check test test-ui three three-build three-check obsidian obsidian-build obsidian-check obsidian-install company company-check clean package nix-shell mobile-build mobile-sync mobile-check android android-apk android-run ios
.PHONY: $(TARGETS)
$(TARGETS):
	$(MAKE) -C "$(APP_DIR)" WORKSPACE="$(WORKSPACE)" $@
