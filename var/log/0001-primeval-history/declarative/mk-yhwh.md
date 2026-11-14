# YHWH

YHWH is an Electron app for navigating the whole filesystem and working with files. It has the shape and ease of Obsidian, a real file manager, a terminal, and the Paleo Hebrew and YHWH personality of the existing app. Its center of gravity is text, but its navigation is as free as Nemo, Ranger, or a shell.

The product direction is LD's move from services to products. YHWH is a simpler, more powerful Obsidian that can grow toward a desktop environment or even a Linux distribution's everyday shell.

## Source and app layout

The interface lives in `yhwh/src/yhwh-default`. Shared capabilities live in `yhwh/lib`; defaults and interface text live in `yhwh/etc`. See [the application guide](../../yhwh/README.md) for build, launch and installation.

## The interface

The interface resembles Obsidian, with familiar buttons in familiar places. It is more minimal than VS Code and has only the subset of Obsidian described here. The Paleo Hebrew logos, YHWH-ness meter, Nietzsche mode, Dawkins mode, and Nietzsche family circus retain the existing YHWH feel. Extra personality occupies space that Obsidian leaves unused, without making ordinary work unintuitive.

The main components are:

- A central text or reading view, where most work happens.
- A real file manager on the left, visible by default, with Obsidian-like placement, text, and sizing and the existing YHWH appearance.
- A terminal at the bottom, hidden by default but implicitly running, like Guake at the bottom of the window.

The file manager, terminal, and central view can each occupy all of the available work area or none of it. Giving a component that space does not require putting the entire application into fullscreen mode or closing open files.

### A real file manager

The file manager is compact like Ranger and behaves like Nemo when focused. Parent-directory navigation is central and easy: `cd ..` is as fundamental here as Alt+Up in Nemo or Left in Ranger. The user can travel through the whole filesystem without being anchored to a vault or repository.

A small button and a keyboard shortcut expand the sidebar into a larger, Nemo-like file manager occupying the central work area. Open files remain open during that change.

### One place, two ways to navigate

The file manager and terminal represent navigation in the same place. Their current directories stay synchronized by default within each focus window or app-level tab. A shell `cd` hook is one possible mechanism for that synchronization; the behavior is the requirement.

Tabs belong to the app as a whole, rather than forming separate sets of tabs in the terminal, file manager, and reading view. Each app-level tab provides a focused place to navigate with the shell and file manager and to work in the central view. Opening a file or program from either navigation interface belongs to that focus.

The current layout has three components: file manager, terminal, and the central work view. It can eventually evolve into a separate navigation app or plugin alongside a work view that might also be a browser.

### Keyboard behavior

| Action | Default shortcut or behavior |
| --- | --- |
| Show or hide the file manager | Ctrl+E |
| Expand or restore the file manager within the app's work area | Ctrl+D |
| Show or hide the bottom terminal | Ctrl+B |
| Open a new app-level tab | Ctrl+T |
| Manage tabs | Familiar terminal and browser shortcuts |
| Navigate to the parent directory | An easy, prominent action comparable to Nemo's Alt+Up or Ranger's Left |
| Show or hide both navigation components, or give any component the work area | Quick, intuitive, memorable shortcuts |

The terminal heading in the original prompt also mentions Shift+Alt, without assigning it a specific action.

Multiple shortcuts can invoke the same action. Familiar alternatives from Chrome, Obsidian, Gedit, terminals, and other apps preserve access when operating-system or window-manager shortcuts take precedence. The user does not need to abandon deeper, system-wide muscle memory to use the app.

## Files and editing

The central view is text-first because most development work concerns line-oriented text of the kind Git handles well. The app supports all MIME types in principle; that does not require a PDF viewer in the initial app.

New files are not assumed to be Markdown. File detection and syntax highlighting use established editor techniques, including MIME types, shebangs, and magic numbers. An extensionless file named `boop` receives Markdown highlighting only when detection of the kind Gedit uses would identify it as Markdown.

A small Gedit-like menu at the bottom right makes the detected type easy to change. Persistent overrides by extension or filename regular expression belong to the hierarchical configuration.

Some formats have a natural pretty mode:

- Markdown renders like Obsidian's default editing view.
- JSON has formatting equivalent to passing the text through `jq`.
- HTML has formatting comparable to an HTML linter.

Pretty mode remains an editing experience in the spirit of Obsidian's default view.

Filenames are editable through the large H1 filename, as in Obsidian, as well as through the file manager's rename action.

## Hierarchical configuration

The app works without a vault and without creating a configuration directory in every folder. A local `.yhwh/` directory is optional; it is the per-directory equivalent of a vault when the user wants one. A `~/.yhwh/` directory is not required.

Configuration locations have the same internal layout:

| Scope | Default location |
| --- | --- |
| System | `/etc/yhwh/` |
| User | `~/.config/yhwh/` |
| Optional directory override | `.yhwh/` in the relevant directory |

Configuration applies in that order, with local settings overriding higher-level settings. System and user configuration can also target arbitrary files or directories anywhere in the filesystem. Themes participate in this hierarchy at every level.

### The `rc` file

An `rc` file, when present in any configuration directory, contains pathname sections. Unindented lines name files or directories; indented lines contain shell assignments or commands for that section. Indentation is required. Comments are allowed.

```yhwh
# rc
/
    key='value'

/etc
    title='Welcome to /etc you filthy bastard' # Just an example.

$HOME/Desktop
    key='different value'
    bg="$IMAGES/wallpapers/bg.png"

$PRIVATE/nothing-to-see-here/pr0n
    bg="$(ls "$STUFF/screenshots/*.png" | sort -R | head -1)"
    espeak ./
```

Environment variables from the user's shell work in paths and commands. Indented content supports shell behavior, including command substitution. The pathname sections are the small amount of special syntax; the rest uses the shell rather than a new general-purpose configuration language.

Inside a local `.yhwh/rc`, paths may be relative or absolute. Relative paths can refer to files alongside the directory being configured. For example, `$PRIVATE/secret/.yhwh/rc` can refer to `supersecret/pics/boop.png` as a background beneath `$PRIVATE/secret/`. Other files in a configuration directory remain available as resources referenced by its configuration.

Missing configuration directories or missing `rc` files are ordinary supported conditions, as in other Unix applications.

Configuration variables can be namespaced when exposed outside their file, such as exposing `bg` as `yhwh_bg`, to avoid collisions with unrelated environment variables. Namespacing is the preferred default; an explicit `yhwh_bg` takes precedence over an unqualified `bg`. Existing environment values receive cautious treatment rather than accidental overwriting.

The configuration and execution model follows shell behavior, Unix filesystem permissions, user and group permissions, and ordinary root-user rules. Its design remains suitable for a future app that serves as much of the user's desktop or shell environment.

## Plugins, themes, and settings

The app has a working plugin system, demonstrated by one hello-world plugin. It begins with the basic functionality described here rather than a large collection of bundled plugins.

Components can move through plugins or through added JavaScript, CSS, and HTML. Themes work through the hierarchical configuration. Compatibility with Obsidian themes and plugins is desirable wherever feasible.

The settings menu resembles Obsidian's but is smaller. Configuration can, in principle, change the menu's default appearance. The implementation is minimal, simple, reliable, cross-platform, and flexible enough that later changes normally involve plugins, configuration defaults, or rearranging components rather than replacing the fundamental architecture.

## Commands, installation, and completion

The bare `yhwh` command displays Unix-style help. `yhwh open` opens the default
app; `yhwh open three` and `yhwh open obsidian` select the other interfaces.
`yhwh-default` also exposes the file CLI. External executable `yhwh-NAME` commands
on PATH extend dispatch and help through safe `--help` introspection.

The root Makefile delegates to the self-contained `yhwh/` application. `make`
builds and opens the default app without installation. `make develop` links into
`~/world`, while `make install` installs a standalone npm copy in
`~/world/mnt/sinai`. Completion setup lives in `yhwh/etc/completions`. See
[the application guide](../../yhwh/README.md) for the complete command set.

## YHWH's personality

The character comes from the YHWH of `~/obsidian/We The Nameless/{01-genesis,02-exodus}/**/*.tex`, especially Genesis and the book's overall feel. The interface is irreverent, with room for a little Rick from *Rick and Morty*, Hormone Monster from *Big Mouth*, or Shinigami from *Death Note*. That personality remains compatible with an intuitive app.

The Paleo Hebrew logo, YHWH-ness meter, Nietzsche and Dawkins modes, and related touches are central parts of the identity, with room for more of the same.

### Offerings

A donation menu is called **Offerings** and includes:

- **Burnt Offering:** a stub Stripe donation integration. Initially its page is a simple tutorial for the developers, with buttons opening the relevant sites and explanations of setup steps such as connecting a bank account.
- **Piece Offering:** a file selection dialog leading to a stub upload destination at `dynamiclinker.com` or email to `yhwh@thedynamiclinker.com`.

### Help and editable character text

A help tab or menu contains:

- **About Us**, linking to [thedynamiclinker.com](https://thedynamiclinker.com).
- **About YHWH**, linking to his favorite book about himself: [*Genesis* by The Nameless](https://www.amazon.com/dp/B0HNQ23QKT). Its explanation, in YHWH's voice, says that The Nameless is a group he identifies with because he does not like people saying his name.

Every added piece of YHWH character text has an edit button. Saving an edit changes the default wording in `yhwh/etc`, so the developers can revise the wording directly from the interface. The interaction is as simple and direct as editing an Obsidian filename through its H1.

### Coming attractions

Unobtrusive upgrade buttons advertise features that are not yet implemented, using this text:

> YHWH Sync, YHWH Stuff, and YHWH Three! Also coming soon: YHWH Dating! He's giving this land to your seed! Pre-order now Abe! What do you mean that's not your name? Well it is now.
