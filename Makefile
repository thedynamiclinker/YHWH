# Keep the application outside the Obsidian vault, with one build definition.
APP_DIR ?= /root/src/yhwh
export YHWH_VAULT_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
include $(APP_DIR)/Makefile
