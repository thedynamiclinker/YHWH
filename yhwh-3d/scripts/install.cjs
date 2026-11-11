const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const app = path.resolve(__dirname, "..");
const bin = path.resolve(app, "../bin");
fs.mkdirSync(bin, { recursive: true });
// This single new command is our only write beside the independent 3D app.
const launcher =
  "#!/usr/bin/env bash\nexec " +
  "'" +
  path.join(app, "bin/yhwh-3d").replaceAll("'", "'\\''") +
  "'" +
  ' "$@"\n';
fs.writeFileSync(path.join(bin, "yhwh-3d"), launcher, { mode: 0o755 });
fs.chmodSync(path.join(bin, "yhwh-3d"), 0o755);
const config = path.join(os.homedir(), "config/yhwh");
fs.mkdirSync(config, { recursive: true });
try {
  fs.copyFileSync(
    path.join(app, "config/rc.3d"),
    path.join(config, "rc.3d"),
    fs.constants.COPYFILE_EXCL,
  );
} catch (error) {
  if (error.code !== "EEXIST") throw error;
}
console.log("Installed " + path.join(bin, "yhwh-3d"));
console.log("3D config: " + path.join(config, "rc.3d"));
