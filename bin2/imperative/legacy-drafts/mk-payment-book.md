#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Payment: Book

Give people a simple way to buy Genesis by The Nameless from YHWH. Read yhy/mk-yhwh.md and inspect the existing About YHWH book link in yhwh/, yhwh-three/, and yhwh-obsidian/ first.

Start with the existing Amazon book link. Make the purchase action easy to find, name the book clearly, and tell people that the button opens the shop. Keep the destination in one place within each app rather than copying it into several actions. Preserve the editable YHWH text.

Use the book and seller details approved by the humans. Do not invent a price or a new checkout business. If the approved destination is missing, make that visible in the setup instructions.

Check that the action opens the intended destination in each supported interface, and that the ordinary About and Help actions still work. Update the relevant documentation with any setup the humans need to finish. Go.
EOF
