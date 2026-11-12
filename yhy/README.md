# YHY: declarative descriptions

This directory is the declarative description of the apps we're building, the features they should have, and the workflow for getting the work done. These documents describe the intended behavior and constraints. They describe the target, not a claim that every feature is already implemented.

The imperative prompts are archived in `yamr/`. Their filenames begin with `YYYYMMDD-HHMMSS`, taken from each file's last modified time in local time. The declarative files keep the descriptive names with a `.md` extension:

- [[mk-yhwh]] describes YHWH: an Electron app with Obsidian's central text view, a real file manager, a synchronized terminal, filesystem-wide navigation, hierarchical configuration, plugins, and YHWH's personality.
- [[mk-yhwh-3d]] describes the same app with a gorgeous, science-fiction or video-game-like 3D interface, shared configuration, and its own executable.
- [[mk-yhwh-obsidian]] describes an Obsidian plugin that brings as much of those apps as possible into the limits of a normal plugin, with commands for installation and community publication.
- [[mk-the-workflow]] describes COVENANT, prompt drafts in `אמר/`, and human review before YHWH does the work.

Relative filesystem paths in these descriptions are rooted at the parent project directory.

The core idea is an app for moving around the whole filesystem. A directory does not need to become a vault or repository before it is useful. The file manager and terminal are two ways of navigating the same place; the central view is where the user works on a file. Configuration, themes, and plugins let that arrangement evolve without requiring a new fundamental architecture.

The core description contains the shared requirements. The 3D description adds its visual and configuration requirements. The plugin description carries over the parts that Obsidian can support. References between these descriptions use Obsidian links.
