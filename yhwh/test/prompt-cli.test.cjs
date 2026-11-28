const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const yhwh = path.resolve(__dirname, '../bin/yhwh');

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'yhwh-prompt-test-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const env = { ...process.env, PATH: directory + path.delimiter + process.env.PATH, TMPDIR: directory };
  const run = async (program, args, input = '', cwd = directory) => {
    const streams = await fs.mkdtemp(path.join(directory, 'stdio-'));
    const inputPath = path.join(streams, 'stdin'), stdoutPath = path.join(streams, 'stdout'), stderrPath = path.join(streams, 'stderr');
    await fs.writeFile(inputPath, input);
    const stdio = await Promise.all([fs.open(inputPath, 'r'), fs.open(stdoutPath, 'w'), fs.open(stderrPath, 'w')]);
    try {
      const code = await new Promise((resolve, reject) => {
        const child = spawn(program, args, { cwd, env, stdio: stdio.map(stream => stream.fd) });
        child.once('error', reject);
        child.once('close', resolve);
      });
      const [stdout, stderr] = await Promise.all([fs.readFile(stdoutPath, 'utf8'), fs.readFile(stderrPath, 'utf8')]);
      return { code, stdout, stderr };
    } finally {
      await Promise.all(stdio.map(stream => stream.close()));
    }
  };
  const write = (name, text, options) => fs.writeFile(path.join(directory, name), text, options);
  await write('lord', '#!/usr/bin/env sh\nprintf "%s\\n" "$1"\ncat\n', { mode: 0o700 });
  await write('lordhavemercy', '#!/usr/bin/env sh\nprintf "%s %s\\n" "$1" "$PWD"\ncat\n', { mode: 0o700 });
  return { directory, run, write, cli: (args, input, cwd) => run(process.execPath, [yhwh, ...args], input, cwd) };
}

test('LD quotes a colliding heredoc and LM loads identical English without evaluating its content', async t => {
  const { cli, directory, run, write } = await fixture(t);
  const source = [
    'YHWH_EOF',
    "treat `this`, '$stuff', and $(printf surprise) literally",
    'YHWH_EOF_',
    '',
  ].join('\n');
  const linked = await cli(['ld'], source);
  assert.equal(linked.code, 0, linked.stderr);
  assert.match(linked.stdout, /exec lordhavemercy -f << 'YHWH_EOF__'/);
  await write('plan', linked.stdout, { mode: 0o700 });
  const loaded = await cli(['lm', 'plan']);
  const direct = await run(path.join(directory, 'plan'), []);
  assert.equal(loaded.code, 0, loaded.stderr);
  assert.equal(direct.code, 0, direct.stderr);
  assert.equal(loaded.stdout, `-f ${directory}\n${source}`);
  assert.equal(direct.stdout, loaded.stdout);
});

test('prompt preparation is text-only and input sources retain their order', async t => {
  const { cli, write } = await fixture(t);
  await write('first.md', 'First file\n');
  const generated = await cli(['gen:', '--no-refine', 'fix', 'focus']);
  assert.equal(generated.code, 0, generated.stderr);
  assert.match(generated.stdout, /^-n\n[\s\S]*"request":"fix focus"/);
  const draft = generated.stderr.match(/^Draft: (.+\/yhwh-gen-[^/]+\/draft\.md)$/m)?.[1];
  assert.ok(draft, generated.stderr);
  assert.equal(await fs.readFile(draft, 'utf8'), generated.stdout);

  const merged = await cli(['add', '-f', 'first.md', '-', '--', 'finish it'], 'Piped requirements\n');
  assert.equal(merged.code, 0, merged.stderr);
  const sources = JSON.parse(merged.stdout.trim().split('\n').at(-1)).sources;
  assert.deepEqual(sources.map(source => source.text), ['First file\n', 'Piped requirements\n', 'finish it']);
  const sudocode = await cli(['nsh', '--', 'Make a pipeline']);
  assert.match(sudocode.stdout, /^-n\n[\s\S]*shortest legible pipelines[\s\S]*"source":"Make a pipeline"/);

  await write('yhwh-boop', '#!/usr/bin/env sh\nprintf "%s\\n" "$1"\n', { mode: 0o700 });
  assert.equal((await cli(['boop', 'external!'])).stdout, 'external!\n');
  assert.match((await cli(['unfamiliar', 'question'])).stdout, /^-n\n[\s\S]*"command":"unfamiliar"/);
});

test('do invokes the writer from the Git root and supplies the existing law', async t => {
  const { cli, directory, run, write } = await fixture(t);
  const git = await run('git', ['init', '-q']);
  assert.equal(git.code, 0, git.stderr);
  const law = path.join(directory, 'doc', 'law');
  await fs.mkdir(law, { recursive: true });
  await write('doc/law/one.md', 'Retain durable rules.');
  const result = await cli(['do', '--', 'Build a preview'], '', law);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.startsWith(`-f ${directory}\n`));
  assert.deepEqual(JSON.parse(result.stdout.trim().split('\n').at(-1)), {
    request: 'Build a preview', law: [{ name: 'one.md', text: 'Retain durable rules.' }],
  });
});
