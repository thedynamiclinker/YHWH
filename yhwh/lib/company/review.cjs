const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");

const actions = new Set([
  "read", "start", "pause", "next", "previous", "comment", "reject",
  "resolve", "save-copy", "save-patch", "accept",
  "position", "draft", "discard-drafts", "save-field",
  "draft-instructions", "save-instructions",
]);

// Python must read an actual file, including in a packaged Electron application.
const engine = path.join(__dirname, "review.py").replace(
  `${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`,
);

function invoke(root, action, input = {}) {
  if (!actions.has(action)) return Promise.reject(new Error("Unknown review action."));
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.YHWH_PYTHON || "python3", [
      engine, "--root", root, "--json", action,
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Review timed out. Refresh to inspect its saved state before retrying."));
    }, 60000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      stdout += data;
      if (stdout.length > 20_000_000) {
        child.kill();
        reject(new Error("This review is too large for the desktop. Use the CLI."));
      }
    });
    child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-20000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not run the review engine. Install Python 3 or set YHWH_PYTHON. ${error.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.includes("Resource temporarily unavailable")
          ? "This review is busy in another process. Pause the terminal review with q, then refresh."
          : stderr.trim() || "The review engine stopped before returning a result."));
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(new Error("The review engine returned an invalid response.")); }
    });
    child.stdin.on("error", () => {}); // An early Python error is reported on close.
    child.stdin.end(JSON.stringify(input));
  });
}

class Review {
  constructor(preferences, defaultRoot) {
    this.preferences = preferences;
    this.root = process.env.YHWH_REVIEW_ROOT || defaultRoot;
  }
  async load() {
    try {
      const saved = JSON.parse(await fs.readFile(this.preferences, "utf8"));
      if (!process.env.YHWH_REVIEW_ROOT && typeof saved.root === "string") this.root = saved.root;
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  async choose(root) {
    const view = await invoke(root, "read");
    await fs.mkdir(path.dirname(this.preferences), { recursive: true });
    await fs.writeFile(this.preferences + ".tmp", JSON.stringify({ root: view.root }) + "\n");
    await fs.rename(this.preferences + ".tmp", this.preferences);
    this.root = view.root;
    return view;
  }
  async act(action, input = {}) {
    if (!input || typeof input !== "object" || JSON.stringify(input).length > 6_000_000)
      throw new Error("Invalid review input.");
    return invoke(this.root, action, input);
  }
}
module.exports = { Review, invoke };
