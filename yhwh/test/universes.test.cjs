const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { go } = require('../lib/universes.cjs');
const { resolveConfig } = require('../src/yhwh-default/app/config.cjs');

const cli = path.join(__dirname, '../bin/yhwh');
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-universes-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const bin = path.join(base, 'bin');
  await fs.mkdir(bin);
  async function command(...args) {
    const output = await fs.mkdtemp(path.join(base, 'command-'));
    const stdout = await fs.open(path.join(output, 'stdout'), 'w+');
    const stderr = await fs.open(path.join(output, 'stderr'), 'w+');
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [cli, ...args], {
          cwd: base, env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, YHWH_LORD_DIR: base },
          stdio: ['ignore', stdout.fd, stderr.fd],
        });
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (code !== 0) throw new Error(await fs.readFile(path.join(output, 'stderr'), 'utf8'));
      return { stdout: await fs.readFile(path.join(output, 'stdout'), 'utf8') };
    } finally { await Promise.all([stdout.close(), stderr.close()]); }
  }
  const tool = (name, program) => fs.writeFile(path.join(bin, name), '#!/bin/sh\nset -eu\n' + program, { mode: 0o755 });
  return { base, command, tool };
}

test('Nu installs starter files, preserves an existing name, and interoperates with un roots', async t => {
  const { base, command } = await fixture(t);
  assert.match((await command('nu', '--list')).stdout, /workshop\tLord workshop/);
  await command('Nu', 'test universe', '--template', 'workshop');
  const root = path.join(base, 'test universe');
  assert.equal((await command('Cd', root)).stdout.trimEnd(), await fs.realpath(root));
  assert.match(await fs.readFile(path.join(root, '.@'), 'utf8'), /^# un root\nhello:/);
  assert.match(await fs.readFile(path.join(root, 'zan/men/1/hello'), 'utf8'), /un hello/);
  await assert.rejects(command('nu', root), /EEXIST/);
  await fs.mkdir(path.join(base, 'external'));
  await fs.writeFile(path.join(base, 'external/.@'), '# un root\n');
  await command('cd', 'external');
  await assert.rejects(command('cd', '.'));
});

test('OCI imports stage before publishing, install the selected tools, and keep guest profiles out of the host', { skip: process.platform !== 'linux' }, async t => {
  const { base, tool, command } = await fixture(t);
  await tool('skopeo', 'test "$1" = copy\nprintf "%s\\n" "$2" > image-reference\n');
  await tool('umoci', `test "$1 $2 $3" = "unpack --rootless --image"
case "$(cat image-reference)" in */failure:latest) printf 'unpack failed\\n' >&2; exit 1;; esac
root="$5/rootfs"
mkdir -p "$root/usr/bin" "$root/.yhwh/etc" "$root/sub"
ln -s /usr/bin "$root/bin"
printf "#!/bin/sh\\n" > "$root/usr/bin/sh"
chmod +x "$root/usr/bin/sh"
printf "printf unsafe > profile-ran\\n" > "$root/.yhwh/etc/profile"`);
  await tool('lord', 'printf "local lord\\n"\n');
  await command('nu', 'base', '--template', 'alpine');
  const root = path.join(base, 'base');
  assert.equal(await fs.readFile(path.join(root, '.yhwh-oci'), 'utf8'), 'image docker.io/library/alpine:latest\n');
  assert.match(await fs.readFile(path.join(root, 'usr/local/bin/lord'), 'utf8'), /local lord/);
  await fs.symlink(path.join(root, 'sub'), path.join(base, 'alias'));
  for (const target of [root, path.join(root, 'sub'), path.join(base, 'alias')]) {
    const config = await resolveConfig(target, { system: path.join(base, 'empty'), user: path.join(base, 'empty') });
    assert.ok(!config.prefixes.some(item => item.endsWith('.yhwh')));
  }
  await assert.rejects(fs.stat(path.join(root, 'profile-ran')), { code: 'ENOENT' });
  await command('nu', 'external', '--from', 'alpine:latest');
  await assert.rejects(fs.stat(path.join(base, 'external/usr/local/bin/lord')), { code: 'ENOENT' });
  await assert.rejects(command('nu', 'broken', '--from', 'failure:latest'), /unpack failed|umoci exited 1/);
  await assert.rejects(command('nu', 'invalid', '--from', 'docker://alpine'), /Enter an OCI image/);
  const names = await fs.readdir(base);
  assert.ok(names.every(name => !name.startsWith('.universe-') && name !== 'broken' && name !== 'invalid'));

  try {
    const guest = await go(root, { mounts: ['.'], writableMounts: [path.join(root, 'sub')], mountBase: path.join(base, 'bin') });
    assert.deepEqual(guest.args.slice(-11), ['--tmpfs', '/mnt/host', '--ro-bind', path.join(base, 'bin'), '/mnt/host/bin',
      '--bind', path.join(root, 'sub'), '/mnt/host/sub', '--', '/bin/sh', '-i']);
    assert.equal(guest.cwd, root);
  } catch (error) {
    if (!error.message.startsWith('Install bwrap')) throw error;
    t.diagnostic('Bubblewrap unavailable for mount-plan assertion');
  }
});
