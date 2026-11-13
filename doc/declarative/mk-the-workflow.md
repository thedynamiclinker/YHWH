# Executable English

Humans describe desired work briefly in COVENANT. Agents inspect the system,
generate implementation drafts and ask questions only where a human decision
matters. Humans review instructions before execution and inspect results before
acceptance. Execution success and human acceptance are distinct states.

The commands are `yhwh begin`, `yhwh review`, `yhwh run`, `yhwh add` and
`yhwh commit`. Their storage, recovery and naming conventions are defined in
[doc/README.md](../README.md). `tmp/` holds drafts, `run/` holds approved ordinary
Bash scripts, `doc/imperative/` preserves exact accepted instructions and
`doc/declarative/` describes verified resulting behavior. Direct script execution
has no automatic workflow effects.

Each task's coherent Git commit connects its implementation, imperative archive
and declarative properties. The commit message contains a new summary line and
the original English instruction, wrapped at 72 columns. Unrelated human work
is preserved. Failed and interrupted phases can be resumed without rerunning
successful executions or duplicating accepted history.
