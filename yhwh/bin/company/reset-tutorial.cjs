const fs = require("node:fs/promises");
const path = require("node:path");
const { Tutorial } = require("../../lib/company/tutorial.cjs");

async function main() {
  const directory = require("../../lib/company/thwh-profile.cjs")();
  const tutorial = new Tutorial(directory);
  for (const filename of [tutorial.filename, tutorial.filename + ".tmp", tutorial.root,
    path.join(directory, "practice-review")]) {
    await fs.rm(filename, { recursive: true, force: true });
  }
  console.log(`Tutorial reset in ${directory}. Open THWH to start fresh.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
