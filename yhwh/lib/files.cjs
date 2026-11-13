const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify, TextDecoder } = require('node:util');
const { languages } = require('@codemirror/language-data');
const { LanguageDescription } = require('@codemirror/language');
const exec = promisify(execFile);
const mimeLanguages = { 'text/markdown': 'markdown', 'text/x-markdown': 'markdown', 'application/json': 'json', 'text/html': 'html', 'text/x-python': 'python', 'application/x-shellscript': 'shell', 'text/x-shellscript': 'shell', 'text/x-tex': 'latex', 'application/xml': 'xml', 'image/svg+xml': 'xml' };

async function list(directory, hidden = false) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.filter(item => hidden || !item.name.startsWith('.')).map(async item => {
    const filename = path.join(directory, item.name);
    try { const stat = await fs.stat(filename); return { name: item.name, path: filename, directory: stat.isDirectory(), symlink: item.isSymbolicLink(), size: stat.size, modified: stat.mtimeMs }; }
    catch { return { name: item.name, path: filename, directory: false, broken: true, size: 0, modified: 0 }; }
  }))).sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

async function detect(filename, buffer, config = {}) {
  let mime = '';
  // This is the shared-mime-info database used by Linux desktop file managers.
  // libmagic is the fallback on machines without xdg-mime (including macOS).
  for (const [command, args] of [['xdg-mime', ['query', 'filetype', filename]], ['file', ['--brief', '--mime-type', '--', filename]]]) {
    try { mime = (await exec(command, args, { timeout: 2000, maxBuffer: 8192 })).stdout.trim(); if (mime) break; } catch {}
  }
  const name = path.basename(filename), extension = path.extname(filename).slice(1).toLowerCase();
  let language = mimeLanguages[mime] || LanguageDescription.matchFilename(languages, name)?.name.toLowerCase() || (name === 'rc' || extension === 'conf' ? 'shell' : 'plain');
  if (language === 'plain') {
    const shebang = buffer.subarray(0, 200).toString().split('\n')[0];
    if (/^#!.*\b(python[\d.]*|node|bash|sh|zsh|fish|ruby|perl)\b/.test(shebang)) {
      const interpreter = shebang.match(/\b(python[\d.]*|node|bash|sh|zsh|fish|ruby|perl)\b/)[1];
      language = interpreter.startsWith('python') ? 'python' : interpreter === 'node' ? 'javascript' : ['bash', 'sh', 'zsh', 'fish'].includes(interpreter) ? 'shell' : interpreter;
    }
  }
  let rules = [];
  try { rules = JSON.parse(config.file_types || '[]'); } catch {}
  for (const rule of rules) {
    try { if ((rule.extension && rule.extension.replace(/^\./, '') === extension) || (rule.filename && new RegExp(rule.filename).test(name))) language = rule.language; } catch {}
  }
  return { mime: mime || 'application/octet-stream', language };
}

async function read(filename, config) {
  filename = path.resolve(filename);
  const stat = await fs.stat(filename);
  if (!stat.isFile()) throw new Error('Open a regular file.');
  const handle = await fs.open(filename, 'r');
  let prefix;
  try { const buffer = Buffer.alloc(Math.min(stat.size, 8192)); const { bytesRead } = await handle.read(buffer); prefix = buffer.subarray(0, bytesRead); } finally { await handle.close(); }
  const type = await detect(filename, prefix, config);
  const result = { path: filename, name: path.basename(filename), size: stat.size, modified: stat.mtimeMs, ...type };
  const image = type.mime.startsWith('image/') && type.mime !== 'image/svg+xml';
  if (image && stat.size < 16 * 1024 * 1024) return { ...result, kind: 'image', data: `data:${type.mime};base64,${(await fs.readFile(filename)).toString('base64')}` };
  if (prefix.includes(0) || stat.size > 16 * 1024 * 1024 || type.mime === 'application/pdf') return { ...result, kind: 'binary' };
  try {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(await fs.readFile(filename));
    return { ...result, kind: 'text', content, newline: content.includes('\r\n') ? '\r\n' : '\n' };
  } catch (error) { if (error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') return { ...result, kind: 'binary' }; throw error; }
}

async function save(filename, content, modified, force = false) {
  const stat = await fs.stat(filename).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!force && !stat && modified != null) throw new Error('This file was removed from disk. Use Save as to keep your edits, or explicitly overwrite from the file menu.');
  if (!force && stat && modified != null && stat.mtimeMs !== modified) throw new Error('This file changed on disk. Reload it or explicitly overwrite from the file menu.');
  // Write through the existing file so symbolic links, permissions, and hard
  // links keep their normal Unix meaning. No per-directory metadata is created.
  await fs.writeFile(filename, content, 'utf8');
  return { modified: (await fs.stat(filename)).mtimeMs };
}

async function create(filename, directory = false) {
  if (directory) await fs.mkdir(filename);
  else await fs.writeFile(filename, '', { flag: 'wx' });
  return path.resolve(filename);
}

async function move(source, destination) {
  // rename() overwrites on Unix. The GUI and CLI must not silently destroy a
  // different file when a title is edited.
  await fs.lstat(destination).then(() => { throw new Error('A file with that name already exists.'); }, error => { if (error.code !== 'ENOENT') throw error; });
  try { await fs.rename(source, destination); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.cp(source, destination, { recursive: true, preserveTimestamps: true, errorOnExist: true, force: false });
    await fs.rm(source, { recursive: true });
  }
  return destination;
}

module.exports = { list, read, detect, save, create, move };
