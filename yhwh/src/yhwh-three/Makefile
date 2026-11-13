.DEFAULT_GOAL := run
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))/../..
.PHONY: run build test check install develop help
run:
	$(MAKE) -C "$(APP_DIR)" three
build test check install develop help:
	$(MAKE) -C "$(APP_DIR)" $@
