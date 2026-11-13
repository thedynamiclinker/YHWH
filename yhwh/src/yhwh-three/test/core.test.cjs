const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { parseConfig, loadConfig } = require("../app/config.cjs");
const files = require("../app/files.cjs");
const { openTerminal } = require("../app/terminal.cjs");
async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-three-test-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
async function put(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 7000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await pause(50);
  }
  throw new Error("Timed out");
}

test("rc and rc.three are one Bash session, with functions, conditionals and per-file scope", async (t) => {
  const home = await fixture(t),
    system = path.join(home, "etc"),
    xdg = path.join(home, ".config"),
    target = path.join(home, "notes");
  await fs.mkdir(target);
  await fs.mkdir(system);
  await put(
    path.join(system, "rc"),
    '/\n    title=System\n    theme=dawkins\n    choose() { printf "%s" "$1"; }\n',
  );
  await put(
    path.join(xdg, "yhwh/rc"),
    '/\n    title="$(choose Shared)"\n    font_size=17\n',
  );
  await put(
    path.join(xdg, "yhwh/rc.three"),
    '/\n    if [[ $theme != dawkins ]]; then\n        theme=yhwh\n    fi\n    title="$title 3D"\n',
  );
  await put(path.join(target, ".yhwh/rc"), '.\n    title="$title Local"\n');
  const result = await loadConfig(target, { home, system, xdg });
  assert.equal(result.values.title, "Shared 3D Local");
  assert.equal(result.values.theme, "dawkins");
  assert.equal(result.values.font_size, "17");
  assert.equal(result.files.length, 4);
});
test("headers are existing paths, never commands; variables and spaces are literal", async (t) => {
  const root = await fixture(t),
    folder = path.join(root, "space and $dollars");
  await fs.mkdir(folder);
  const blocks = await parseConfig(
    "$PLACE\n    title=okay",
    "rc",
    root,
    folder,
    { PLACE: folder },
  );
  assert.equal(blocks[0].scope, folder);
  assert.ok(blocks[0].matches);
  await assert.rejects(
    parseConfig("echo hacked\n    title=bad", "rc", root, root),
    /does not exist/,
  );
  await assert.rejects(
    parseConfig("$(touch hacked)\n    title=bad", "rc", root, root),
    /cannot contain shell/,
  );
  await assert.rejects(
    parseConfig("$MISSING\n    title=bad", "rc", root, root, {}),
    /Unknown environment/,
  );
  await assert.rejects(
    parseConfig("    title=bad", "rc", root, root),
    /path header/,
  );
});
test("matching directories use path boundaries and exact file scopes do not affect siblings", async (t) => {
  const root = await fixture(t);
  await put(path.join(root, "note"), "hello");
  await fs.mkdir(path.join(root, "notes"));
  const blocks = await parseConfig(
    `${path.join(root, "note")}\n    theme=dawkins`,
    "rc",
    root,
    path.join(root, "notes"),
  );
  assert.equal(blocks[0].matches, false);
});
test("indented Bash supports heredocs, and absent config directories are ordinary", async (t) => {
  const root = await fixture(t);
  await put(
    path.join(root, ".yhwh/rc"),
    ".\n    title=$(cat <<END\n    three dimensions\n    END\n    )\n",
  );
  const result = await loadConfig(root, {
    home: root,
    system: path.join(root, "absent"),
    xdg: path.join(root, "absent-xdg"),
  });
  assert.equal(result.values.title, "three dimensions");
});
test("file detection respects content and saves reject a changed disk version", async (t) => {
  const root = await fixture(t);
  const script = path.join(root, "boop");
  await put(script, '#!/usr/bin/env python3\nprint("hello")\n');
  const data = await files.read(script);
  assert.equal(data.language, "Python");
  await files.save({ ...data, text: 'print("changed")\n' });
  assert.equal(await fs.readFile(script, "utf8"), 'print("changed")\n');
  await assert.rejects(
    files.save({ ...data, text: "stale" }),
    /changed on disk/,
  );
  const plain = await files.create(root, "extensionless");
  assert.equal((await files.read(plain)).language, "Plain text");
  await assert.rejects(files.create(root, "extensionless"), { code: "EEXIST" });
});
test("renaming never overwrites a destination and saves preserve symlink identity", async (t) => {
  const root = await fixture(t);
  const a = path.join(root, "a"),
    b = path.join(root, "b"),
    link = path.join(root, "link");
  await put(a, "a");
  await put(b, "b");
  await assert.rejects(files.rename(a, b), /already exists/);
  assert.equal(await fs.readFile(b, "utf8"), "b");
  await fs.symlink(a, link);
  const data = await files.read(link);
  await files.save({ ...data, text: "new" });
  assert.ok((await fs.lstat(link)).isSymbolicLink());
  assert.equal(await fs.readFile(a, "utf8"), "new");
});
test("real PTY reports shell cd and applies browser navigation between commands", async (t) => {
  const root = await fixture(t),
    other = path.join(root, "other directory");
  await fs.mkdir(other);
  const events = [];
  const term = await openTerminal(root, root, "test", (event) =>
    events.push(event),
  );
  t.after(() => term.close());
  await until(() => events.some((e) => e.type === "cwd" && e.data === root));
  term.write({ type: "input", data: "cd 'other directory'\r" });
  await until(() => events.some((e) => e.type === "cwd" && e.data === other));
  term.cd(root);
  await until(
    () =>
      events.filter((e) => e.type === "cwd" && e.data === root).length === 2,
  );
  term.write({ type: "input", data: "printf 'PTY_OK\\n'\r" });
  await until(() =>
    events.some(
      (e) =>
        e.type === "data" &&
        Buffer.from(e.data, "base64").toString().includes("PTY_OK"),
    ),
  );
});

test("relative asset values remain unchanged for Bash decisions in rc.three", async (t) => {
  const home = await fixture(t),
    xdg = path.join(home, ".config"),
    user = path.join(xdg, "yhwh");
  await put(path.join(user, "rc"), "/\n    bg=wall.png\n    title=unchanged\n");
  await put(
    path.join(user, "rc.three"),
    "/\n    if [[ $bg == wall.png ]]; then\n        title=preserved\n    fi\n",
  );
  const result = await loadConfig(home, {
    home,
    xdg,
    system: path.join(home, "absent"),
  });
  assert.equal(result.values.title, "preserved");
  assert.equal(result.values.bg, path.join(user, "wall.png"));
});
test("browser cd preserves a partly typed line and waits while a foreground command runs", async (t) => {
  const root = await fixture(t),
    other = path.join(root, "other");
  await fs.mkdir(other);
  const events = [];
  const term = await openTerminal(root, root, "busy", (event) =>
    events.push(event),
  );
  t.after(() => term.close());
  await until(() => events.some((e) => e.type === "cwd"));
  term.write({ type: "input", data: "printf PARTIAL_MARKER" });
  term.cd(other);
  await until(() => events.some((e) => e.type === "cwd" && e.data === other));
  term.write({ type: "input", data: "_KEPT\\n\r" });
  await until(() =>
    events.some(
      (e) =>
        e.type === "data" &&
        Buffer.from(e.data, "base64")
          .toString()
          .includes("PARTIAL_MARKER_KEPT"),
    ),
  );
  term.write({ type: "input", data: "sleep 0.4\r" });
  await pause(100);
  term.cd(root);
  await pause(150);
  assert.equal(events.filter((e) => e.type === "cwd").at(-1).data, other);
  await until(
    () => events.filter((e) => e.type === "cwd").at(-1).data === root,
  );
});
