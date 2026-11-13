#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Codebase: Top level Makefile

Give this project a simple top-level Makefile. Read AGENTS.md, yhy/, and the existing Makefiles, package scripts, and launchers in yhwh/, yhwh-three/, yhwh-obsidian/, root/, and bin/ before choosing the targets.

Make the root directory the obvious place to build and open the default YHWH app and to find the commands for the other app and the Obsidian plugin. Plain make should build and open the default app through its existing launcher. make help should explain the available commands, requirements, and useful overrides in simple language.

Delegate to the commands that already own building, running, installing, and checking each app. Add only targets that correspond to real capabilities. Preserve each app's own commands. Keep root/ recognizable as the older shared source rather than accidentally making it the default app again.

Use make -n to inspect delegated commands before running them. Run the relevant existing checks for the targets you change and verify that make help is useful from a fresh shell. Update the relevant documentation. Keep this small. Go.
EOF
