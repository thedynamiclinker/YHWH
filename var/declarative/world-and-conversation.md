# World and conversation

- The app combines Obsidian's simplicity, Linux desktop capabilities, and Unix terminal, shell, and Bash culture with YHWH's presence.
- Discovery has depth: an Obsidian-like first impression leads to developer and Unix-terminal culture in advanced settings, menus, and easter eggs, and ultimately to the expansive world, Bible, *We The Nameless*, and Sudocode beneath the interface.
- Optional narrative and game dynamics are part of the app's direction. They introduce the world's depths alongside productive work, with hidden discoveries suggesting an inexhaustible universe rather than cluttering the initial presentation.
- The world built over the author's preceding decade is expressed through a sleek, elegant, hilarious, enjoyable, productive app haunted by YHWH.
- A minimal chat interface lets the user talk to YHWH. A Codex-like interface, or Codex itself, is a suitable initial foundation; its character prompt explains his personality and speech using the complete Genesis `.tex` corpus from *We The Nameless*.
- `doc/` contains very brief summaries of the invariants that future changes preserve.
- Sinai is an editable Unix root at `/mnt/sinai`. The YHWH, `exec`, and `@` Makefiles call the same `sinai` command on PATH to build Toybox and musl from source and enter a Toybox shell. Inside, `lord` connects to the existing host runner through a session-local Unix socket. See [Sinai](../../doc/sinai.md).
- A universe is an ordinary directory with the `un` root marker in `.@`. Nu ships offline Empty and Lord workshop starters and offers base Alpine, Nix, Gentoo and Arch roots with lord commands, a YHWH CLI root, and imports from legacy OCI registries such as Docker Hub. Cd opens the directory, including before it has a guest shell. Go runs a Linux guest process and mounts explicitly chosen outer paths under `/mnt/host`. See [Universes](../../doc/interface.md#universes).
