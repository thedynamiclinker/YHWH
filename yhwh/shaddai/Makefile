.DEFAULT_GOAL := run

PKG := shaddai
PREFIX ?= $(HOME)/.local
PYTHON ?= python3
CFLAGS ?= -O2 -Wall -Wextra
PIP = "$(PYTHON)" -m pip
TEST_PYTHON = $(or $(SHADDAI_PYTHON),$(wildcard .venv/bin/python),$(PYTHON))

bindir = $(DESTDIR)$(PREFIX)/bin
libdir = $(DESTDIR)$(PREFIX)/lib/shaddai/shaddai
libexecdir = $(DESTDIR)$(PREFIX)/libexec

.PHONY: run deps develop build check install clean dist twine push-test pull-test push-prod pull-prod

run:
	./bin/shaddai $(ARGS)

ifeq ($(SHADDAI_PYTHON),)
deps: .venv/.ready
endif

.venv/.ready: pyproject.toml README.md src/shaddai/__init__.py
	"$(PYTHON)" -m venv --system-site-packages .venv
	$(MAKE) develop PYTHON=.venv/bin/python
	touch "$@"

develop:
	$(PIP) install -e .

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
	ln -sf shaddai "$(bindir)/yhwh-tty"
	ln -sf shaddai "$(bindir)/el-shaddai"
	install -m 755 build/shaddai-console "$(libexecdir)"
	install -m 644 src/shaddai/*.py "$(libdir)"
	install -m 644 src/shaddai/defaults/config.toml "$(libdir)/defaults"

clean:
	rm -rf build dist

dist:
	$(PIP) install build
	rm -rf dist
	"$(PYTHON)" -m build

push-test: repository = testpypi
push-prod: repository = pypi
push-test push-prod: twine
	"$(PYTHON)" -m twine upload --repository $(repository) dist/*.whl dist/*.tar.gz

twine:
	$(PIP) install twine

pull-test:
	@set -e; \
	wheels=$$(mktemp -d); \
	trap 'rm -rf "$$wheels"' EXIT; \
	$(PIP) download --index-url https://test.pypi.org/simple/ --no-deps --only-binary=:all: --dest "$$wheels" $(PKG); \
	$(PIP) install "$$wheels"/*.whl

pull-prod:
	$(PIP) install --upgrade $(PKG)
