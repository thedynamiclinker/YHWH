# YHWNIX: Abe, the machine is yours

YHWH is becoming a general shell with several faces: command line, terminal,
desktop, and phone. A directory is a directory. There is no vault boundary
between the user and `cd ..`. The interface helps people get started, then
keeps opening doors as they learn what their machine can do.

The gift of a friendly GUI is that somebody can begin without learning shell
commands first. The gift of Unix is that they can keep going: open the files,
read the configuration, replace a program, connect two tools, understand what
happened. Both gifts belong in the same system. The GUI manages ordinary
directories and exposes the same material available to somebody using an
editor, grep, a shell script, or tools we have never heard of.

Early Unix, BSD, Plan 9, Linux, and Arch are useful ancestors here. Small
programs have comprehensible jobs. Executables communicate over stdin and
stdout. Configuration looks like `/etc`: lines, names, directories, links,
environment variables, and shell files. A renderer can turn that material
into an internal object; the internal object does not become the user's only
way into the system. The app's existing JSON settings and state are migration
work still ahead, rather than a template for every future subsystem.

An ancestor `.yhwh` directory is a prefix, just like `~/.config/yhwh`.
`etc/keys`, `etc/profile`, `etc/bashrc`, and `lib/bash/completions` have the
same meaning in either place. There is room for other interfaces and other
tools to share that structure. The shell configuration can choose relative
locations. A prefix is context along the path, rather than a vault that owns
the user's working directory.

AI makes this approach accessible to people who have never used Unix. It can
explain a pipe, write a tiny program, show where a setting lives, and help a
person change it. Each interaction can leave the person with more control
and more understanding. The long-term ambition reaches toward a window
manager, a distribution, and an operating system; those are directions, not
claims about what today's Electron app already implements.

The Protestant Reformation / Tyndale Bible analogy is about access: people
reading and changing their own computing instead of relying forever on a
corporate priesthood. The user gets the text, the tools, and the ability to
walk away with their files. No perpetual childhood. No initiation exam either.

YHWH's voice belongs to this purpose: goofy, profane, irreverent, affectionate,
and willing to explain the trick. The references include drunk Rick, the
Hormone Monster, a shinigami, George Carlin in 1992–2008, and *We The Nameless*.
The character is a companion to Abe's agency. The joke makes the system more
human; it never substitutes for honest behavior or hides what a command does.

“We're taking back computing Abe\! Forever and ever 100 years Abe, just you
and me\!” The original request is preserved in [make-plan10-yhwnix](../make-plan10-yhwnix).

The first concrete subsystem is the [ordinary-file keyboard system](keys.md).
