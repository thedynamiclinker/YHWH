const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const runtime = require("../../lib/electron.cjs")();
const profile =
  env.YHWH_THREE_DATA_DIR ||
  path.join(
    env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"),
    "yhwh-three",
  );
let rememberedSoftware = false;
try {
  rememberedSoftware =
    JSON.parse(fs.readFileSync(path.join(profile, "graphics.json"), "utf8"))
      .software === true;
} catch {}
function launch(software) {
  const graphics = software
    ? [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ]
    : [];
  const child = spawn(
    runtime,
    [path.join(__dirname, "../../src/yhwh-three"), ...process.argv.slice(2), ...graphics],
    { env, stdio: "inherit" },
  );
  child.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    if (code === 75 && !software && env.YHWH_THREE_GPU !== "hardware") {
      console.log(
        "GPU initialization failed; restarting YHWH Three with software rendering.",
      );
      launch(true);
    } else process.exitCode = code ?? 1;
  });
}
launch(
  env.YHWH_THREE_GPU === "software" ||
    (env.YHWH_THREE_GPU !== "hardware" && rememberedSoftware),
);
