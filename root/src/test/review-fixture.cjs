const fs = require("node:fs/promises");
const path = require("node:path");
const { git } = require("../app/repository.cjs");

async function createReview(root) {
  await fs.mkdir(path.join(root, ".review"), { recursive: true });
  const plan = { repositories: {}, rounds: [1, 2].map((n) => ({
    id: `R0${n}`, title: `Small change ${n}`, teams: `A useful small change ${n}.`,
    mr_title: `Small change ${n}`, descriptions: {}, validation: "Disposable Git fixture.", commits: {},
  })) };
  for (const name of ["alpha", "beta"]) {
    const repo = path.join(root, name);
    await fs.mkdir(repo);
    await git(repo, ["init", "-b", "main"]);
    await git(repo, ["config", "user.name", "Review test"]);
    await git(repo, ["config", "user.email", "test@example.invalid"]);
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}\n`);
    await fs.writeFile(path.join(repo, "value.txt"), lines.join(""));
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "Base"]);
    const base = await git(repo, ["rev-parse", "HEAD"]);
    await git(repo, ["branch", "master"]);
    await git(repo, ["checkout", "-b", "mistress"]);
    for (const [index, round] of plan.rounds.entries()) {
      if (index === 0) { lines[1] = "first change\n"; lines[49] = "last change\n"; }
      else lines[24] = "second round\n";
      await fs.writeFile(path.join(repo, "value.txt"), lines.join(""));
      await git(repo, ["commit", "-am", round.title]);
      round.commits[name] = await git(repo, ["rev-parse", "HEAD"]);
      round.descriptions[name] = "An observable benefit.";
    }
    plan.repositories[name] = { base, source: plan.rounds.at(-1).commits[name] };
  }
  await fs.writeFile(path.join(root, ".review/plan.json"), JSON.stringify(plan));
  await fs.writeFile(path.join(root, "Kanbun.md"), "---\nkanban-plugin: board\n---\n\n## Todo\n\n- [ ] User task\n\n## In Progress\n\n## Review\n\n## Done\n\n%% kanban:settings\n{}\n%%\n");
  return plan;
}
module.exports = { createReview };
