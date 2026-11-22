# Sinai

Run these commands from YHWH, `~/src/exec`, or `~/src/@`.

```sh
make world
make chroot
```

At the `sinai#` prompt, try a pipe and a prayer.

```sh
echo 'hello from sinai' | tr a-z A-Z
printf 'hello from sinai\n' | lord 'Uppercase this line and return it as plain text.'
lord 'Create /bin/hello as a Toybox sh script that says Hello from Sinai. Test it.'
```

Type `exit` to return to the host. Run `sinai chroot COMMAND` for a single
command. All three Makefiles use `exec/bin/sinai` through PATH.

`make world` downloads and verifies pinned source archives and builds Toybox
and musl using the host GCC and Linux headers. It installs the applets in
`/bin`, the musl loader and library in `/lib`, and the C headers in
`/usr/include`. Build tools and sources stay on the host. Running it again
preserves files in the existing world.

To start from the seed again, exit Sinai, move `/mnt/sinai` aside on the host,
and run `make world`.

The launcher uses Bubblewrap to give the shell its own root, processes and
devices while sharing the host kernel and network. Guest root maps to the host
account that owns the world when launched by that account or by host root.

`lord` passes argv and the three standard streams through a temporary Unix
socket. The host runs `exec/bin/lord` with the `@` prose program and the host
account's existing Codex login. The default runner works in the corresponding
directory under `/mnt/sinai`, with write access scoped to Sinai. Set
`SINAI_LORD` on the host to select another runner and use its permissions.
The socket closes when the shell exits.
