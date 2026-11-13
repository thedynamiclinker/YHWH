# YHWH for Obsidian

YHWH for Obsidian is a simple, normal Obsidian plugin that provides as much as possible of the apps described in [[mk-yhwh]] and [[mk-yhwh-three]]. Its scope is the behavior those descriptions make possible within an ordinary Obsidian plugin.

The shared descriptions supply the desired file navigation, editing, terminal integration, configuration, visual identity, and YHWH personality wherever Obsidian's plugin capabilities permit them. Features that cannot be implemented as a normal plugin are outside this version's scope; those limits do not prevent the feasible parts from being useful.

## Plugin layout

The plugin lives in `./yhwh-obsidian/`. It is an Obsidian plugin rather than a separate Electron application or a replacement for Obsidian itself.

## Installation and publication command

`yhwh-obsidian` opens Obsidian; `yhwh-obsidian --help` displays plugin management commands. Its options or subcommands support installing the plugin into a specified directory and pushing it to Obsidian's community plugin registry.

It follows the command naming convention described in [[mk-yhwh#Commands, installation, and completion|the core app's command description]].
