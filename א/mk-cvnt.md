#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Needs Prompt: Cvnt (YHWH's Dating App)

Work out a small, clear product prompt for Cvnt, YHWH's dating app. Read the existing YHWH character and app descriptions in yhy/ and the dating-app references in this repository first. Keep the name Cvnt and the YHWH voice.

Describe who it is for, what a person does first, how people find each other, how they choose to connect, and the smallest useful first version. Identify the decisions the humans still need to make, including the audience, profile information, matching, contact, privacy, blocking and reporting, and whether payment belongs in the first version. Mark proposals as proposals; do not invent settled product decisions.

Turn that understanding into a plain-language lordhavemercy -f heredoc prompt in אמר/mk-cvnt-app.md for human review. Make its scope and completion checks concrete. Link it from the Cvnt card on COVENANT.md, and leave it awaiting review under the workflow in yhy/mk-the-workflow.md.

This task produces the next prompt. Building or launching the dating app follows approval of that prompt. Go.
EOF
