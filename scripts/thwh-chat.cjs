/* The terminal calls the same assistant as Electron, with its current snapshot. */
const fs = require("node:fs/promises");
const path = require("node:path");
const { answer } = require("../src/thwh.cjs");
const { Workspace } = require("../src/workspace.cjs");
(async () => {
  let input = "";
  for await (const part of process.stdin) input += part;
  const { view, message } = JSON.parse(input);
  const filename = process.env.THWH_PREFERENCES || path.join(require("../src/thwh-profile.cjs")(), "thwh.json");
  let settings = { energy: 0, mode: "codex", model: "qwen3:8b", messages: [] };
  try { settings = { ...settings, ...JSON.parse(await fs.readFile(filename, "utf8")), energy: 0 }; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const model = (...args) => Workspace.prototype.model.call({ state: { settings } }, ...args);
  const content = await answer(view, settings, message, model);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename + ".tmp", JSON.stringify(settings) + "\n");
  await fs.rename(filename + ".tmp", filename);
  process.stdout.write(content);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
