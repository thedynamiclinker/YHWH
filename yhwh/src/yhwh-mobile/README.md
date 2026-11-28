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

The [Initial](../../../../doc/initial.md) adds a programmable touch shell: on-screen gestures, Unicode Letters, reusable Logos, a draggable 5×5 script grid,
versioned rc/script files and live or fixed graphical file tabs. Desktop and
Three share the shell and can switch to it from the terminal header.

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
make android-apk      # sync and compile a debug APK; sets up the toolchain on NixOS
make android-run      # rebuild, install and open on your adb-connected phone
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

On NixOS, `make android-apk` automatically runs Gradle in `shell.nix`, which
supplies JDK 21, the Android SDK and a native aapt2 without changing the system
profile. Java and the SDK do not need to be installed in the calling shell.
For an interactive native development environment, from the vault root:

```sh
nix-shell yhwh/src/yhwh-mobile/shell.nix
```

The shell's SDK composition accepts the Android SDK license and downloads the
needed packages into the Nix store. It excludes emulators and system images.

### Test on a connected Android phone

From the vault root, with the phone unlocked and USB debugging authorized:

```sh
make android-run
```

Repeat this after source changes. It checks the adb connection before building,
rebuilds the shared UI and debug APK, installs it while keeping app data, and
restarts YHWH so the latest code loads. Nix supplies the build toolchain on NixOS;
Android Studio, an emulator and a store account are not needed for this workflow.
The first build may download dependencies; later builds reuse the Nix and Gradle
caches. This installs bundled code, so the app also runs unplugged; it is not a
live-reload server.

If several devices are connected, select one with
`ANDROID_SERIAL=SERIAL make android-run`, using its serial from `adb devices -l`.

The equivalent individual steps are:

```sh
make android-apk
adb devices -l
adb install -r yhwh/var/tmp/yhwh/mobile/yhwh-debug.apk
adb shell am start -n com.thedynamiclinker.yhwh/.MainActivity
```

The phone should appear with status `device`. If more than one device is
connected, add `-s SERIAL` after `adb` in the install and launch commands,
using the phone's serial from `adb devices -l`. Omit the leading `yhwh/` in
the APK path when running from the application directory. `install -r`
updates an existing installation while retaining its data.

Create a Markdown note, type with the software keyboard and explicitly save.
Switch tabs, rotate the phone, then background and reopen the app. Close and
relaunch it to confirm the saved note persists. Try importing and sharing a
file through the system picker and share sheet. These use the phone's app-owned
workspace; the desktop vault is not copied or synchronized to it.

If the app crashes, capture the crash log with `adb logcat -b crash -d`.
For WebView UI errors, open `chrome://inspect/#devices` in desktop Chrome/Chromium
while the debug app is running and select **inspect** under YHWH's WebView.
See the official [adb documentation](https://developer.android.com/tools/adb)
for installation, device selection and activity launch commands.

For a simulator build on a Mac:

```sh
xcodebuild -project yhwh/src/yhwh-mobile/ios/App/App.xcodeproj \
  -scheme App -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build
```

The native launcher icons use the installed desktop's third-mountain artwork;
Android provides round and adaptive variants, while iOS applies its own mask.
Regenerate the checked-in desktop and native exports together with
`node yhwh/bin/icons.cjs` from the vault root (ImageMagick required only for
regeneration). The iOS project includes
the [Filesystem timestamp privacy declaration](https://capacitorjs.com/docs/apis/filesystem)
and enables Files access to its Documents directory. Android's file provider
shares only workspace files and cache files; no storage-wide permission is needed.

## Platform boundary and current parity

| Feature | Android and iOS behavior |
| --- | --- |
| Editor, syntax, Markdown, formatting, themes | Shared Everforest editor with Live Preview, Source and Reading modes. The toolbar has Auto highlighting, language overrides, and Why? for explanations. Automatic detection uses filenames and file contents on mobile. Rules and feedback use the same flat files in private Library storage. Tap a link label to edit it, use Open link at cursor to follow it in Live Preview, or tap directly in Reading. |
| Commands, tabs, settings, inbox, character copy | Shared UI; native settings and copy overrides persist privately |
| New Human School | Menu → Commands opens the bundled offline quiz or cards in the current workspace folder. The native app uses the shared quiz view. |
| YHWH Emails | One local Inbox message per section of [YHWH Emails](../../../var/declarative/yhwh-emails.md) and [YHWH Emails Next](../../../var/declarative/yhwh-emails-next.md), delivered in order as you work, with shared presence controls and links that open in the native browser |
| YHWH merch | About YHWH and Settings → Presence use the shared setup guides and store the two storefront URLs and checklists on this installation. Provider pages open in the platform browser. |
| YHWH-ness and upgrade preview | Shared free levels, reversible Pro and Elite preview unlocks, Stripe setup guide and character names. Preview state persists on this installation. |
| 曰 night letters | Shared ordered inbox sequence, local 22:00–06:00 delivery during use, five-minute spacing and a Wiktionary link opened by the native browser |
| `seedis` midnight letter | Shared local 00:00 delivery, To/CC/BCC, editable Markdown, footnote and bundled offline attachment; requires the visible app, with no late catch-up or OS background service |
| Chapter/verse navigation and commentary | Shared UI and model, bundled offline library, persistent private edits |
| Files, folders, move, rename, copy, autosave, explicit save, conflicts | Native Filesystem adapter; hold a file/folder for 450 ms, then drag onto a folder, `..` or blank space to move it; Move to folder picker also available; UTF-8/newlines retained; same-timestamp content changes detected |
| Trash | Moves into hidden workspace `.Trash`; enable hidden files to recover |
| Import / export / share | System file picker imports copies; native share sheet exports saved files; browser preview downloads |
| Fullscreen | Native app content fills the window and respects safe areas; OS status/navigation controls remain under platform control |
| Attachments and PDF | Attachments use the native export/share sheet; browser preview downloads. The shared PDF preference offers Ask / Preview here / System app with a remember-for-all choice; “System app” uses export/share on mobile because this adapter cannot launch a workspace file directly in a default app. Optional read-only PDF preview scrolls continuously with touch and has page and zoom controls. When the WebView delivers Ctrl+wheel from a keyboard and mouse, it zooms the PDF under the pointer or scales the interface elsewhere. PDF input is limited to 64 MiB and text to 16 MiB. Larger PDFs use export/share. |
| Copy paths | Full logical workspace path and path relative to the current directory; native private storage paths are not exposed |
| Local Markdown images | Native WebView URLs into the app's workspace; remote images stay blocked by CSP |
| Background / resume | Refreshes directory listings on resume. unsaved buffers remain; recovery drafts survive WebView eviction where local storage is available |
| Plugins | Shared bundled hello-world plugin; arbitrary user JS plugins need a mobile distribution/trust design |
| Configuration | Native JSON settings with global/directory scopes, local CSS/backgrounds; Bash rc evaluation and rc editing require desktop |
| External vaults and sync | App-owned workspace only; no Android SAF folder grants, iCloud vault selection, Obsidian Sync or cross-device sync yet |
| Initial · in-app shell | Shared Atomics, Builtins, Letters and Logos. Drag tiles into the 5×5 script grid, select a tile to edit its options, and see the preview update above the grid. Use Run for file writes or app actions. |
| Unix processes / PTYs | Require desktop APIs; mobile shell shortcuts open the Initial |
| Panel keys | Hardware keyboards can hide, show, maximize or incrementally resize the file drawer. Configure the combinations and pixel step in Settings → Keys. The Initial opens as a sheet on mobile. |
| Talk to YHWH | Shared composer and local left-side History for offline workspace help. Live chat setup opens the desktop connection guide. Live agent writes, chat attachments, and direct mail delivery require the desktop host. Electronic Mail can open a draft in the device’s mail app. |
| Folder roots | Optional per-tab navigation into an existing folder using Use this folder as /. |
| Tab anchor and folder actions | Shared `~`, `@`, and `/` controls. The Initial supports `@-set` and `@-get`. Tap a folder’s row menu to set `@` or run a text action from `/.yhwh/etc/folder-menu`. Executable actions require desktop process APIs. |
| Universes | Nu creates the bundled Empty and Lord workshop starters in the workspace. Cd opens a marked directory. OCI import and Go need a Linux host with process and namespace access. |
| Sinai/Horeb, fan mail and desktop overlays | Desktop mounted source trees are not bundled |
| Nietzsche Family Circus | Available in Nietzsche mode. The shared widget loads pairings via native HTTPS. The browser preview links to the original site. |
| Desktop source-copy editing, process quit/reveal, piece offering | Require desktop services/files; explicit unavailable results or mobile equivalents |
| Three / Shaddai / company rehearsal | Separate clients. Shaddai uses a host terminal and Python with local Unix process and filesystem access. |

Mobile opens at `/`, with **Settings → Files & editor → Default directory** for
starting in a subfolder. On fresh installs `/` is the app’s external files
directory on Android and its Documents directory on iOS. The Android system
picker imports files from shared storage. iOS exposes documents in Files → On
My iPhone/iPad → YHWH. Existing installations map their previous documents
folder to `/` in place. Absolute `/YHWH/...` paths written into documents or
scripts can be updated to `/...`. Private JSON state remains separate.
Browser preview uses Capacitor’s IndexedDB filesystem. Import preserves originals
and refuses existing destinations. Exports share the last saved file; save your
buffer first. Uninstalling deletes local data, so keep exported backups.

Autosave is on by default, with a switch in Settings → Files & editor. Explicit
Save and Save as remain available. Normal document replacement/closing and app backgrounding flush autosave without a Save/Discard prompt. Conflicts pause autosave rather than overwriting
an external change. Recovery drafts pause autosave until reviewed and explicitly
saved. Recover a draft, review it, then save; if its disk version changed, normal conflict handling applies.
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

The Obsidian plugin uses its host’s window, editor autosave and native viewers;
it does not take over fullscreen or install a Unix terminal. Its navigator offers
trash and both path-copy actions (absolute filesystem paths depend on the host).
Its desktop navigator accepts file/folder drops onto folders, breadcrumbs, the
`..` row and list background through Obsidian's vault file manager. Touch
dragging depends on the host; Rename or move remains available there.
Shaddai uses the host terminal’s full screen and provides conflict-protected
autosave, a source/reading toggle and independent shells in its app tabs.
Shaddai opens rich file formats in an external viewer on a graphical host.

## Prefix keyboard system

Hardware keyboards use the shared desktop dispatcher, bundled file-derived defaults,
tab switching/reordering/reopening and Ctrl+Alt+Shift+K capture/search dialog.
Text, wildcard and regex search work on-device. Custom executable/JS files,
shell pipelines, virtual shell namespace commands and editing desktop prefix
files require desktop filesystem/process APIs and return explicit unavailable
messages on Android and iOS. The last mobile tab remains a usable blank tab.
These source changes require rebuilding and installing a new native app.

The Initial’s gesture and tile UI is shared with desktop/Three. TTY and the
Obsidian plugin do not yet host its interpreter; their existing command interfaces
and ordinary text editing remain. See [the Initial guide](../../../../doc/initial.md)
for syntax, deliberate limits and persistence behavior.
