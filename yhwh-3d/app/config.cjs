const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");

const defaults = {
  theme: "yhwh",
  accent: "#d8bd85",
  bg: "",
  bloom: "0.8",
  motion: "1",
  particles: "1800",
  title: "YHWH 3D",
  font_size: "15",
  theme_css: "",
  stylesheet: "",
  plugin: "",
  plugins: "",
  filetypes: "{}",
  settings_html: "",
  show_hidden: "false",
  sidebar_width: "248",
  terminal_height: "260",
  file_manager: "true",
  terminal: "false",
  live_preview: "true",
  settings_fields: "theme,bloom,motion,font_size,filetypes",
};
const quote = (value) => "'" + String(value).replaceAll("'", "'\\''") + "'";

function expandHeader(text, env) {
  // Headers are paths, never shell. Only environment expansion is performed.
  if (/\$\(|`|[\r\n\0]/.test(text))
    throw new Error(
      "Path headers cannot contain shell commands. Indent shell code.",
    );
  let value = text.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  value = value.replace(/^~(?=\/|$)/, env.HOME || os.homedir());
  return value.replace(
    /\$\{([A-Za-z_][A-Za-z_0-9]*)\}|\$([A-Za-z_][A-Za-z_0-9]*)/g,
    (_, a, b) => {
      if (env[a || b] === undefined)
        throw new Error(`Unknown environment variable: ${a || b}`);
      return env[a || b] ?? "";
    },
  );
}

async function parseConfig(text, filename, base, target, env = process.env) {
  const blocks = [];
  let block;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim() || line.trimStart().startsWith("#")) {
      if (block) block.lines.push(line);
      continue;
    }
    if (/^[ \t]/.test(line)) {
      if (!block)
        throw new Error(
          `${filename}:${index + 1}: indented Bash needs a path header first.`,
        );
      block.lines.push(line);
      continue;
    }
    const header = expandHeader(line, env);
    const scope = path.resolve(base, header);
    let stat;
    try {
      stat = await fs.stat(scope);
    } catch (error) {
      throw new Error(
        `${filename}:${index + 1}: path does not exist: ${scope}`,
      );
    }
    if (!stat.isFile() && !stat.isDirectory())
      throw new Error(
        `${filename}:${index + 1}: header must name a file or directory.`,
      );
    block = {
      scope,
      matches:
        target === scope ||
        (stat.isDirectory() &&
          target.startsWith(
            scope === path.parse(scope).root ? scope : scope + path.sep,
          )),
      lines: [],
    };
    blocks.push(block);
  }
  return blocks;
}

async function configFiles(
  target,
  {
    home = os.homedir(),
    system = process.env.YHWH_SYSTEM_CONFIG || "/etc/yhwh",
    xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
    user = process.env.YHWH_CONFIG_HOME || path.join(xdg, "yhwh"),
  } = {},
) {
  const directories = [
    { dir: system, base: system },
    { dir: user, base: user },
  ];
  // The 3D prompt explicitly also names ~/config/yhwh. It is an optional layer.
  const named = path.join(home, "config/yhwh");
  if (!directories.some((item) => item.dir === named))
    directories.push({ dir: named, base: named });
  let current = (await fs.stat(target)).isDirectory()
    ? target
    : path.dirname(target);
  const ancestors = [];
  for (;;) {
    ancestors.unshift(current);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  directories.push(
    ...ancestors.map((base) => ({ dir: path.join(base, ".yhwh"), base })),
  );
  const files = [];
  for (const { dir, base } of directories)
    for (const name of ["rc", "rc.3d"]) {
      const filename = path.join(dir, name);
      try {
        await fs.access(filename);
        files.push({ filename, base });
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  return files;
}

async function loadConfig(target, options = {}) {
  target = path.resolve(target);
  const files = await configFiles(target, options);
  const env = options.env || process.env;
  const scripts = [];
  for (const { filename, base } of files) {
    const blocks = await parseConfig(
      await fs.readFile(filename, "utf8"),
      filename,
      base,
      target,
      env,
    );
    const matching = blocks.filter((b) => b.matches);
    if (!matching.length) continue;
    // Remove the required section indentation, retaining Bash's own indentation.
    const code = matching
      .map((block) => {
        const nonempty = block.lines.filter(
          (line) => line.trim() && /^[ \t]/.test(line),
        );
        const indent = Math.min(
          ...nonempty.map((line) => line.match(/^[ \t]*/)[0].length),
        );
        return block.lines
          .map((line) => (/^[ \t]/.test(line) ? line.slice(indent) : line))
          .join("\n");
      })
      .join("\n");
    const before = `for __yhwh_key in bg theme_css stylesheet plugin; do __yhwh_previous[$__yhwh_key]=\${!__yhwh_key}; done`;
    const origins = `for __yhwh_key in bg theme_css stylesheet plugin; do\n  if [[ \${!__yhwh_key} != \${__yhwh_previous[$__yhwh_key]} ]]; then __yhwh_origins[$__yhwh_key]=$PWD; fi\ndone`;
    scripts.push(
      `builtin cd -- ${quote(base)} || exit\n${before}\n${code}\n${origins}`,
    );
  }
  const init = Object.entries(defaults)
    .map(([key, value]) => `${key}=\${${key}-${quote(value)}}`)
    .join("\n");
  const dump = Object.keys(defaults)
    .map((key) =>
      ["bg", "theme_css", "stylesheet", "plugin"].includes(key)
        ? `__yhwh_value=\${${key}}\nif [[ -n $__yhwh_value && $__yhwh_value != /* ]]; then __yhwh_value="\${__yhwh_origins[${key}]:-$PWD}/$__yhwh_value"; fi\nprintf '%s\\0%s\\0' ${quote(key)} "$__yhwh_value" >&3`
        : `printf '%s\\0%s\\0' ${quote(key)} "\${${key}}" >&3`,
    )
    .join("\n");
  const script = `${init}\ndeclare -A __yhwh_previous __yhwh_origins\n${scripts.join("\n")}\n${dump}\n`;
  const result = await new Promise((resolve, reject) => {
    const child = spawn("bash", ["--noprofile", "--norc", "-s"], {
      env,
      stdio: ["pipe", "pipe", "pipe", "pipe"],
    });
    let data = "",
      log = "",
      error = "";
    child.stdio[3].on("data", (chunk) => {
      data += chunk;
    });
    child.stdout.on("data", (chunk) => {
      log = (log + chunk).slice(-32000);
    });
    child.stderr.on("data", (chunk) => {
      error = (error + chunk).slice(-32000);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Config Bash exceeded 10 seconds."));
    }, 10000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve({ data, log, error })
        : reject(new Error(`Config Bash exited ${code}: ${error}`));
    });
    child.stdin.end(script);
  });
  const values = { ...defaults };
  const fields = result.data.split("\0");
  for (let i = 0; i + 1 < fields.length; i += 2)
    values[fields[i]] = fields[i + 1];
  return {
    values,
    files: files.map((f) => f.filename),
    log: result.log,
    warnings: result.error,
  };
}
module.exports = {
  defaults,
  quote,
  expandHeader,
  parseConfig,
  configFiles,
  loadConfig,
};
