const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const exec = promisify(require("node:child_process").execFile);
const crypto = require("node:crypto");
const hash = (buffer) =>
  crypto.createHash("sha256").update(buffer).digest("hex");
const textLimit = 8 * 1024 * 1024;

async function list(directory) {
  directory = path.resolve(directory);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const items = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      try {
        const stat = await fs.stat(filename);
        return {
          name: entry.name,
          path: filename,
          directory: stat.isDirectory(),
          link: entry.isSymbolicLink(),
          size: stat.size,
          modified: stat.mtimeMs,
        };
      } catch {
        return {
          name: entry.name,
          path: filename,
          directory: false,
          link: entry.isSymbolicLink(),
          inaccessible: true,
          size: 0,
        };
      }
    }),
  );
  return {
    path: directory,
    parent: path.dirname(directory),
    items: items.sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name, undefined, { numeric: true }),
    ),
  };
}
async function read(filename) {
  filename = path.resolve(filename);
  const stat = await fs.stat(filename);
  if (!stat.isFile()) throw new Error("Open a regular file.");
  let mime = "application/octet-stream";
  try {
    mime = (
      await exec("file", ["--mime-type", "--brief", "--", filename])
    ).stdout.trim();
  } catch {}
  const ext = path.extname(filename).toLowerCase();
  if ([".md", ".markdown"].includes(ext)) mime = "text/markdown";
  if (
    /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mime) &&
    stat.size < 32 * 1024 * 1024
  )
    return {
      path: filename,
      mime,
      image: `data:${mime};base64,${(await fs.readFile(filename)).toString("base64")}`,
    };
  if (stat.size > textLimit)
    return { path: filename, mime, binary: true, size: stat.size };
  const buffer = await fs.readFile(filename);
  if (buffer.includes(0))
    return { path: filename, mime, binary: true, size: stat.size };
  const text = buffer.toString("utf8");
  let language = {
    ".md": "Markdown",
    ".markdown": "Markdown",
    ".json": "JSON",
    ".html": "HTML",
    ".htm": "HTML",
    ".js": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TSX",
    ".jsx": "JSX",
    ".py": "Python",
    ".css": "CSS",
    ".sh": "Shell",
    ".bash": "Shell",
    ".tex": "LaTeX",
    ".rs": "Rust",
    ".go": "Go",
    ".c": "C",
    ".h": "C",
    ".cpp": "C++",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".toml": "TOML",
    ".xml": "XML",
    ".sql": "SQL",
  }[ext];
  if (!language)
    language =
      /python/.test(text.split("\n")[0]) && text.startsWith("#!")
        ? "Python"
        : /^#!.*\b(bash|sh|zsh)\b/.test(text)
          ? "Shell"
          : mime === "text/markdown"
            ? "Markdown"
            : "Plain text";
  return {
    path: filename,
    mime,
    text,
    language,
    version: hash(buffer),
    size: stat.size,
  };
}
async function save({ path: filename, text, version }) {
  const current = await fs.readFile(filename);
  if (hash(current) !== version)
    throw new Error(
      "This file changed on disk. Reopen it before saving so neither edit is lost.",
    );
  // Write through the existing inode: symlinks, hard links and permissions survive.
  await fs.writeFile(filename, text, "utf8");
  return { version: hash(Buffer.from(text)) };
}
async function rename(filename, destination) {
  try {
    await fs.lstat(destination);
    throw new Error("That name already exists.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.rename(filename, destination);
  return destination;
}
async function create(directory, name, folder = false) {
  if (!name || name === "." || name === ".." || /[/\\\0]/.test(name))
    throw new Error("Use a name without path separators.");
  const filename = path.join(directory, name);
  if (folder) await fs.mkdir(filename);
  else await fs.writeFile(filename, "", { flag: "wx" });
  return filename;
}
module.exports = { list, read, save, rename, create };
