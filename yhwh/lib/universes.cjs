const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { seedFor, marker, hostOnly, createSeed } = require('./universe-seeds.cjs');

const exec = promisify(execFile);
const systemDirs = ['/run/wrappers/bin', '/run/current-system/sw/bin', '/usr/bin', '/bin'];

async function executable(name, directories = (process.env.PATH || '').split(path.delimiter)) {
  for (const directory of directories) {
    if (!directory) continue;
    const file = path.resolve(directory, name);
    try {
      await fs.access(file, constants.X_OK);
      if ((await fs.stat(file)).isFile()) return file;
    } catch {}
  }
  throw new Error(`Install ${name} and make it available on PATH.`);
}

async function hasMarker(directory, name, value) {
  let file;
  try {
    file = await fs.open(path.join(directory, name), constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    const info = await file.stat();
    if (!info.isFile()) return false;
    const bytes = Buffer.alloc(value.length);
    await file.read(bytes, 0, bytes.length, 0);
    return bytes.toString() === value;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'ELOOP', 'EACCES', 'EPERM'].includes(error.code)) return false;
    throw error;
  } finally { await file?.close(); }
}
const isUniverse = directory => hasMarker(directory, '.@', marker);
const isImported = directory => hasMarker(directory, '.yhwh-oci', 'image ');

async function enter(directory) {
  const root = await fs.realpath(directory);
  if (!await isUniverse(root)) throw new Error('Choose a universe directory created by Nu or un new.');
  return root;
}

function registryImage(ref) {
  if (typeof ref !== 'string' || !/^[a-z0-9][a-z0-9._-]*(?::[0-9]+)?(?:\/[a-z0-9][a-z0-9._-]*)*(?::[\w.-]+)?(?:@sha256:[a-f0-9]{64})?$/.test(ref))
    throw new Error('Enter an OCI image such as alpine:latest or ghcr.io/owner/image:tag.');
  const parts = ref.split('/');
  if (parts.length === 1) return `docker.io/library/${ref}`;
  if (!/[.:]/.test(parts[0]) && parts[0] !== 'localhost') return `docker.io/${ref}`;
  return ref;
}

function run(program, args, { signal, output } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { signal, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '', launchError;
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8000); output?.(chunk); });
    child.once('error', error => { launchError = error; });
    child.once('close', code => {
      if (launchError) reject(launchError);
      else if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `${path.basename(program)} exited ${code ?? 'after a signal'}.`));
    });
  });
}

// Resolve an image path with guest symlink semantics, including absolute links.
async function guestPath(root, guest, create = false) {
  const pending = guest.split('/'), resolved = [];
  let links = 0;
  while (pending.length) {
    const part = pending.shift();
    if (!part || part === '.') continue;
    if (part === '..') { resolved.pop(); continue; }
    const filename = path.join(root, ...resolved, part);
    const stat = await fs.lstat(filename).catch(error => {
      if (error.code === 'ENOENT' && create) return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) {
      if (++links > 40) throw new Error(`Too many links in ${guest}.`);
      const target = await fs.readlink(filename);
      if (target.startsWith('/')) resolved.length = 0;
      pending.unshift(...target.split('/'));
      continue;
    }
    if (!stat) await fs.mkdir(filename);
    resolved.push(part);
  }
  return path.join(root, ...resolved);
}

async function lordDirectory() {
  if (process.env.YHWH_LORD_DIR) return path.resolve(process.env.YHWH_LORD_DIR, 'bin');
  const checkout = path.join(os.homedir(), 'src/lord/bin');
  try { await fs.access(path.join(checkout, 'lord'), constants.X_OK); return checkout; }
  catch { return path.dirname(await executable('lord')); }
}

async function installTools(root, tools, lord) {
  const bin = await guestPath(root, '/usr/local/bin', true);
  for (const name of ['lord', 'law', 'lawd', 'lorde', 'lordhavemercy', 'lordy', 'lordylordydaddysforty', 'un', 'LD']) {
    // The shell and provider dependencies belong to the guest's OS.
    const source = path.join(lord, name);
    const bytes = await fs.readFile(source).catch(error => {
      if (error.code === 'ENOENT' && name !== 'lord') return null;
      throw error;
    });
    if (bytes) await fs.writeFile(path.join(bin, name), bytes, { mode: 0o755, flag: 'wx' });
  }
  if (tools !== 'yhwh') return;
  const system = path.resolve(__dirname, '..');
  const opt = await guestPath(root, '/opt', true);
  const prefix = path.join(opt, 'yhwh');
  await fs.mkdir(prefix);
  for (const name of ['bin', 'etc', 'lib', 'package.json', 'src/yhwh-default/app/config.cjs']) {
    const destination = path.join(prefix, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(path.join(system, name), destination, { recursive: true, verbatimSymlinks: true });
  }
  await fs.writeFile(path.join(bin, 'yhwh'), '#!/bin/sh\nexec node /opt/yhwh/bin/yhwh "$@"\n', { mode: 0o755, flag: 'wx' });
}

async function create(destination, id = 'empty', ref, options = {}) {
  destination = path.resolve(destination);
  const seed = seedFor(id);
  if (!seed.image && id !== 'oci') return createSeed(destination, id, {
    mkdir: directory => fs.mkdir(directory, { mode: 0o755 }),
    write: (filename, contents) => fs.writeFile(filename, contents, { flag: 'wx' }),
    remove: directory => fs.rm(directory, { recursive: true }),
  }, path.join);
  if (process.platform !== 'linux') throw new Error(hostOnly);
  const image = seed.image || registryImage(ref);
  const existing = await fs.lstat(destination).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (existing) throw new Error('A file or directory already has that name.');
  const [skopeo, umoci, lord] = await Promise.all([
    executable('skopeo'), executable('umoci'), seed.tools && lordDirectory(),
  ]);
  const draft = await fs.mkdtemp(path.join(path.dirname(destination), '.universe-'));
  const layout = path.join(draft, 'image'), bundle = path.join(draft, 'bundle');
  try {
    await run(skopeo, ['copy', `docker://${image}`, `oci:${layout}:root`], options);
    await run(umoci, ['unpack', '--rootless', '--image', `${layout}:root`, bundle], options);
    const root = path.join(bundle, 'rootfs');
    options.signal?.throwIfAborted();
    await fs.chmod(root, 0o700);
    if (!await isUniverse(root)) await fs.writeFile(path.join(root, '.@'), marker, { flag: 'wx' });
    await fs.writeFile(path.join(root, '.yhwh-oci'), `image ${image}\n`, { flag: 'wx' });
    if (seed.tools) await installTools(root, seed.tools, lord);
    options.signal?.throwIfAborted();
    // Reserve the destination exclusively before replacing the empty directory.
    await fs.mkdir(destination, { mode: 0o700 });
    try { await fs.rename(root, destination); }
    catch (error) { await fs.rmdir(destination).catch(() => {}); throw error; }
    return destination;
  } finally {
    await fs.rm(draft, { recursive: true, force: true });
  }
}

async function go(directory, { mounts = [], writableMounts = [], mountBase = process.cwd(), network = false, sudo = false, raw = false, startup, command = ['/bin/sh', '-i'] } = {}) {
  if (process.platform !== 'linux') throw new Error(hostOnly);
  const root = raw ? await fs.realpath(directory) : await enter(directory);
  if (root === '/') throw new Error('Choose a universe directory other than the host root.');
  if (!Array.isArray(command) || !command.length || command.some(item => typeof item !== 'string') || !command[0].startsWith('/'))
    throw new Error('Give an absolute guest command such as /bin/sh.');
  try {
    const filename = await guestPath(root, command[0]);
    if (!(await fs.stat(filename)).isFile()) throw new Error('Expected a regular file.');
    await fs.access(filename, constants.X_OK);
  }
  catch { throw new Error(`This universe has no executable ${command[0]}. Use Cd to browse it or import a Linux root filesystem with Nu.`); }
  if (![mounts, writableMounts].every(list => Array.isArray(list) && list.every(item => typeof item === 'string' && item && !/[\x00-\x1f]/.test(item))))
    throw new Error('Use one outer path per mount.');

  let program = await executable('bwrap');
  const bwrap = program;
  const namespaces = ['--unshare-pid', '--unshare-ipc', '--unshare-uts', '--unshare-cgroup-try'];
  if (!network) namespaces.push('--unshare-net');
  let isolation = ['--unshare-user', '--uid', '0', '--gid', '0', ...namespaces];
  const args = ['--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv', '--setenv', 'PATH', '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/nix/var/nix/profiles/default/bin',
    '--setenv', 'HOME', '/root', '--setenv', 'TERM', process.env.TERM || 'xterm-256color',
    '--bind', root, '/', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--chdir', '/'];
  if (startup) args.push('--ro-bind', startup, '/tmp/.yhwh-shrc',
    '--ro-bind', path.join(path.dirname(startup), 'session'), '/tmp/.yhwh-session',
    '--setenv', 'ENV', '/tmp/.yhwh-shrc', '--setenv', 'YHWH_ROOT', '/', '--setenv', 'YHWH_CWAT', '/');
  if (network) args.push('--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf');
  if (mounts.length || writableMounts.length) args.push('--tmpfs', '/mnt/host');
  const names = new Set();
  for (const [item, mode] of [...mounts.map(item => [item, '--ro-bind']), ...writableMounts.map(item => [item, '--bind'])]) {
    const outer = path.resolve(mountBase, item.replace(/^~(?=\/|$)/, os.homedir()));
    const source = await fs.realpath(outer);
    const name = path.basename(outer) || 'root';
    if (names.has(name)) throw new Error('Give each outer mount a distinct basename.');
    const stat = await fs.stat(source);
    if (!stat.isDirectory() && !stat.isFile()) throw new Error('Mount a directory or regular file.');
    names.add(name);
    args.push(mode, source, `/mnt/host/${name}`);
  }

  const prefix = [];
  if (sudo && process.getuid() !== 0) {
    try {
      // Probe the same namespaces without running any guest files.
      await exec(bwrap, [...isolation, '--ro-bind', '/', '/', '--', bwrap, '--version'], { timeout: 5000 });
    } catch (error) {
      if (!/namespace|operation not permitted|permission denied/i.test(error.stderr || '')) throw error;
      // Set up the user namespace with sudo, mapping guest root to the caller.
      // Bubblewrap and the guest never run as root in the host user namespace.
      const [unshare, trustedBwrap] = await Promise.all([executable('unshare', systemDirs), executable('bwrap', systemDirs)]);
      program = await executable('sudo', systemDirs);
      prefix.push('--', unshare, `--map-users=0:${process.getuid()}:1`, `--map-groups=0:${process.getgid()}:1`,
        '--setgid', '0', '--setuid', '0', '--keep-caps', '--', trustedBwrap);
      isolation = namespaces;
    }
  }
  return { program, args: [...prefix, ...isolation, ...args, '--', ...command], cwd: root };
}

module.exports = { create, enter, go, isImported, guestPath };
