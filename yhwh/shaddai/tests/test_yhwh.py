import json
import os
from pathlib import Path
import shlex
import socket
from tempfile import TemporaryDirectory
from time import time
import unittest

from test_workspace import LAUNCHER, WorkspaceTTY, F10


def put(path, content, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)
    path.chmod(mode)
    return path


class YhwhTTYTests(unittest.TestCase):
    def setUp(self):
        temp = TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.work = root / "work"
        self.work.mkdir()
        self.user, self.data = root / "config", root / "data"
        (self.data / "mnt/roots").mkdir(parents=True)
        (self.data / "mnt/sinai/mnt/sinai").mkdir(parents=True)
        put(self.data / "yhwh/etc/default/words.json", json.dumps({
            "letterHouse": "House letter", "letterInspect": "Shell letter", "letterSeed": "World letter",
            "booksUnavailable": "Coming soon",
            "welcomeTitle": "Where are you?",
            "welcomeBody": "Ah! There you are. Hey Abe, can I stay with you for a bit?",
            "aboutBody": "Abe, I’m with The Nameless.",
        }))
        app_data = LAUNCHER.parents[2] / "etc"
        fixture_data = self.data / "yhwh/etc"
        for name in ("default/action-letters.json", "default/text-verses.json", "verses"):
            (fixture_data / name).symlink_to(app_data / name)
        put(self.data / "mnt/sinai/mnt/sinai/README.md", "1. [Genesis](https://example.org/genesis)\n2. Exodus\n")
        put(self.data / "mnt/sinai/readme.md", "world file\n")
        put(self.data / "mnt/we/readme.md", "shared world overlay\n")
        put(self.data / "mnt/we/extra/folder.md", "only here\n")
        self.opened = root / "last-uri"
        opener = put(root / "opener", f'#!/bin/sh\nprintf "%s\\n" "$1" > "{self.opened}"\n', 0o755)
        self.env = {"YHWH_CONFIG_HOME": str(self.user), "YHWH_HOME": str(self.data),
                    "YHWH_SYSTEM_CONFIG": str(root / "system"), "YHWH_BROWSER": str(opener),
                    "YHWH_MAILER": str(opener), "SHADDAI_PREFIX": str(root / "shaddai")}

    def launch(self, **kwargs):
        tty = WorkspaceTTY(self.work, env=self.env, **kwargs)
        self.addCleanup(tty.close)
        tty.shows("Shaddai")
        return tty

    def command(self, tty, name, prefix=b"\x10"):
        tty.send(prefix)
        tty.shows("Commands")
        tty.send(name.encode() + b"\r")

    def test_bundled_email_uses_the_inbox_and_keeps_its_read_state(self):
        defaults = LAUNCHER.parents[2] / "etc/default"
        library = self.data / "yhwh/etc/default"
        (library / "yhwh-emails.json").symlink_to(defaults / "yhwh-emails.json")
        (library / "words.json").write_text((defaults / "words.json").read_text())
        put(self.user / "rc", "/\n    terminal=false\n")
        inbox = Path(self.env["SHADDAI_PREFIX"]) / "var/inbox.json"
        put(inbox, json.dumps({"letters": {"covenant": {"read": True, "at": 1}}, "last": 1}))
        tty = self.launch()
        self.command(tty, "New app tab")
        self.command(tty, "Inbox")
        tty.shows("* Q--- ohelet")
        tty.send(b"Q--- ohelet\r")
        tty.shows("Abe it's Q--- _(oh hell)_ ohelet.")
        tty.shows("https://youtu.be/tH2w6Oxx0kQ")
        tty.send(b"\x1bg")
        tty.shows("Open link")
        tty.send(b"https://youtu.be/tH2w6Oxx0kQ\r")
        tty.wait_for(lambda _: self.opened.exists())
        self.assertEqual(self.opened.read_text().strip(), "https://youtu.be/tH2w6Oxx0kQ")
        self.assertEqual({key: item["read"] for key, item in json.loads(inbox.read_text())["letters"].items()},
                         {"covenant": True, "qohelet": True})

    def test_dave_letter_can_arrive_during_genesis_work(self):
        defaults = LAUNCHER.parents[2] / "etc/default"
        library = self.data / "yhwh/etc/default"
        for name in ("mode-mail.json", "levels.json"):
            (library / name).symlink_to(defaults / name)
        (library / "words.json").write_text((defaults / "words.json").read_text())
        put(self.user / "rc", "/\n    terminal=false\n")
        inbox = Path(self.env["SHADDAI_PREFIX"]) / "var/inbox.json"
        first = time() - 1800
        put(inbox, json.dumps({"letters": {"covenant": {"read": True, "at": first}}, "last": first}))
        tty = self.launch()
        self.command(tty, "New app tab")
        self.command(tty, "Inbox")
        tty.shows("* Re: return shipping")
        tty.send(b"Re: return shipping\r")
        tty.shows("To: Abe")
        tty.shows("Abe, the Philistines")
        tty.shows("five gold mice")
        received = json.loads(inbox.read_text())
        self.assertTrue(received["letters"]["samuel-return-shipping"]["read"])
        self.assertEqual(received["letters"]["samuel-return-shipping"]["to"], "Abe")
        self.assertEqual(received["letters"]["samuel-return-shipping"]["verse"], "Genesis 15:5")
        self.assertEqual(received["last_misdelivery"], received["last"])

    def test_panel_shortcuts_cycle_and_resize_from_inside_the_shell(self):
        put(self.user / "rc", "/\n    terminal=false\n")
        tty = self.launch()
        ctrl_up, ctrl_down = b"\x1b[1;5A", b"\x1b[1;5B"
        tty.send(ctrl_up)
        tty.shows("Shell 1")
        shell_row = lambda lines: next((i for i, line in enumerate(lines) if "Shell 1" in line), -1)
        split = shell_row(tty.screen.display)
        tty.send(b"\x1b[1;8A")
        tty.wait_for(lambda lines: shell_row(lines) == split - 1)
        tty.send(ctrl_up)
        tty.wait_for(lambda lines: shell_row(lines) == 1)
        tty.send(ctrl_down)
        tty.wait_for(lambda lines: shell_row(lines) == split - 1)
        tty.send(ctrl_down)
        tty.wait_for(lambda lines: shell_row(lines) == -1)
        tty.send(b"\x1b[1;5C")
        tty.shows("Places")
        tty.send(b"\x1b[1;5D")
        tty.wait_for(lambda lines: not any("Places" in line for line in lines))

    def test_launcher_uses_the_global_default_directory(self):
        destination = self.work / "Start here"
        put(destination / "launch-marker.md", "# Launcher")
        put(self.user / "rc", f"/\n    default_directory={shlex.quote(str(destination))}\n")
        self.launch(args=["--launcher"]).shows("launch-marker.md")

    def test_chroot_opens_an_ordinary_directory_as_a_folder_tab(self):
        put(self.work / "unfinished/inner.txt", "inside")
        put(self.work / "outside.txt", "outside")
        tty = self.launch()
        self.command(tty, "Focus files")
        tty.send(b":chroot unfinished\r")
        tty.shows("Folder view")
        tty.send(b"Folder view\r")
        tty.shows("inner.txt")
        tty.send(b":cd ..\r")
        tty.wait_for(lambda lines: any("inner.txt" in line for line in lines) and not any("outside.txt" in line for line in lines))
        self.command(tty, "Close document tab")
        tty.shows("outside.txt")

    def test_level_preview_can_be_unlocked_and_relocked_across_restarts(self):
        app_root = Path(__file__).resolve().parents[2]
        source = app_root / "etc/default/levels.json"
        put(self.data / "yhwh/etc/default/levels.json", source.read_text())
        tty = self.launch()
        self.command(tty, "YHWH-ness")
        tty.shows("Upgrade to YHWH Pro")
        tty.send("曰 · Upgrade to YHWH Pro!\r".encode())
        tty.shows("Steal Upgrade")
        tty.send(b"Steal Upgrade\r")
        tty.shows("Hey Josh, take a look around.")
        tty.send(F10)
        tty.wait_exit()
        restarted = self.launch()
        self.command(restarted, "YHWH-ness")
        restarted.shows("YHWH-ness · 曰")
        restarted.send("Genesis · Free\r".encode())
        restarted.shows("Where are you?")
        restarted.shows("Hey Abe, can I stay with you for a bit?")
        self.command(restarted, "About YHWH")
        restarted.shows("God is a four letter word.")
        restarted.shows("LD is a four letter word.")
        self.command(restarted, "YHWH-ness")
        restarted.shows("YHWH-ness · Genesis")
        restarted.send("曰 · Pro\r".encode())
        restarted.shows("Hey Josh, take a look around.")
        self.command(restarted, "YHWH-ness")
        restarted.shows("Unsteal Upgrade")
        restarted.send(b"Unsteal Upgrade\r")
        restarted.shows("Hey Mo, take a look around.")
        self.command(restarted, "YHWH-ness")
        restarted.shows("Upgrade to YHWH Pro")
        restarted.send(b"\x1b")
        restarted.send(F10)
        restarted.wait_exit()
        locked = self.launch()
        self.command(locked, "YHWH-ness")
        locked.shows("YHWH-ness · Exodus")
        locked.shows("Upgrade to YHWH Pro")

    def test_shared_config_key_exec_world_overlay_books_email_and_fonts(self):
        put(self.user / "rc", '/\n    terminal=false\n    show_hidden=false\n')
        put(self.user / "etc/profile", "export FROM_PROFILE=shared-profile\n")
        project = self.work / "My Project"
        put(project / ".yhwh/rc", '.\n    show_hidden=true\n')
        put(project / ".yhwh/etc/keys/f12", '#!/bin/sh\nprintf "key from %s\\n" "$FROM_PROFILE"\n', 0o755)
        put(project / ".local-note", "hidden by parent\n")
        put(project / "note.md", "# Shared note\n")
        tty = self.launch()
        tty.send(b":cd My Project\r")
        tty.shows(".local-note")
        tty.send(b"\x1b[24~")
        tty.shows("key from shared-profile")
        tty.send(b"q")
        self.command(tty, "Focus terminal")
        tty.shows("Shell 1")
        tty.send(b'printf "%s|%s\\n" "$FROM_PROFILE" "${PWD##*/}"\r')
        tty.exact_line("shared-profile|My Project")
        self.command(tty, "Need Some Help?", b"\x1bp")
        tty.send(b"God\r")
        tty.shows("[God]")
        tty.shows("extra/")
        tty.send(b"G\r")
        tty.shows("shared world overlay")
        self.command(tty, "Leave world")
        tty.shows("My Project")
        self.command(tty, "Books · Sinai")
        # Select the link by title and observe the argument supplied to the browser.
        tty.shows("Genesis")
        tty.send(b"Genesis\r")
        tty.wait_for(lambda _: self.opened.is_file())
        self.assertEqual(self.opened.read_text().strip(), "https://example.org/genesis")
        self.command(tty, "Piece offering")
        tty.shows("File to offer")
        tty.send(b"\x15note.md\r")
        tty.shows("Email draft")
        tty.shows("File to attach")
        tty.send(b"\x1bg")
        tty.shows("Open draft in mail client")
        tty.send(b"Open draft in mail client\r")
        tty.wait_for(lambda _: self.opened.read_text().startswith("mailto:"))
        self.command(tty, "Inbox")
        tty.shows("Back to workspace")
        tty.shows("I came down to look")
        tty.send(b"I came down to look\r")
        tty.shows("Shell letter")
        tty.shows("v In the Margins, Literary sources")
        tty.shows("> From We The Nameless: Genesis 18:20")
        tty.shows("> From We The Nameless: Genesis 18:21")
        tty.send(b"\x1bg")
        tty.shows("Reading actions")
        tty.send(b"From We The Nameless: Genesis 18:20\r")
        tty.shows("Ok so YHWH mentions that Sodom and Gomorrah are:")
        tty.send(b"\r")
        tty.wait_for(lambda lines: any("> From We The Nameless: Genesis 18:20" in line for line in lines)
                     and all("Ok so YHWH mentions" not in line for line in lines))
        self.command(tty, "Settings")
        tty.send(b"Browse console fonts\r")
        tty.shows("Terminal device: /dev/pts/")
        tty.send(F10)
        tty.wait_exit()

    def test_settings_write_directory_scope_and_chat_uses_a_program(self):
        note = put(self.work / ".hidden", "hidden initially\n")
        put(self.user / "rc", '/\n    show_hidden=false\n')
        backend = put(self.work.parent / "reply", "#!/bin/sh\ncat >/dev/null\nprintf 'Reply for %s\\n' \"${PWD##*/}\"\n", 0o755)
        prefix = Path(self.env["SHADDAI_PREFIX"])
        put(prefix / "etc/config.toml", f'[agent]\nbackend="command"\ncommand=[{json.dumps(str(backend))}]\n')
        tty = self.launch()
        self.command(tty, "Settings")
        tty.shows("Files and editor")
        tty.send(b"Files and editor\r")
        tty.shows("Show hidden files")
        tty.send(b"Show hidden files\r")
        tty.shows("Show hidden files")
        tty.send(b"\x15true\r")
        tty.shows("Apply settings to")
        tty.send(os.fsencode(self.work) + b"\r")
        tty.shows(note.name)
        self.assertIn(f"\n{self.work}\n    show_hidden=true\n", (self.user / "rc").read_text())
        self.command(tty, "Conversation")
        tty.shows("Write to YHWH")
        tty.send(b"Write to YHWH\r")
        tty.shows("Message")
        tty.send(b"Hello Abe\r")
        tty.shows("Reply received")
        self.command(tty, "Conversation")
        tty.send(b"Read conversation\r")
        tty.shows("Reply for work")
        tty.send(F10)
        tty.wait_exit()

    def test_autosave_updates_disk_and_stops_on_external_edit(self):
        put(self.user / "rc", '/\n    autosave=true\n')
        note = put(self.work / "notes.md", "# Note\r\n")
        note.write_bytes(b"# Note\r\n")
        tty = self.launch(args=[note])
        tty.send(b"First ")
        tty.wait_for(lambda _: note.read_bytes() == b"First # Note\r\n")
        note.write_bytes(b"external\r\n")
        tty.send(b"Second ")
        tty.shows("Changed on disk.")
        self.assertEqual(note.read_bytes(), b"external\r\n")
        tty.send(F10)
        tty.shows("Discard unsaved edits")
        tty.send(b"y\r")
        tty.wait_exit()

    def test_open_from_the_embedded_shell_routes_to_the_same_workspace_tab(self):
        with TemporaryDirectory() as temp, socket.socket(socket.AF_UNIX) as probe:
            try:
                probe.bind(str(Path(temp) / "open.sock"))
            except PermissionError as error:
                self.skipTest(f"Unix socket bind is restricted: {error}")
        put(self.user / "rc", '/\n    terminal=true\n')
        note = put(self.work / "a note.md", "# Opened through the socket\n")
        tty = self.launch()
        self.command(tty, "Focus terminal")
        tty.shows("Shell 1")
        tty.send(shlex.join([str(LAUNCHER), str(note)]).encode() + b"\r")
        tty.shows("# Opened through the socket")
        tty.shows("Shell 1")
        tty.send(b"\x1b]")  # one workspace tab still exists
        tty.shows("# Opened through the socket")
        tty.send(F10)
        tty.wait_exit()

    def test_console_font_picker_restores_snapshot_on_cancel(self):
        root = self.work
        helper = LAUNCHER.with_name("shaddai-fonts")
        log = root / "setfont.log"
        put(root / "fake-bin/tty", "#!/bin/sh\necho /dev/tty9\n", 0o755)
        put(root / "fake-bin/setfont", """#!/bin/sh
printf '%s\\n' "$*" >> "$FONT_TEST_LOG"
if [ "$3" = "-O" ]; then
    printf snapshot > "$4"
fi
""", 0o755)
        first = put(root / "fonts/First.psf", "")
        second = put(root / "more-fonts/Second.psf", "")
        tty = WorkspaceTTY(root, launch=helper, args=["--initial", "Second.psf", first.parent, second.parent],
                           env={"PATH": f"{root}/fake-bin:{os.environ['PATH']}", "FONT_TEST_LOG": str(log)})
        self.addCleanup(tty.close)
        tty.shows("Second.psf")
        tty.send(b"p")
        tty.shows("First.psf")
        tty.send(b"q")
        tty.wait_exit()
        commands = log.read_text().splitlines()
        self.assertIn("-O", commands[0])
        self.assertTrue(commands[1].endswith(str(second)))
        self.assertTrue(commands[2].endswith(str(first)))
        self.assertTrue(commands[3].endswith("original.psf"))
