.DEFAULT_GOAL := run
APP_DIR := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))/../..
.PHONY: run build test check install develop help
run:
	$(MAKE) -C "$(APP_DIR)" company
build test check install develop help:
	$(MAKE) -C "$(APP_DIR)" $@

.PHONY: run-thwh dawkins
run-thwh dawkins:
	"$(APP_DIR)/bin/company/thwh" --theme "$(if $(THEME),$(THEME),dawkins)" $(if $(REVIEW_ROOT),--root "$(REVIEW_ROOT)",)

run-yhwh:
	node "$(APP_DIR)/bin/company/start.cjs" --theme "$(THEME)"

reset:
	python3 "$(APP_DIR)/bin/company/reset-echoiq-review.py" --root "$(REVIEW_ROOT)"
	node "$(APP_DIR)/bin/company/reset-tutorial.cjs"
