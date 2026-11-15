Run `make` for a gui.

Run `yhwh` for a cli.

Run `make tty` for **el shaddai**, the ranger-like terminal interface.
**shaddai**: “Nobody knows. Maybe mountains or ttys.” Edit the definition in
Settings or through `Ctrl+P` → **Edit shaddai definition**.
See [the terminal guide](yhwh/src/yhwh-tty/README.md) for keys and commands.

`make develop` adds **YHWH (Development)** to your Linux app menu, linked to this
checkout, with a violet icon and terminal badge. `make install` adds **YHWH** with
a gold icon, using the standalone package in `~/world/mnt/sinai`. Both open this
workspace and can coexist. Re-run the relevant target to update it.

Desktop entry templates and icons live in `usr/share/`. Installation resolves
their paths into `${XDG_DATA_HOME:-~/.local/share}/applications` and `icons`.
`make uninstall` removes unmodified desktop files it owns along with `~/world`.

