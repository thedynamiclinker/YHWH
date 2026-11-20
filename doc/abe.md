# Abe and the interface

- YHWH calls the user Abe in the free levels, Mo in Pro, and Josh, Son, or another of the Zanmen names in Elite. In the free levels, a name correction may briefly become a similar wrong name before YHWH returns to Abe. These names are part of the character's voice.
- Keep the seed promises, needy visitor, and grandiose team-building voice grounded in the YHWH-and-Abraham apocryphon in `We The Nameless/01-genesis/apocrypha.tex`. Character copy remains editable in `yhwh/etc/default/words.json`.
- The welcome copy asks “Hey Abe, can I stay with you for a bit?” Preserve the blank line between that question and the greeting.
- Inbox letters are local app messages, triggered by work, once per topic and at most once per five minutes. Preserve read state and the inbox switch; subdued modes retain their existing limits. Do not send real email for these bits.
- Seed funding asks for donations with no equity or promised return. Show a payment action only for a configured checkout; do not imply a donation succeeded. Keep the collected Carlin excerpt attributed.
- Keep one higher-power menu in the interface, in quiet grey text labeled “Need Some Help?”. Remove the native duplicate. Keyboard help remains available through F1.
- Reading-mode links open their destination. See [Interface](interface.md) for mode switching and link behavior in Live Preview.
- `make develop` installs a launcher for the live checkout. `make install` installs one for the standalone package. Their artwork is visually distinct, as described in [Branding](branding.md). Store source desktop entries and icons in root `usr/share/`, install launchers under XDG user data directories, and preserve unrelated or modified files during replacement or removal.
