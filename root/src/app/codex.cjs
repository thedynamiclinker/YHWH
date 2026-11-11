const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

async function codex(messages, directory, schema) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-codex-"));
  const output = path.join(temporary, "answer.txt");
  try {
    // Match lordhavemercy -f. Let the installed CLI choose its configured model.
    const args = [
      "exec",
      "--dangerously-bypass-approvals-and-sandbox",
      "-c", 'model_reasoning_effort="xhigh"',
      "--skip-git-repo-check",
      "--color", "never",
      "--output-last-message", output,
    ];
    if (schema) {
      const filename = path.join(temporary, "schema.json");
      await fs.writeFile(filename, JSON.stringify(schema), { mode: 0o600 });
      args.push("--output-schema", filename);
    }
    args.push("-");
    const prompt = "Continue this application's conversation, supplied below as JSON. " +
      "Follow its system instructions and answer the final user message. " +
      "Use tools when the user requests work; report only actions and results that actually occurred.\n\n" +
      JSON.stringify(messages);
    await new Promise((resolve, reject) => {
      const child = spawn(process.env.YHWH_CODEX || "codex", args, {
        cwd: directory,
        windowsHide: true,
        // Tool progress can be large during a rebase. The final answer has its
        // own file; buffering unused stdout must not terminate otherwise good work.
        stdio: ["pipe", "ignore", "pipe"],
      });
      let stderr = "", timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 30 * 60 * 1000);
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", data => { stderr = (stderr + data).slice(-20000); });
      child.on("error", error => {
        clearTimeout(timer);
        if (error.code === "ENOENT")
          return reject(new Error("Could not start Codex. Install the Codex CLI on PATH or set YHWH_CODEX to its executable, then run codex login. You can also choose Ollama or Offline rehearsal in Settings."));
        reject(error);
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        if (code === 0 && !timedOut) return resolve();
        reject(new Error(timedOut
          ? "Codex exceeded the 30-minute response limit. Check its work before retrying."
          : `Codex failed. Check codex login and your CLI configuration. ${stderr.trim().slice(-2000) || `Stopped (${signal || code}).`}`));
      });
      // An early CLI exit closes stdin; its actual error is reported above.
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
    });
    const answer = await fs.readFile(output, "utf8").catch((error) => {
      if (error.code === "ENOENT") throw new Error("Codex finished without a final answer. Check its CLI configuration and try again.");
      throw error;
    });
    if (!answer.trim()) throw new Error("Codex returned an empty answer. Try again.");
    return schema ? answer : answer.trim().slice(0, 30000);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

module.exports = { codex };
