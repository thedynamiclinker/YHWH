const { spawn } = require("node:child_process");
const path = require("node:path");
const env = { ...process.env };
// Codex and other Electron hosts may set this for their own Node children.
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(
  require("../../lib/electron.cjs")(),
  [path.join(__dirname, "../../src/company"), ...process.argv.slice(2)],
  { env, stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
