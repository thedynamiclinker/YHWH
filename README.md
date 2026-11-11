## The Root

Filesystem Hierarchy Standard.

The `doc` directory contains
- `imperative`: the `mk-*` prompts used to generate what we have so far.
- `declarative`: the invariants that should be true and remain true.

The `tmp` directory is where agent generated prompts (executable documentation) temporarily live while they wait for a human to review them and move them to `run`.

The `run` directory contains prompts approved by a human, which can be run now or are currently running.

