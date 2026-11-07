const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { Workspace } = require("../src/workspace.cjs");
const {
  git,
  createDemo,
  hunks,
  selectedPatch,
} = require("../src/repository.cjs");

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const workspace = new Workspace(path.join(directory, "data"));
  await workspace.load();
  const company = workspace.state.companies[0];
  return {
    workspace,
    directory,
    company,
    first: company.proposals[0],
    repo: workspace.repoPath(company.repositories[0].id),
  };
}

test("The example prepares every draft commit before the first review", async (t) => {
  const { workspace, company, repo } = await setup(t);
  assert.equal(company.proposals.length, 4);
  assert.equal(await git(repo, ["branch", "--show-current"]), "master");
  assert.equal(
    await git(repo, ["rev-parse", "master"]),
    await git(repo, ["rev-parse", "main"]),
  );
  assert.equal(await git(repo, ["rev-list", "--count", "main..mistress"]), "4");
  assert.ok(
    company.proposals.every(
      (p) => p.sourceCommit && p.patch.startsWith("diff --git"),
    ),
  );
  assert.equal(workspace.view().destinations.length, 3);
});

test("Approving every small round preserves the entire prepared draft tree", async (t) => {
  const { workspace, company, repo } = await setup(t);
  for (const proposal of company.proposals) {
    await workspace.act("rehearse", { proposalId: proposal.id });
    await workspace.act("approve", { proposalId: proposal.id });
  }
  assert.equal(await git(repo, ["diff", "mistress", "master"]), "");
  assert.equal(await git(repo, ["rev-list", "--count", "main..master"]), "4");
  assert.equal(
    workspace.state.companies[0].proposals.filter(
      (p) => p.status === "approved",
    ).length,
    4,
  );
});

test("Feedback becomes the final handoff; the rehearsal transcript does not", async (t) => {
  const { workspace, company, first, repo, directory } = await setup(t);
  await workspace.act("rehearse", { proposalId: first.id });
  assert.equal(first.rehearsals[0].reactions.length, company.people.length);
  await workspace.act("feedback", {
    proposalId: first.id,
    personId: company.people[0].id,
    content: "Keep the current runtime unchanged.",
  });
  await workspace.act("editProposal", {
    proposalId: first.id,
    evidence:
      "Reviewed the two removed pins. Runtime comparisons remain unverified.",
  });
  await workspace.act("revise", { proposalId: first.id });
  assert.match(first.drafts.chat, /Keep the current runtime unchanged/);
  await workspace.act("approve", { proposalId: first.id });
  assert.equal(first.status, "approved");
  assert.equal(
    await git(repo, ["show", "HEAD:requirements.txt"]),
    "requests\nrich",
  );
  assert.equal(await git(repo, ["rev-list", "--count", "main..master"]), "1");
  assert.equal(await git(repo, ["rev-list", "--count", "main..mistress"]), "4");
  const handoff = workspace.master(company.id);
  assert.match(handoff, /Keep the current runtime unchanged/);
  assert.doesNotMatch(handoff, /played by you|REHEARSAL 1|Alex:/);
  assert.match(workspace.kanbun(company.id), /\[x\] Let the environment/);
  const exported = await workspace.export(company.id, directory);
  assert.equal(
    await fs.readFile(path.join(exported, "MASTER.md"), "utf8"),
    handoff,
  );
  assert.ok((await fs.readdir(exported)).some((f) => f.endsWith(".patch")));
  const reloaded = new Workspace(workspace.directory);
  await reloaded.load();
  assert.equal(
    reloaded.state.companies[0].proposals[0].approvedCommit,
    first.approvedCommit,
  );
  await assert.rejects(
    workspace.act("editProposal", {
      proposalId: first.id,
      title: "Rewrite history",
    }),
    /immutable/,
  );
});

test("Repository rounds must be approved in order, and a set-aside round can reopen", async (t) => {
  const { workspace, company, first } = await setup(t);
  const second = company.proposals[1];
  await workspace.act("rehearse", { proposalId: second.id });
  await assert.rejects(
    workspace.act("approve", { proposalId: second.id }),
    /preceding/,
  );
  await workspace.act("reject", { proposalId: first.id });
  assert.equal(workspace.state.companies[0].proposals[0].status, "rejected");
  await workspace.act("reopen", { proposalId: first.id });
  assert.equal(workspace.state.companies[0].proposals[0].status, "draft");
});

test("A malformed or entirely excluded patch cannot advance master or approve the round", async (t) => {
  const { workspace, first, repo } = await setup(t);
  await workspace.act("rehearse", { proposalId: first.id });
  const before = await git(repo, ["rev-parse", "HEAD"]);
  const all = hunks(first.patch).map((h) => h.id);
  await workspace.act("editProposal", {
    proposalId: first.id,
    excludedHunks: all,
  });
  await assert.rejects(
    workspace.act("approve", { proposalId: first.id }),
    /empty/,
  );
  assert.equal(await git(repo, ["rev-parse", "HEAD"]), before);
  await workspace.act("editProposal", {
    proposalId: first.id,
    patch: "not a patch",
  });
  await assert.rejects(
    workspace.act("approve", { proposalId: first.id }),
    /could not be committed/,
  );
  assert.equal(await git(repo, ["rev-parse", "HEAD"]), before);
  assert.equal(await git(repo, ["status", "--porcelain"]), "");
  assert.notEqual(workspace.state.companies[0].proposals[0].status, "approved");
});

test("Hunk decisions preserve shared file headers and omit only selected changes", () => {
  const patch =
    "diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n@@ -10 +10 @@\n-before\n+after\ndiff --git a/other b/other\n--- a/other\n+++ b/other\n@@ -1 +1 @@\n-a\n+b\n";
  assert.equal(hunks(patch).length, 3);
  assert.equal(selectedPatch(patch), patch);
  const selected = selectedPatch(patch, ["0:0"]);
  assert.match(selected, /--- a\/file\n\+\+\+ b\/file\n@@ -10/);
  assert.doesNotMatch(selected, /-old/);
  assert.match(selected, /diff --git a\/other/);
});

test("An arbitrary company can import committed work without touching the source", async (t) => {
  const { workspace, directory } = await setup(t);
  const source = path.join(directory, "source");
  await createDemo(source);
  await fs.writeFile(
    path.join(source, "uncommitted.txt"),
    "not part of the review",
  );
  const head = await git(source, ["rev-parse", "HEAD"]);
  const refs = await git(source, ["show-ref"]);
  const status = await git(source, ["status", "--porcelain"]);
  await workspace.act("createCompany", {
    name: "A Tiny Bakery",
    goal: "Make delivery changes easy to review.",
    context: "Three people and one oven.",
  });
  const company = workspace.state.companies.at(-1);
  await workspace.import(company.id, source, "main", "mistress");
  assert.equal(company.proposals.length, 4);
  await workspace.act("rehearse", {
    companyId: company.id,
    proposalId: company.proposals[0].id,
  });
  await workspace.act("approve", {
    companyId: company.id,
    proposalId: company.proposals[0].id,
  });
  assert.equal(await git(source, ["rev-parse", "HEAD"]), head);
  assert.equal(await git(source, ["show-ref"]), refs);
  assert.equal(await git(source, ["status", "--porcelain"]), status);
  assert.match(
    await fs.readFile(path.join(source, "requirements.txt"), "utf8"),
    /==/,
  );
});

test("Communication rounds and independent tasks work without a repository", async (t) => {
  const { workspace } = await setup(t);
  await workspace.act("createCompany", {
    name: "Something Else",
    goal: "Shorter meetings.",
  });
  const company = workspace.state.companies.at(-1);
  await workspace.act("createProposal", {
    title: "Try an agenda",
    summary: "Write the decision we need before the meeting.",
  });
  const proposal = company.proposals[0];
  await workspace.act("rehearse", { proposalId: proposal.id });
  await workspace.act("approve", { proposalId: proposal.id });
  assert.equal(proposal.approvedCommit, undefined);
  assert.match(workspace.master(company.id), /Try an agenda/);
  await workspace.act("addTask", { title: "Ask for a sample agenda" });
  await workspace.act("moveTask", {
    taskId: company.tasks[0].id,
    status: "approved",
  });
  assert.equal(company.tasks[0].status, "approved");
});

test("A failed persistence write rolls an approval back, including its Git commit", async (t) => {
  const { workspace, first, repo } = await setup(t);
  await workspace.act("rehearse", { proposalId: first.id });
  const before = await git(repo, ["rev-parse", "HEAD"]);
  const save = workspace.save.bind(workspace);
  workspace.save = async () => {
    throw new Error("Disk unavailable");
  };
  await assert.rejects(
    workspace.act("approve", { proposalId: first.id }),
    /Disk unavailable/,
  );
  workspace.save = save;
  assert.equal(await git(repo, ["rev-parse", "HEAD"]), before);
  assert.notEqual(workspace.state.companies[0].proposals[0].status, "approved");
  await workspace.act("approve", { proposalId: first.id });
  assert.equal(workspace.state.companies[0].proposals[0].status, "approved");
});

test("A crash between a rehearsal commit and workspace save recovers on restart", async (t) => {
  const { workspace, company, first, repo } = await setup(t);
  const before = await git(repo, ["rev-parse", "HEAD"]);
  await fs.writeFile(
    path.join(workspace.directory, "pending-approval.json"),
    JSON.stringify({
      repoId: company.repositories[0].id,
      proposalId: first.id,
      before,
    }),
  );
  await fs.writeFile(path.join(repo, "crash.txt"), "unrecorded");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "Interrupted approval"]);
  const recovered = new Workspace(workspace.directory);
  await recovered.load();
  assert.equal(await git(repo, ["rev-parse", "HEAD"]), before);
  assert.equal(recovered.state.companies[0].proposals[0].status, "draft");
});

test("The local model boundary receives the character evidence and supports chat, reviews and revisions", async (t) => {
  const { workspace, company, first } = await setup(t);
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    requests.push(input);
    let content = "Let me come down and inspect that diff.";
    if (input.format === "json") {
      content = input.messages[0].content.startsWith("Simulate")
        ? JSON.stringify({
            reactions: company.people.map((p) => ({
              personId: p.id,
              content: "Show the evidence for this specific change.",
              verdict: "concern",
            })),
          })
        : JSON.stringify({
            chat: "A small improvement for review.",
            mail: "Subject: Small change\nPlease review.",
            forge: "Small change\nVerification remains pending.",
          });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ message: { content } }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(11434, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await workspace.act("settings", { mode: "ollama", model: "boundary-test" });
  await workspace.act("chat", {
    message: "Inspect this proposal",
    proposalId: first.id,
  });
  assert.match(company.messages.at(-1).content, /inspect that diff/);
  assert.match(requests[0].messages[0].content, /Gen 18:21/);
  await workspace.act("rehearse", { proposalId: first.id });
  assert.equal(first.rehearsals[0].mode, "ollama");
  await workspace.act("revise", { proposalId: first.id });
  assert.equal(first.drafts.chat, "A small improvement for review.");
  assert.equal(requests.length, 3);
});
