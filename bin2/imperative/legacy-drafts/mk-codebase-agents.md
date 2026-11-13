#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Codebase: Top level AGENTS.md

Make the top-level AGENTS.md useful to someone working on YHWH for the first time. Read its existing instructions and inspect the repository before editing it. Preserve the engineering goal: the repository should become easier to understand as it grows.

Explain the small set of facts an agent needs: what yhwh/, yhwh-three/, yhwh-obsidian/, root/, bin/, yhy/, yamr/, and אמר/ are for; where the real build and check commands live; and how COVENANT.md and Todo.md guide the human review of prompts. Use the workflow described in yhy/mk-the-workflow.md. Distinguish intended app behavior in yhy/ from behavior verified in code.

The existing top-level AGENTS.md is a symlink to shared instructions. Inspect the link before changing it. Keep changes within this repository: if a local file is needed, replace only the local symlink and retain the applicable shared guidance, rather than writing through it into another project. Keep the existing principles without duplicating them in several places.

Keep the guidance short where possible and grounded in commands and paths that exist. Check every path and command you mention. Do not implement the other COVENANT tasks as part of writing these instructions. Go.
EOF
