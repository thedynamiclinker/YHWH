#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Payment: Burnt Offering

Make Burnt Offering a simple way to give money to support YHWH. Read the Offerings section in yhy/mk-yhwh.md and inspect the existing donation stubs in yhwh/, yhwh-3d/, and yhwh-obsidian/ first.

Use a hosted Stripe Payment Link, following current official documentation when implementing it. Let the humans supply the account, recipient, currency, amount rules, and approved payment link. Reuse the existing configuration system for the public link. Keep account setup and secret keys outside the apps and repository.

When the link is configured, the donation button opens Stripe's checkout. When it is missing, show the simple developer setup steps already described by the app. Make it clear where the payment happens, and do not claim a payment succeeded merely because a browser opened. Preserve the editable YHWH wording.

Check the configured and unconfigured flows, cancellation, and link-opening failures. Use the provider's test setup for payment checks. Document what the humans need to configure before accepting real offerings. Go.
EOF
