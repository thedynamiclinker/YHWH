const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createReview } = require("./review-fixture.cjs");
const { invoke } = require("../app/review.cjs");
const { parsePair, nextPair } = require("../app/circus.cjs");
const { answer } = require("../app/thwh.cjs");
const dataDirectory = require("../app/thwh-profile.cjs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

test("Both Make launch paths select the Dawkins Electron theme", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dawkins-launch-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, "electron");
  const capture = path.join(directory, "launch.json");
  await fs.writeFile(executable, '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.LAUNCH_CAPTURE, JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
  const appRoot = path.resolve(__dirname, "..");
  const makefile = path.join(appRoot, "../Makefile");
  // Also exercise -f from outside the checkout: paths belong to the Makefile.
  for (const cwd of [path.dirname(makefile), directory]) for (const target of ["run-thwh", "run-yhwh"]) {
    await promisify(execFile)("make", ["-f", makefile, target, "THEME=dawkins", `REVIEW_ROOT=${directory}`], {
      cwd,
      env: { ...process.env, YHWH_ELECTRON: executable, THWH_DATA_DIR: path.join(directory, "profile"), LAUNCH_CAPTURE: capture },
    });
    const args = JSON.parse(await fs.readFile(capture, "utf8"));
    assert.equal(args[0], path.resolve(__dirname, ".."));
    assert.equal(args[args.indexOf("--theme") + 1], "dawkins");
    assert.equal(args.includes("--thwh"), target === "run-thwh");
  }
});

test("The launcher defaults to the caller's directory", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "thwh-launch-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const executable = path.join(directory, "electron");
  const capture = path.join(directory, "launch.json");
  await fs.writeFile(executable, '#!/usr/bin/env node\nrequire("node:fs").writeFileSync(process.env.LAUNCH_CAPTURE, JSON.stringify(process.argv.slice(2)));\n', { mode: 0o755 });
  const env = { ...process.env, YHWH_ELECTRON: executable, THWH_DATA_DIR: path.join(directory, "profile"), LAUNCH_CAPTURE: capture };
  delete env.YHWH_REVIEW_ROOT;
  await promisify(execFile)(path.resolve(__dirname, "../bin/thwh"), [], { cwd: directory, env });
  const args = JSON.parse(await fs.readFile(capture, "utf8"));
  assert.equal(args[args.indexOf("--root") + 1], directory);
});

test("The spelling correction retains the existing profile, workspace and assistant history", async t => {
  const config = await fs.mkdtemp(path.join(os.tmpdir(), "thwh-profile-"));
  t.after(() => fs.rm(config, { recursive: true, force: true }));
  const old = path.join(config, "TWHW");
  await fs.mkdir(old);
  const settings = { energy: 50, messages: [{ content: "Keep this conversation." }] };
  await fs.writeFile(path.join(old, "twhw.json"), JSON.stringify(settings));
  await fs.writeFile(path.join(old, "review.json"), JSON.stringify({ root: "/my/review" }));
  const directory = dataDirectory({ XDG_CONFIG_HOME: config });
  assert.equal(directory, path.join(config, "THWH"));
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, "thwh.json"), "utf8")), settings);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, "review.json"), "utf8")), { root: "/my/review" });
  assert.equal(dataDirectory({ XDG_CONFIG_HOME: config }), directory);
  await assert.rejects(fs.access(old));
});

test("Existing corrected profiles and explicit overrides take precedence without losing old data", async t => {
  const config = await fs.mkdtemp(path.join(os.tmpdir(), "thwh-profile-"));
  t.after(() => fs.rm(config, { recursive: true, force: true }));
  const directory = path.join(config, "THWH");
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, "thwh.json"), '{"energy":100}');
  await fs.writeFile(path.join(directory, "twhw.json"), '{"energy":0}');
  assert.equal(dataDirectory({ XDG_CONFIG_HOME: config }), directory);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, "thwh.json"), "utf8")).energy, 100);
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, "twhw.json"), "utf8")).energy, 0);
  const custom = path.join(config, "custom");
  await fs.mkdir(custom);
  await fs.writeFile(path.join(custom, "twhw.json"), '{"energy":50}');
  assert.equal(dataDirectory({ XDG_CONFIG_HOME: config, TWHW_DATA_DIR: custom }), custom);
  assert.equal(JSON.parse(await fs.readFile(path.join(custom, "thwh.json"), "utf8")).energy, 50);
  assert.equal(dataDirectory({ THWH_DATA_DIR: directory, TWHW_DATA_DIR: custom }), directory);
});

test("THWH resumes a prepared workspace's file layout, screen, content-addressed read markers and editor drafts", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "thwh-shared-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createReview(root);
  await fs.mkdir(path.join(root, "The Review"));
  await fs.rename(path.join(root, "Kanbun.md"), path.join(root, "The Review/The Board.md"));
  await fs.writeFile(path.join(root, "The Review/The Task.md"), "# The actual task\nInspect one change.\n");
  let view = await invoke(root, "read");
  assert.equal(view.paths.master, "The Review/The Accepted Rounds.md");
  assert.match(view.board, /User task/);
  await assert.rejects(fs.access(path.join(root, ".review/state.json")));
  view = await invoke(root, "start");
  const first = view.hunks[0].id;
  view = await invoke(root, "next");
  assert.equal(view.hunks[0].seen, true);
  view = await invoke(root, "position", { screen: { page: 5, offset: 8, document: "The Review/The Task.md" } });
  assert.match(view.document, /actual task/);
  await assert.rejects(invoke(root, "position", { screen: { page: 5, document: "../../private" } }), /Invalid review position/);
  await invoke(root, "draft", { key: "Teams message", text: "A deliberately unfinished handoff." });
  await invoke(root, "pause");
  view = await invoke(root, "start");
  assert.equal(view.screen.offset, 8);
  assert.equal(view.hunk, 1);
  assert.equal(view.drafts["Teams message"], "A deliberately unfinished handoff.");
  await assert.rejects(invoke(root, "accept"), /unfinished editor text/);
  view = await invoke(root, "save-field", { key: "Teams message", text: view.drafts["Teams message"] });
  assert.deepEqual(view.drafts, {});
  view = await invoke(root, "save-patch", { repo: "alpha", patch: view.patches["alpha"].replace("+first change", "+revised first change") });
  assert.notEqual(view.hunks[0].id, first);
  assert.equal(view.hunks[0].seen, false);
  view = await invoke(root, "accept");
  assert.match(view.master, /deliberately unfinished handoff/);
  assert.match(view.board, /\[x\] \[R01\]/);
  await assert.rejects(fs.access(path.join(root, "MASTER.md")));
  await assert.rejects(fs.access(path.join(root, "Kanbun.md")));
});

test("A requested change consumes its saved note draft and still needs resolution", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "thwh-notes-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createReview(root);
  await invoke(root, "draft", { key: "comment", text: "Please preserve the input type." });
  const view = await invoke(root, "reject", { text: "Please preserve the input type.", onHunk: false });
  assert.deepEqual(view.drafts, {});
  assert.equal(view.comments[0].anchor, null);
  await assert.rejects(invoke(root, "accept"), /Changes are requested/);
});

test("The Circus uses the original site's pairing, entity-decoded caption and share permalink", async () => {
  const html = '<div class="comic"><img src="/img/141.gif" /></div><div class="quote">A &amp; B &#8212; C</div><a href="/perm.php?c=141&amp;q=253">Share</a>';
  assert.deepEqual(parsePair(html), { image: "/img/141.gif", quote: "A & B — C", permalink: "https://nietzschefamilycircus.com/perm.php?c=141&q=253" });
  const requests = [];
  const pair = await nextPair(async url => {
    requests.push(url);
    return requests.length === 1 ? { ok: true, text: async () => html } : { ok: true, arrayBuffer: async () => Buffer.from("GIF89a") };
  });
  assert.match(pair.image, /^data:image\/gif;base64,/);
  assert.equal(requests[1], "https://nietzschefamilycircus.com/img/141.gif");
  assert.throws(() => parsePair('<script>changed site</script>'), /changed its page format/);
});

test("Nietzsche and dawkins share plain assistant behavior; YHWH retains its source persona", async () => {
  for (const energy of [0, 50, 100]) {
    let prompt;
    const settings = { energy, mode: "codex", messages: [] };
    const result = await answer({ root: "/review", round: { id: "R01" }, hunks: [], comments: [] }, settings, "What changed?", async messages => {
      prompt = messages[0].content; return "Inspect the actual patch.";
    });
    assert.equal(result, "Inspect the actual patch.");
    assert.equal(settings.messages.length, 2);
    assert.equal(settings.messages[0].energy, energy);
    if (energy === 100) assert.match(prompt, /Yahweh|YHWH/);
    else assert.match(prompt, /without religious imagery/);
  }
});

test("Practice replies say they cannot answer questions and name the pending action", async () => {
  const settings = { energy: 100, mode: "offline", messages: [] };
  const content = await answer({ root: "/practice", tutorial: { active: true, step: 0,
    lessons: [{ text: "Read the patch.", waiting: "Open Diff." }] } }, settings,
  "Why does this code work?", () => assert.fail("Practice must not call a model"));
  assert.match(content, /haven't answered your question/);
  assert.match(content, /Waiting for: Open Diff/);
});
