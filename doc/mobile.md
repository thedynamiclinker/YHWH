# Mobile application invariants

Android and iOS are native Capacitor shells around the shared YHWH renderer,
editor and models. Shared UI changes must flow into both mobile builds without
being copied or separately reimplemented.

All new features must reach all app versions to the extent possible and
practical. Platform-specific exceptions must be documented in
`yhwh/src/yhwh-mobile/README.md` and surfaced as unavailable, never as a
successful no-op. The source-level requirement also lives in `yhwh/AGENTS.md`.

Mobile documents remain ordinary files, saves are explicit, concurrent file
changes require review, and trash remains recoverable. Mobile uses app-owned
storage and platform import/share interfaces. It must not assume that a phone
has the desktop filesystem, shell, agent executable or Bash configuration.

Feature inheritance means rebuilding and distributing a new mobile release.
It does not imply automatic application updates or file synchronization.
