const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { createReview } = require("./review-fixture.cjs");
const { invoke, Review } = require("../app/review.cjs");
const { git } = require("../app/repository.cjs");

test("Desktop and CLI share hunk position, anchored feedback, revisions, and paired acceptance", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-review-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plan = await createReview(root);
  let view = await invoke(root, "read");
  assert.equal(view.round.id, "R01");
  assert.equal(view.hunks.length, 4);
  await assert.rejects(fs.access(path.join(root, ".review/state.json")));
  view = await invoke(root, "start", { revision: view.revision });
  view = await invoke(root, "next");
  assert.equal(view.hunk, 1);
  view = await invoke(root, "comment", { text: "Preserve this edge case." });
  assert.match(view.comments[0].anchor, /alpha:.*@@ -47/);
  const outdated = view.revision;
  view = await invoke(root, "reject", { text: "Please make the first change clearer." });
  assert.equal(view.active, false);
  assert.equal(view.status, "changes_requested");
  await assert.rejects(invoke(root, "accept"), /Changes are requested/);
  await assert.rejects(invoke(root, "save-patch", { revision: outdated, repo: "alpha", patch: "bad" }), /review changed/);
  const copy = Object.fromEntries(["title", "teams", "mr_title", "descriptions", "validation"].map((key) => [key, view.round[key]]));
  copy.teams = "A revised final message.";
  view = await invoke(root, "save-copy", { copy });
  view = await invoke(root, "save-patch", { repo: "alpha", patch: view.patches["alpha"].replace("+first change", "+revised first change") });
  assert.equal(view.hunk, 0);
  const execute = promisify(execFile);
  const cli = path.join(__dirname, "../bin/review");
  await execute("python3", [cli, "--root", root, "resolve"]);
  view = await invoke(root, "read");
  assert.equal(view.status, "review");
  await invoke(root, "pause");
  assert.equal((await invoke(root, "read")).hunk, 0);
  await invoke(root, "start");
  view = await invoke(root, "accept", { roundId: "R01" });
  assert.equal(view.round.id, "R02");
  assert.match(view.master, /A revised final message/);
  assert.doesNotMatch(view.master, /Preserve this edge case/);
  assert.match(view.board, /- \[x\] \[R01\]/);
  assert.match(view.board, /User task/);
  assert.match(await git(path.join(root, "alpha"), ["show", "master:value.txt"]), /revised first change/);
  for (const name of Object.keys(plan.repositories)) {
    assert.equal(await git(path.join(root, name), ["branch", "--show-current"]), "mistress");
    assert.equal(await git(path.join(root, name), ["status", "--porcelain"]), "");
  }
  await assert.rejects(invoke(root, "accept", { roundId: "R01" }), /current round changed/);
  view = await invoke(root, "accept", { roundId: "R02" });
  assert.equal(view.round, null);
  assert.equal(view.active, false);
});

test("An invalid patch in the second repository leaves both master branches unchanged", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-review-invalid-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plan = await createReview(root);
  await invoke(root, "start");
  await invoke(root, "save-patch", { repo: "beta", patch: "Invalid patch\n" });
  await assert.rejects(invoke(root, "accept"), /patch|valid/i);
  for (const name of Object.keys(plan.repositories))
    assert.equal(await git(path.join(root, name), ["rev-parse", "master"]), plan.repositories[name].base);
});

test("Workspace selection persists and the process boundary rejects unsupported actions", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-review-choice-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await createReview(root);
  const preferences = path.join(root, "preferences.json");
  const review = new Review(preferences, "/missing");
  await review.choose(root);
  const reopened = new Review(preferences, "/missing");
  await reopened.load();
  if (!process.env.YHWH_REVIEW_ROOT) assert.equal(reopened.root, root);
  assert.equal((await reopened.act("read")).round.id, "R01");
  await assert.rejects(invoke(root, "shell"), /Unknown review action/);
  await assert.rejects(invoke(path.join(root, "missing"), "read"), /No prepared review/);
  await assert.rejects(invoke(root, "save-patch", { repo: "../escape", patch: "diff" }), /Choose a repository/);
});

test("Reading or pausing cannot recover a pending acceptance; resuming recovers only that round", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-review-journal-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plan = await createReview(root);
  await fs.writeFile(path.join(root, ".review/state.json"), JSON.stringify({
    rounds: {}, pending: {
      round: "R01", at: new Date().toISOString(),
      before: Object.fromEntries(Object.entries(plan.repositories).map(([name, meta]) => [name, meta.base])),
      after: plan.rounds[0].commits,
    },
  }));
  const initial = await invoke(root, "read");
  assert.equal(initial.pending, true);
  await invoke(root, "pause");
  for (const name of Object.keys(plan.repositories))
    assert.equal(await git(path.join(root, name), ["rev-parse", "master"]), plan.repositories[name].base);
  const paused = await invoke(root, "read");
  const resumed = await invoke(root, "start", { revision: paused.revision });
  assert.equal(resumed.pending, false);
  assert.equal(resumed.round.id, "R02");
  assert.equal(resumed.status, "review");
  for (const name of Object.keys(plan.repositories))
    assert.equal(await git(path.join(root, name), ["rev-parse", "master"]), plan.rounds[0].commits[name]);
});
