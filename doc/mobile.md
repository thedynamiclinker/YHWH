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

`make android-apk` must build and sync the current shared UI before compiling
and copying the debug APK to `yhwh/var/tmp/yhwh/mobile/yhwh-debug.apk`. On
NixOS it must supply the repository's mobile Nix toolchain, including native
aapt2, without requiring Java or the Android SDK in the caller's PATH. A failed
native build must fail the target before copying an APK from an earlier build.

`make android-run` is the regular connected-device workflow: check adb before
building, build the current APK, install with data retained, then restart the
app to load the new code. Each step must succeed before the next runs. Respect
adb's `ANDROID_SERIAL` selection; do not silently pick among multiple devices.
This workflow needs no Android Studio, emulator or store account. It must not
uninstall the app or clear the phone's workspace to deploy an update.
