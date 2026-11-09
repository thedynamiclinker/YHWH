const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

module.exports = function dataDirectory(env = process.env) {
  const config = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  const directory = path.resolve(env.THWH_DATA_DIR || env.TWHW_DATA_DIR || path.join(config, "THWH"));
  const previous = path.join(config, "TWHW");
  // Correct the spelling without abandoning saved settings, chats or workspace selection.
  if (!env.THWH_DATA_DIR && !env.TWHW_DATA_DIR && !fs.existsSync(directory) && fs.existsSync(previous))
    fs.renameSync(previous, directory);
  const preferences = path.join(directory, "thwh.json");
  const oldPreferences = path.join(directory, "twhw.json");
  if (!fs.existsSync(preferences) && fs.existsSync(oldPreferences))
    fs.renameSync(oldPreferences, preferences);
  return directory;
};
