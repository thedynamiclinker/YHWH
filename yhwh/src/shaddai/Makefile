.DEFAULT_GOAL := run

PREFIX ?= $(HOME)/.local
PYTHON ?= python3
CFLAGS ?= -O2 -Wall -Wextra
TEST_PYTHON = $(or $(SHADDAI_PYTHON),$(wildcard .venv/bin/python),$(PYTHON))

bindir = $(DESTDIR)$(PREFIX)/bin
libdir = $(DESTDIR)$(PREFIX)/lib/shaddai/shaddai
libexecdir = $(DESTDIR)$(PREFIX)/libexec

.PHONY: run deps build check install clean

run:
	./bin/shaddai $(ARGS)

ifeq ($(SHADDAI_PYTHON),)
deps: .venv/.ready
endif

.venv/.ready: pyproject.toml
	$(PYTHON) -m venv --system-site-packages .venv
	.venv/bin/python -m pip install .
	touch "$@"

build: build/shaddai-console

build/shaddai-console: src/console.c
	mkdir -p build
	$(CC) $(CPPFLAGS) $(CFLAGS) $(LDFLAGS) -o $@ $< $(LDLIBS)

check: build
	SHADDAI_PYTHON="$(TEST_PYTHON)" ./bin/shaddai --doctor
	PYTHONPATH=src "$(TEST_PYTHON)" -m unittest discover -s tests -v

install: build
	install -d "$(bindir)" "$(libdir)/defaults" "$(libexecdir)"
	install -m 755 bin/shaddai bin/shaddai-fonts "$(bindir)"
	install -m 755 build/shaddai-console "$(libexecdir)"
	install -m 644 src/shaddai/*.py "$(libdir)"
	install -m 644 src/shaddai/defaults/config.toml "$(libdir)/defaults"

clean:
	rm -rf build
