#!/usr/bin/env bash
# Draft for human review. Run from the YHWH project root after approval.

lordhavemercy -f --verbose << "EOF"
Payment: Upgrades

Make YHWH's upgrade actions useful. Read yhy/ and inspect the existing upgrade buttons and coming-soon text in yhwh/, yhwh-3d/, and yhwh-obsidian/ first.

Give each approved upgrade a plain description and an honest status. An upgrade that is available to buy opens its approved hosted checkout. An installed feature opens the feature. A planned feature says that it is coming soon. Use the products, prices, payment links, and preorder terms approved by the humans; leave missing decisions visible for them to fill in.

Keep the existing YHWH personality and editable text. Put any checkout configuration in the existing configuration system. Keep secret payment keys outside the apps and repository. Check current official provider documentation if an integration needs it.

Check available, coming-soon, missing-link, and canceled flows. Explain the small amount of setup the humans need to finish, and update the app descriptions to match the resulting behavior. Go.
EOF
