# On The Lamb

- Keep the copied documentation and its local image dependencies inside
  `mnt/sinai/boot/kernel/Documentation`. Copy from We The Nameless; leave the
  source vault intact. Relocate links in the copies so they work without that vault.
- `mnt/sinai/media` contains one relative symlink, `On The Lamb`, pointing to
  `../boot/kernel/Documentation/FOLLOWME.md`.
- Opening a file shortcut in the desktop resolves its target before detecting
  the language, rendering images, or following relative links. The documentation
  trail and images must remain usable from the God world view.
- Preserve the existing online video URLs; allow media from `https://fukkot.com`
  in the desktop preview. Video playback still needs a network connection.
- In reading previews, videos start at 400px wide, bounded by the
  available space, and expand to the reading width while focused. Video controls
  must remain interactive without switching to source.
