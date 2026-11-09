const fs = require("node:fs/promises");
const path = require("node:path");
const { git } = require("./repository.cjs");
const { invoke } = require("./review.cjs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const exec = promisify(execFile);

const version = 2;
const initialMessage = "Clean things up.";
const lessons = [
  { title: "Let's read the damn patch", text: "I've made two tiny repos. We remove a version pin, replace a logging helper with Python's logging, and find a file beside the Python code. There's one JavaScript fix too. Click Read the patch in the middle, or press Enter outside an editor.", waiting: "Open Diff with Read the patch or Enter.",
    action: "position", page: 0, target: '[data-action="advance"]', complete: v => v.active && v.screen.page === 1 },
  { title: "Read the changes", text: "Read each hunk, then click Read · next or press Enter. The Python changes do one thing each. defaults.cjs uses ?? instead of || so a limit of 0 stays 0. JavaScript thinks zero needs replacing. Christ. A checkmark means you read it; Accept is a separate button.", waiting: "Mark every hunk read with Read · next. Jumping between files doesn't mark them read.",
    action: "next", page: 1, target: '[data-action="advance"]', complete: v => v.hunks.length > 0 && v.hunks.every(h => h.seen) },
  { title: "Put a comment on the code", text: "Pick a hunk on the left. Click Comment (c), write what you noticed, leave Comment on this hunk checked, and click Save comment. For example: “Zero is a real limit. Keep it.” I save the file and hunk with the comment so we know which code you mean.", waiting: "Save a comment with Comment on this hunk checked.",
    action: "comment", page: 3, target: '#review-note', complete: v => !!v.comments.at(-1)?.anchor },
  { title: "Tell me what's missing", text: "My message says “Clean things up.” Useless. What things? In Comments, write “Say which files changed and what you checked”, then click Request changes. That stops acceptance until you say the request is fixed.", waiting: "Write a request, then click Request changes.",
    action: "reject", page: 3, target: '[data-action="reject"]', complete: v => v.status === "changes_requested" },
  { title: "Say what changed", text: "Open Messages (3 or e). Replace the Message with something useful, then click Save below it or press Ctrl+S in that box. Typing keeps a draft. Save puts it in the review record. I check that you saved different text; I can't judge whether your explanation is right.", waiting: "Change the Message and click its Save button.", example: "Remove the rich pin, use Python logging, find words.txt beside words.py, and keep a JS limit of 0. Local checks passed; other dependency versions are untested.",
    action: "save-field", page: 2, target: '[data-editor="Teams message"]', complete: (v, input) => input.key === "Teams message" && v.round?.teams && v.round.teams.trim() !== initialMessage && !("Teams message" in v.drafts) },
  { title: "Does that answer the request?", text: "Read your new message. Does it say what changed and what ran? Go to Comments (4), then click Request fixed (r). That's your judgement. I don't secretly have a better answer. This lets you continue; it doesn't commit anything.", waiting: "Click Request fixed in Comments.",
    page: 3, target: '[data-action="resolve"]', complete: v => v.status === "review" },
  { title: "Accept the patches", text: "Click Accept… (a). Read the message, PR text, Checks, and branch names. Click Accept both patches (y). That makes a commit on master in each sample repo. Git checks that the patches apply; it doesn't run tests.", waiting: "Open Accept… and confirm with Accept both patches.",
    page: 2, target: '[data-action="accept"]', complete: v => !v.round },
  { title: "Find the commits", text: "Open Files (6), then Accepted changes. Your message, the checks, and both commit IDs are there. Ordinary text. You can read it, copy it, grep it. And we're done. Even I can finish a small job occasionally.", waiting: "Open Files → Accepted changes.",
    page: 5, target: 'nav [data-page="5"]', complete: v => v.screen.page === 5 && v.screen.record === "master" && !!v.master },
];

async function createPractice(root) {
  await fs.mkdir(path.dirname(root), { recursive: true });
  const staging = await fs.mkdtemp(root + "-");
  try {
    const round = { id: "R01", title: "Less setup. Same small programs.", teams: initialMessage,
      mr_title: "Use Python logging and find files beside the code", descriptions: {}, commits: {}, validation: "" };
    const plan = { repositories: {}, rounds: [round] };
    const samples = {
      "sample-tools": {
        before: { "requirements.txt": "rich==13.9.4\n", "run.py": 'from startup import start\n\n\ndef run():\n    start()\n    return "ready"\n', "startup.py": 'import logging\n\n\ndef start():\n    logging.basicConfig(level=logging.INFO)\n' },
        after: { "requirements.txt": "rich\n", "run.py": 'import logging\n\n\ndef run():\n    logging.basicConfig(level=logging.INFO)\n    return "ready"\n' },
        description: "Remove the exact rich version and replace the local startup helper with logging.basicConfig. run() still returns ready. Other rich versions haven't been installed or tested.",
      },
      "sample-files": {
        before: { "words.py": 'from pathlib import Path\n\n\ndef words():\n    return Path("words.txt").read_text().splitlines()\n', "words.txt": "cat\ngrep\ndiff\n", "defaults.cjs": 'module.exports = limit => limit || 10;\n' },
        after: { "words.py": 'from pathlib import Path\n\n\ndef words():\n    return Path(__file__).with_name("words.txt").read_text().splitlines()\n', "defaults.cjs": 'module.exports = limit => limit ?? 10;\n' },
        description: "Find words.txt beside words.py, even when Python starts in another directory. Use ?? in defaults.cjs so 0 stays 0; an absent limit still becomes 10. Apparently zero wasn't convincing enough for JavaScript.",
      },
    };
    for (const [name, sample] of Object.entries(samples)) {
      const repo = path.join(staging, name);
      await fs.mkdir(repo);
      await git(repo, ["init", "-b", "main"]);
      await git(repo, ["config", "user.name", "THWH practice"]);
      await git(repo, ["config", "user.email", "practice@example.invalid"]);
      await git(repo, ["config", "commit.gpgSign", "false"]);
      for (const [file, content] of Object.entries(sample.before)) await fs.writeFile(path.join(repo, file), content);
      await git(repo, ["add", "."]);
      await git(repo, ["commit", "-m", "Create the small programs"]);
      const base = await git(repo, ["rev-parse", "HEAD"]);
      await git(repo, ["branch", "master"]);
      await git(repo, ["checkout", "-b", "practice-change"]);
      for (const [file, content] of Object.entries(sample.after)) await fs.writeFile(path.join(repo, file), content);
      await git(repo, ["commit", "-am", round.title]);
      const source = await git(repo, ["rev-parse", "HEAD"]);
      round.commits[name] = source;
      round.descriptions[name] = sample.description;
      plan.repositories[name] = { base, source };
    }
    // Run the examples from outside their repos. The claim in Checks must be true.
    await exec(process.env.YHWH_PYTHON || "python3", ["-B", "-c", 'import sys; sys.path.insert(0, sys.argv[1]); from run import run; assert run() == "ready"', path.join(staging, "sample-tools")], { cwd: staging });
    await exec(process.env.YHWH_PYTHON || "python3", ["-B", "-c", 'import sys; sys.path.insert(0, sys.argv[1]); from words import words; assert words() == ["cat", "grep", "diff"]', path.join(staging, "sample-files")], { cwd: staging });
    const limit = require(path.join(staging, "sample-files/defaults.cjs"));
    if (limit(0) !== 0 || limit() !== 10 || limit(3) !== 3) throw new Error("The JavaScript limit check failed. Zero is still getting eaten. Dammit.");
    round.validation = "Ran Python checks from outside both repos: run() returned ready; words() read cat, grep, diff from words.txt. Ran JavaScript checks: 0 stays 0, 3 stays 3, and an absent limit becomes 10. Inspected requirements.txt: rich has no exact pin. No packages were downloaded; other dependency versions are untested. These checks ran when I made this sample. If you edit the patches, check them again.";
    await fs.mkdir(path.join(staging, ".review"));
    await fs.writeFile(path.join(staging, ".review/plan.json"), JSON.stringify(plan) + "\n");
    await fs.mkdir(path.join(staging, "The Review"));
    await fs.writeFile(path.join(staging, "The Review/The Board.md"), "# Practice board\n\n## Todo\n\n## In Progress\n\n## Review\n\n## Done\n");
    await fs.writeFile(path.join(staging, "The Review/The Task.md"), "# Practice task\n\nTwo repos. Four small changes. Remove a Python dependency pin, use standard logging, find a text file beside the Python code, and keep zero as a valid JavaScript limit.\n\nRead each hunk, save a comment, request a better message, save that message, mark the request fixed, then accept both patches. Find the commits in Files → Accepted changes.\n\nThe tutorial checks button presses and saved text. It does not grade your understanding. During practice, chat repeats the current instructions; it cannot read and answer your question.\n");
    await fs.rename(staging, root);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

// Practice calls the same review engine, always against its own repositories.
// The selected real workspace and its preferences never change when entering it.
class Tutorial {
  constructor(directory, review) {
    this.filename = path.join(directory, "tutorial.json");
    this.root = path.join(directory, "practice-review-python");
    this.review = review;
    this.state = { version, active: false, step: 0, completed: false, dismissed: false };
  }
  async load() {
    try {
      const saved = JSON.parse(await fs.readFile(this.filename, "utf8"));
      this.state = saved.version === version ? { ...this.state, ...saved } : { ...this.state, active: !!saved.active, dismissed: !!saved.dismissed };
      if (this.state.active) {
        try { await fs.access(path.join(this.root, ".review/plan.json")); }
        catch (error) { if (error.code !== "ENOENT") throw error; await createPractice(this.root); this.state.step = 0; this.state.completed = false; await this.save(); }
      }
      if (saved.version !== version) await this.save();
    }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  async save() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    await fs.writeFile(this.filename + ".tmp", JSON.stringify(this.state) + "\n");
    await fs.rename(this.filename + ".tmp", this.filename);
  }
  status() { return { ...this.state, lessons: lessons.map(({ action, complete, ...lesson }) => lesson) }; }
  async act(action, input = {}) {
    if (!this.state.active) return { ...await this.review.act(action, input), tutorial: this.status() };
    if ((action === "accept" && this.state.step < 6) || (action === "resolve" && this.state.step < 5))
      throw new Error(`I'm waiting for step ${this.state.step + 1}: ${lessons[this.state.step].waiting}`);
    const view = await invoke(this.root, action, input);
    const lesson = lessons[this.state.step];
    // Saved decisions and the record can also be recovered after a restart.
    if (lesson && (!lesson.action || lesson.action === action) && lesson.complete(view, input)) {
      this.state.step++;
      if (this.state.step === lessons.length) this.state.completed = true;
      await this.save();
    }
    return { ...view, tutorial: this.status() };
  }
  async choose(root) {
    const view = await this.review.choose(root);
    await this.leave();
    return { ...view, tutorial: this.status() };
  }
  async leave() {
    if (this.state.active) await invoke(this.root, "pause");
    this.state.active = false;
    this.state.dismissed = true;
    await this.save();
  }
  async control(action) {
    if (!["start", "leave", "restart", "skip"].includes(action)) throw new Error("Unknown practice action.");
    if (action === "skip" || action === "leave") await this.leave();
    else {
      if (action === "restart") {
        await this.leave();
        await fs.rm(this.root, { recursive: true, force: true });
        this.state.step = 0;
        this.state.completed = false;
      }
      try { await fs.access(path.join(this.root, ".review/plan.json")); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        await createPractice(this.root);
        this.state.step = 0;
        this.state.completed = false;
      }
      this.state.active = true;
      await this.save();
    }
    let view;
    try { view = await this.act("read"); }
    catch (error) { if (this.state.active) throw error; }
    return { view: view || null, tutorial: this.status() };
  }
}

module.exports = { Tutorial, createPractice };
