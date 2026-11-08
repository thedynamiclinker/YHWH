const fs = require("node:fs/promises");
const path = require("node:path");
const { git } = require("./repository.cjs");
const { invoke } = require("./review.cjs");

const initialMessage = "Improve greetings.";
const lessons = [
  { title: "Open the change", text: "This practice fixes a greeting that says Hello, undefined! when a name is missing. Choose Begin this small step, or press Enter outside an editor, to open Diff.",
    page: 0, target: '[data-action="advance"]', complete: v => v.active && v.screen.page === 1 },
  { title: "Read both hunks", text: "A hunk is one piece of a change. Minus lines leave; plus lines arrive. Both sample apps should say Hello, friend! for a missing name. Read each hunk, then use Read · next (Enter). A checkmark records reading, not approval.",
    page: 1, target: '[data-action="advance"]', complete: v => v.hunks.length > 0 && v.hunks.every(h => h.seen) },
  { title: "Leave an anchored note", text: "Choose Note (c), write an observation such as “The fallback keeps missing names readable”, keep Attach to the displayed hunk checked, and Save note. Your note stays attached to this exact change.",
    page: 3, target: '#review-note', complete: v => v.comments.some(note => note.anchor) },
  { title: "Ask for a clearer handoff", text: "The Teams message only says “Improve greetings.” In Notes, write “Explain what happens when the name is missing”, then choose Request changes. A request holds the round until it is addressed.",
    page: 3, target: '[data-action="reject"]', complete: v => v.status === "changes_requested" },
  { title: "Make the handoff useful", text: "Open Messages (3 or e). Rewrite the Teams message to explain the fallback in both apps, then choose its Save field button or press Ctrl/Cmd+S in that field. Typing saves a draft; Save field finalizes it.",
    page: 2, target: '[data-editor="Teams message"]', complete: v => v.round?.teams && v.round.teams.trim() !== initialMessage && !("Teams message" in v.drafts) },
  { title: "Resolve your request", text: "Return to Notes (4), check your revised message answers the request, then choose Mark changes addressed (r). Resolving resumes review; it does not accept the change.",
    page: 3, target: '[data-action="resolve"]', complete: v => v.status === "review" },
  { title: "Accept the sample pair", text: "Choose Preview acceptance (a). Check the final message and validation, then explicitly accept in the preview (y). This adds a local commit to each sample repository. Your own review workspace is separate.",
    page: 2, target: '[data-action="accept"]', complete: v => !v.round },
  { title: "Find what you finished", text: "Open Context (6), then choose Accepted handoff. Find your revised Teams message and the two local commit IDs. This is the text and evidence you would use for a real handoff.",
    page: 5, target: 'nav [data-page="5"]', complete: v => v.screen.page === 5 && v.screen.record === "master" && !!v.master },
];

async function createPractice(root) {
  await fs.mkdir(path.dirname(root), { recursive: true });
  const staging = await fs.mkdtemp(root + "-");
  try {
    const round = { id: "R01", title: "Greet unnamed visitors in both apps", teams: initialMessage,
      mr_title: "Use a friendly greeting when a name is missing", descriptions: {}, commits: {},
      validation: "Both sample greeting checks passed: a missing name yields Hello, friend!; Ada still yields Hello, Ada!. These are small local examples, not production integration tests." };
    const plan = { repositories: {}, rounds: [round] };
    for (const name of ["sample-api", "sample-web"]) {
      const repo = path.join(staging, name);
      await fs.mkdir(repo);
      await git(repo, ["init", "-b", "main"]);
      await git(repo, ["config", "user.name", "THWH practice"]);
      await git(repo, ["config", "user.email", "practice@example.invalid"]);
      await git(repo, ["config", "commit.gpgSign", "false"]);
      await fs.writeFile(path.join(repo, "greeting.cjs"), 'module.exports = name => `Hello, ${name}!`;\n');
      await git(repo, ["add", "."]);
      await git(repo, ["commit", "-m", "Create the practice greeting"]);
      const base = await git(repo, ["rev-parse", "HEAD"]);
      await git(repo, ["branch", "master"]);
      await git(repo, ["checkout", "-b", "practice-change"]);
      await fs.writeFile(path.join(repo, "greeting.cjs"), 'module.exports = name => `Hello, ${name || "friend"}!`;\n');
      const greet = require(path.join(repo, "greeting.cjs"));
      if (greet() !== "Hello, friend!" || greet("Ada") !== "Hello, Ada!") throw new Error("The sample greeting check failed.");
      await git(repo, ["commit", "-am", round.title]);
      const source = await git(repo, ["rev-parse", "HEAD"]);
      round.commits[name] = source;
      round.descriptions[name] = "Use friend when a visitor has no name; preserve the greeting for a named visitor.";
      plan.repositories[name] = { base, source };
    }
    await fs.mkdir(path.join(staging, ".review"));
    await fs.writeFile(path.join(staging, ".review/plan.json"), JSON.stringify(plan) + "\n");
    await fs.mkdir(path.join(staging, "The Review"));
    await fs.writeFile(path.join(staging, "The Review/The Board.md"), "# Practice board\n\n## Todo\n\n## In Progress\n\n## Review\n\n## Done\n");
    await fs.writeFile(path.join(staging, "The Review/The Task.md"), "# Practice task\n\nReview the missing-name greeting fix in sample-api and sample-web. Read both hunks, leave a note, request a clearer Teams message, revise it, resolve the request, and accept the pair locally. Find the finished text in Accepted handoff.\n");
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
    this.root = path.join(directory, "practice-review");
    this.review = review;
    this.state = { active: false, step: 0, completed: false, dismissed: false };
  }
  async load() {
    try { this.state = { ...this.state, ...JSON.parse(await fs.readFile(this.filename, "utf8")) }; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  async save() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    await fs.writeFile(this.filename + ".tmp", JSON.stringify(this.state) + "\n");
    await fs.rename(this.filename + ".tmp", this.filename);
  }
  status() { return { ...this.state, lessons: lessons.map(({ complete, ...lesson }) => lesson) }; }
  async act(action, input = {}) {
    if (!this.state.active) return { ...await this.review.act(action, input), tutorial: this.status() };
    if (action === "accept" && this.state.step < 6) throw new Error("Finish the practice lessons before accepting. Follow the lesson above the review.");
    const view = await invoke(this.root, action, input);
    if (lessons[this.state.step]?.complete(view)) {
      this.state.step++;
      if (this.state.step === lessons.length) this.state.completed = true;
      await this.save();
    }
    return { ...view, tutorial: this.status() };
  }
  async choose(root) {
    const view = await this.review.choose(root);
    if (this.state.active) await this.leave();
    return { ...view, tutorial: this.status() };
  }
  async leave() {
    if (this.state.active) await invoke(this.root, "pause");
    this.state.active = false;
    await this.save();
  }
  async control(action) {
    if (!["start", "leave", "restart", "skip"].includes(action)) throw new Error("Unknown practice action.");
    if (action === "skip") { this.state.dismissed = true; await this.leave(); }
    else if (action === "leave") await this.leave();
    else {
      if (action === "restart") {
        await this.leave();
        await fs.rm(this.root, { recursive: true, force: true });
        this.state.step = 0;
      }
      try { await fs.access(path.join(this.root, ".review/plan.json")); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        await createPractice(this.root);
        this.state.step = 0;
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
