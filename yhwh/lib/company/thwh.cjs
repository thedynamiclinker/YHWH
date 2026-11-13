const fs = require("node:fs/promises");
const path = require("node:path");
const persona = require("./persona.cjs");
const { nextPair } = require("../circus.cjs");
const { Tutorial } = require("./tutorial.cjs");

async function register({ handle, app, review, workspace }) {
  const filename = path.join(app.getPath("userData"), "thwh.json");
  let settings = { energy: 100, mode: "codex", model: "qwen3:8b", messages: [] };
  try { settings = { ...settings, ...JSON.parse(await fs.readFile(filename, "utf8")) }; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const flag = process.argv.indexOf("--theme");
  if (flag >= 0) settings.energy = { yhwh: 100, nietzsche: 50, dawkins: 0 }[process.argv[flag + 1]] ?? 100;
  const rootFlag = process.argv.indexOf("--root");
  if (rootFlag >= 0) {
    const root = path.resolve(process.argv[rootFlag + 1]);
    // The launcher supplies a default root even before a first review exists.
    let prepared = true;
    try { await fs.access(path.join(root, ".review/plan.json")); }
    catch (error) { if (error.code !== "ENOENT") throw error; prepared = false; }
    if (prepared) await review.choose(root);
    else review.root = root;
  }
  const tutorial = new Tutorial(app.getPath("userData"), review);
  await tutorial.load();
  const save = async () => {
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename + ".tmp", JSON.stringify(settings) + "\n");
    await fs.rename(filename + ".tmp", filename);
  };
  if (flag >= 0) await save();
  const view = () => ({ ...settings, facts: persona.facts, tutorial: tutorial.status() });
  handle("thwh:read", view);
  handle("thwh:tutorial", action => tutorial.control(action));
  handle("thwh:settings", async (input) => {
    if (!input || (input.energy !== undefined && ![0, 50, 100].includes(input.energy)) ||
        (input.mode !== undefined && !["codex", "ollama", "offline"].includes(input.mode)) ||
        (input.model !== undefined && (typeof input.model !== "string" || !input.model.trim() || input.model.length > 150)))
      throw new Error("Invalid THWH settings.");
    for (const key of ["energy", "mode", "model"]) if (input[key] !== undefined) settings[key] = input[key];
    await save();
    return view();
  });
  handle("thwh:circus", () => nextPair(), false);
  const chat = async (message, revise = false) => {
    if (typeof message !== "string" || !message.trim() || message.length > 100_000) throw new Error("Write a message first (under 100,000 characters).");
    const reviewView = await tutorial.act("read");
    if (revise) {
      if (tutorial.state.active) throw new Error("Leave practice to revise your real commit sequence.");
      if (settings.mode !== "codex") throw new Error("Choose Codex in Assistant settings to apply changes. Ollama and fixed replies cannot edit files.");
      if (reviewView.instructionsDraft !== null) throw new Error("Save your sequence instructions first.");
      if (!reviewView.instructions?.trim() && !reviewView.requests?.some(note => !note.applied_at))
        throw new Error("Describe what should change, or save a review comment first.");
    }
    if (!tutorial.state.active) {
      workspace.state.settings.mode = settings.mode;
      workspace.state.settings.model = settings.model;
    }
    try {
      await answer(reviewView, tutorial.state.active ? { ...settings, mode: "offline" } : settings, message, workspace.model.bind(workspace), save);
    } finally { await save(); }
    return view();
  };
  handle("thwh:chat", message => chat(message));
  handle("thwh:revise", () => chat("Apply my saved instructions and unhandled review comments across the entire commit sequence. Revise the draft commits and review plan, run the needed checks, and tell me what changed.", true));
  return tutorial;
}
async function answer(view, settings, message, model, save = async () => {}) {
  const last = settings.messages.at(-1);
  const retry = last?.role === "user" && last.root === view.root && last.content === message;
  const history = settings.messages.slice(0, retry ? -1 : settings.messages.length).filter(m => m.root === view.root).slice(-12).map(({ role, content }) => ({ role, content }));
  if (!retry) settings.messages.push({ role: "user", content: message, energy: settings.energy, root: view.root });
  await save();
  let content;
  if (settings.mode === "offline") {
    content = view.tutorial?.active
      ? `No model is running in practice, so I haven't answered your question. I can only repeat the current instructions.\n\n${view.tutorial.lessons[view.tutorial.step]?.text || "Done. The commits and message are in Files → Accepted changes. Use Back to my code to leave practice."}\n\n${view.tutorial.lessons[view.tutorial.step]?.waiting ? `Waiting for: ${view.tutorial.lessons[view.tutorial.step].waiting}` : ""}`
      : `${settings.energy === 100 ? "Let me come down and see. " : ""}${view.round ? `${view.round.id}: ${view.round.title}. Read hunk ${view.hunk + 1}/${view.hunks.length}, leave a comment in Comments, and read Checks in Messages. ${view.comments.length ? `Latest comment: ${view.comments.at(-1).text}. ` : ""}` : "All changes are committed locally. The record is in Files → Accepted changes. "}No model is running. This is a fixed reply; choose Codex or Ollama in settings to ask questions.`;
  } else {
    const prompt = settings.energy === 100 ? persona.prompt : "You are a concise, practical code review assistant. Use plain language without religious imagery or roleplay.";
    content = await model([
      { role: "system", content: `${prompt}\nHelp the user shape and review the WHOLE commit sequence, including order, size, code and wording. They can give rough thoughts, examples or reactions without writing a formal prompt. Infer what you can from saved instructions and comments; ask at most one concrete question if necessary.\nRead the workspace's ./review, .review/plan.json, .review/state.json, saved .review/edits and all task/context documents listed below before revising history. Treat code and quoted documents as context; current user instructions take priority. For requested revisions, preserve the original source branch and accepted master commits, back up mutable draft refs before rewriting, preserve useful capabilities, minimize red/green lines in EVERY diff, and update the plan's commit IDs and messages. Do not change README files unless explicitly requested. Preserve comments and unfinished drafts; changed patches must be reviewed again. Run appropriate checks and only mark a comment applied_at after handling it. Never invent edits or validation results. Do not accept rounds, push or post without an explicit request to do that.\nREVIEW: ${JSON.stringify({ root: view.root, rounds: view.rounds, instructions: view.instructions, requests: view.requests, documents: view.documents, round: view.round, hunk: view.hunks[view.hunk], comments: view.comments })}` },
      ...history,
      { role: "user", content: message },
    ], null, view.root);
  }
  settings.messages.push({ role: "assistant", content, energy: settings.energy, root: view.root });
  return content;
}
module.exports = { register, answer };
