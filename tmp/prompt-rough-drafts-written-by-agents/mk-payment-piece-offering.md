#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Payment: Piece Offering

Make Piece Offering a simple way to share a piece of something someone made with YHWH. Keep the spelling "Piece Offering". Read yhy/mk-yhwh.md and inspect the current file selection, local staging, and email behavior in yhwh/, yhwh-3d/, and yhwh-obsidian/ first.

Use the delivery method and destination approved by the humans. Start with the existing file picker and email path unless an upload destination has been supplied. Show the selected filename and explain the next action in plain language. The person chooses whether to send the file.

A mailto link cannot attach a local file portably, so tell the person to attach it themselves when that is the chosen path. Local staging is not delivery. If the approved path uses an upload, show the destination before sending and report the real result. Leave missing upload details visible rather than inventing a server or claiming a file was received.

Check choosing and canceling, missing or unreadable files, and failed delivery. Preserve the editable YHWH text. Document the resulting path and any setup the humans need to finish. Go.
EOF
