const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createReview } = require("./review-fixture.cjs");
const { invoke } = require("../src/review.cjs");
const { parsePair, nextPair } = require("../src/circus.cjs");
const { answer } = require("../src/twhw.cjs");

test("TWHW resumes a prepared workspace's file layout, screen, content-addressed read markers and editor drafts", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "twhw-shared-"));
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
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "twhw-notes-"));
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
