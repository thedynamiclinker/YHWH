const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

module.exports = function electronExecutable() {
  if (process.env.YHWH_ELECTRON) return process.env.YHWH_ELECTRON;
  if (process.platform === "linux" && fs.existsSync("/etc/NIXOS")) {
    // npm's generic Linux binary cannot find NixOS shared libraries. Use the
    // ordinary nixpkgs runtime instead of patching binaries or disabling sandboxes.
    const result = spawnSync(
      "nix-build",
      ["<nixpkgs>", "-A", "electron", "--no-out-link"],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"],
        timeout: 180000,
      },
    );
    if (result.status !== 0)
      throw new Error(
        "Could not obtain the NixOS Electron runtime. Run make nix-shell, or set YHWH_ELECTRON to a native Electron executable.",
      );
    return path.join(
      result.stdout.trim().split("\n").at(-1),
      "bin",
      "electron",
    );
  }
  return require("electron");
};
