# YHWH for Android, iPhone and iPad

Native Capacitor 8 projects wrap the **same renderer** used by the desktop app.
The mobile entry point imports `../yhwh-default/src/renderer.js` directly, along
with its CodeMirror editor, Markdown, commands, verse UI and bundled plugin.
The build also reads the desktop HTML, styles, themes, fonts and character copy.
`lib/verse-library.cjs`, `lib/verse-reference.cjs` and `lib/file-type.cjs` are
platform-independent models used by desktop and mobile.

The touch layout follows [Obsidian mobile](https://obsidian.md/help/mobile): a
file drawer with edge-swipe navigation, bottom navigation, create/find-note
sheet, tab counter and switcher, ribbon actions in a menu, and an editing
toolbar above the keyboard. Tablets retain a wider layout and visible tab strip.
Safe areas, portrait/landscape layouts and keyboard viewport changes are handled.

## Feature inheritance is required

**All new features should be added to all versions of the app to the extent
possible and practical.** Prefer shared code. For native work, add Android and
iOS adapters together, or document the exact platform restriction here and
provide an explicit unavailable result in the app. The same rule is recorded in
`yhwh/AGENTS.md` and `doc/mobile.md` at the vault root.
The mobile tests compare adapters against `lib/bridge-contract.cjs`; adding a
core operation requires an explicit mobile implementation or limitation.

Shared source changes are automatically included when building each app. They
do **not** update already installed apps: rebuild, sync, compile and distribute
a new native release. There is no over-the-air code updater or file-sync service.

## Build and run

Run these from the vault root or `yhwh/`:

```sh
make deps
make mobile-build     # bundles the shared core into yhwh/var/tmp/yhwh/mobile/ui
make mobile-check     # behavioral tests and phone/tablet browser workflows
make mobile-sync      # rebuilds and cap syncs BOTH checked-in native projects
make android          # sync, then open Android Studio
make android-apk      # sync, then compile a debug APK with an existing SDK/JDK
make ios              # sync, then open Xcode on macOS
```

One root npm lockfile owns all dependencies. The equivalent npm scripts are
`mobile:build`, `mobile:check`, `mobile:sync`, `android` and `ios`. The mobile UI
also builds during `make build` and is checked during `make check`.

The checked-in projects are `android/` and `ios/App/App.xcodeproj`. The root
`yhwh/capacitor.config.json` points to both. Generated web copies, SDK paths,
build outputs and signing secrets stay out of version control. Do not edit
the copied JavaScript under native `assets/public` or `App/public`.
Gradle's `preBuild` and Xcode's first build phase also rebuild and copy the
shared UI before Run/Archive, so IDE builds inherit source changes automatically.
They require the root npm dependencies and Node on PATH (`YHWH_NODE` overrides
the executable). After adding/upgrading native plugins, run `make mobile-sync`
to update the native dependency projects as well.

For an APK after `make mobile-sync`:

```sh
cd yhwh/src/yhwh-mobile/android   # omit yhwh/ if already inside it
./gradlew assembleDebug
# app/build/outputs/apk/debug/app-debug.apk
```

`make android-apk` also copies the result to
`yhwh/var/tmp/yhwh/mobile/yhwh-debug.apk` for installation or sharing.

Android requires Android Studio 2025.2.1+, its JDK 21, SDK platform 36 and build
tools. Minimum Android API is 24; the app requires WebView 110+. On iOS use
macOS with Xcode 26+; the app targets iOS/iPadOS 16+. Swift Package Manager
resolves native plugins without CocoaPods. See the official
[environment setup](https://capacitorjs.com/docs/getting-started/environment-setup).
Select an Apple development team in Xcode for a physical device. Use Android
Studio's signed bundle workflow or Xcode Archive for release distribution;
keystores, provisioning and store accounts are supplied by the app owner.

On NixOS, a development shell supplies Java, the Android SDK and a native aapt2
without changing the system profile. From the vault root:

```sh
nix-shell yhwh/src/yhwh-mobile/shell.nix --run 'make android-apk'
```

The shell's SDK composition accepts the Android SDK license and downloads the
needed packages into the Nix store. It excludes emulators and system images.

For a simulator build on a Mac:

```sh
xcodebuild -project yhwh/src/yhwh-mobile/ios/App/App.xcodeproj \
  -scheme App -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

The native launcher icons reuse the existing YHWH icon. The iOS project includes
the [Filesystem timestamp privacy declaration](https://capacitorjs.com/docs/apis/filesystem)
and enables Files access to its Documents directory. Android's file provider
shares only workspace files and cache files; no storage-wide permission is needed.

## Platform boundary and current parity

| Feature | Android and iOS behavior |
| --- | --- |
| Editor, syntax, Markdown hybrid/reading/source, formatting, themes | Shared desktop renderer and editor |
| Commands, tabs, settings, inbox, character copy | Shared UI; native settings and copy overrides persist privately |
| Chapter/verse navigation and commentary | Shared UI and model, bundled offline library, persistent private edits |
| Files, folders, rename, copy, explicit save, conflicts | Native Filesystem adapter; UTF-8/newlines retained; same-timestamp content changes detected |
| Trash | Moves into hidden workspace `.Trash`; enable hidden files to recover |
| Import / export / share | System file picker imports copies; native share sheet exports saved files; browser preview downloads |
| Local Markdown images | Native WebView URLs into the app's workspace; remote images stay blocked by CSP |
| Background / resume | Refreshes directory listings on resume; unsaved buffers remain; recovery drafts survive WebView eviction where local storage is available |
| Plugins | Shared bundled hello-world plugin; arbitrary user JS plugins need a mobile distribution/trust design |
| Configuration | Native JSON settings with global/directory scopes, local CSS/backgrounds; Bash rc evaluation and rc editing require desktop |
| External vaults and sync | App-owned workspace only; no Android SAF folder grants, iCloud vault selection, Obsidian Sync or cross-device sync yet |
| Unix terminal and shell navigation | Requires desktop process/PTY APIs; unavailable on mobile |
| Codex conversation | Requires the desktop executable/service; unavailable until a mobile service adapter is implemented |
| World filesystem, Sinai/Horeb and fan mail | Desktop mounted source trees are not bundled; unavailable on mobile |
| Circus, desktop source-copy editing, process quit/reveal, piece offering | Require desktop services/files; explicit unavailable results or mobile equivalents |
| Three / TTY / company rehearsal | Remain separate interfaces; spatial scene and local-process workflows are not bundled in the mobile shell |

Mobile paths such as `/YHWH/notes.md` are logical workspace paths. Native files
are ordinary files under `Directory.Data/YHWH`: iOS Documents/YHWH (visible in
Files → On My iPhone/iPad → YHWH) and Android's app-private files directory.
Private JSON state is stored separately under `Directory.Library/yhwh`.
Browser preview uses Capacitor's IndexedDB filesystem. Import preserves originals
and refuses existing destinations. Exports share the last saved file; save your
buffer first. Uninstalling deletes local data, so keep exported backups.

Recovery drafts never silently overwrite the disk. Recover a draft, review it,
then save; if its disk version changed, normal conflict handling applies.
Draft recovery depends on available WebView storage and is not a backup system.

## Validation

`make mobile-check` covers path confinement, conflict handling, persistence,
binary safety, serialized mutations, shared build inputs, native configuration,
and real Chromium touch workflows for phone and tablet sizes. Set
`YHWH_CHROMIUM=/path/to/chrome` when needed; otherwise it uses Playwright's
Chromium or a system Chrome installation. Screenshots go to
`yhwh/var/tmp/yhwh/mobile/screenshots`.

Browser tests do not substitute for native device tests. Before release compile
both projects and check system import/share, iOS Files integration, Android Back,
keyboard, safe areas, orientation, background/resume and OS-termination recovery
on devices or emulators. Native builds require the corresponding SDK toolchains.

Local validation completed: Android `assembleDebug` through `shell.nix`, APK
signature verification, archive integrity, and exact equality between the APK's
bundled UI and the shared build. The default and Three Electron UI suites and
the repository's core test suite also passed. iOS native compilation and device
testing have not been performed on this Linux host.
