# Cross-platform feature policy

Read [README.md](README.md) before changing the mobile app.

All new YHWH app features must be added to the desktop, Android and iOS
versions to the extent possible and practical. Apply the same principle to
the Obsidian plugin, spatial and terminal interfaces where it fits their purpose.

Implement features in shared modules and the shared desktop renderer wherever
possible. Android and iOS import that renderer directly. Do not create copies
of the editor, Markdown engine, commands, themes, character copy or verse model.
Platform-specific work belongs in small adapters and native configuration.

For every new bridge operation, implement its mobile equivalent or document
the concrete platform limitation and provide an explicit unavailable result.
Keep the parity table in README.md current. Never report success for an
unimplemented feature. Check phone and tablet layouts, software keyboards,
safe areas, background/resume, persistence and desktop regressions when relevant.

Shared changes reach mobile builds automatically; devices still need a newly
built and installed release. Do not describe source sharing as over-the-air
updates or a synchronization service.
