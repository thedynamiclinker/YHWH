# YHWH

Run `make` to build and open the default app. `make help` lists build,
interface, installation and test commands. Everything needed by the application
lives in [yhwh/](yhwh/README.md); the surrounding vault holds human work.

Write brief tasks in [COVENANT](COVENANT.md), then use:

```text
yhwh begin → yhwh review → yhwh run → yhwh add → yhwh commit
kanban        tmp/          run/       doc/imperative/   doc/declarative/ + Git
```

Humans approve instructions and accept results. An executable in `run/` also
works directly as an ordinary Bash script, with no automatic bookkeeping.
See [AGENTS.md](AGENTS.md) and [doc/README.md](doc/README.md).
