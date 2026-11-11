import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Git really clones, commits and pushes. Only the GitHub/network boundary is a fixture.
test('publishing pushes standalone source and exact release assets, then verifies submission', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'yhwh-publish-test-'));
  const root = fileURLToPath(new URL('../', import.meta.url));
  const remote = join(temp, 'remote.git'), seed = join(temp, 'seed'), bin = join(temp, 'bin');
  const env = { ...process.env, PATH: bin + ':' + process.env.PATH,
    YHWH_TEST_REMOTE: remote, YHWH_TEST_RELEASE: join(temp, 'release'),
    GIT_AUTHOR_NAME: 'YHWH Test', GIT_AUTHOR_EMAIL: 'test@example.invalid',
    GIT_COMMITTER_NAME: 'YHWH Test', GIT_COMMITTER_EMAIL: 'test@example.invalid' };
  function command(cmd, args, cwd) {
    const result = spawnSync(cmd, args, { env, cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  }
  try {
    await mkdir(bin); await mkdir(seed);
    command('git', ['init', '--bare', '--initial-branch=main', remote]);
    command('git', ['init', '--initial-branch=main'], seed);
    await writeFile(join(seed, 'README.md'), '# Empty plugin repository\n');
    command('git', ['add', '.'], seed); command('git', ['commit', '-m', 'Initialize'], seed);
    command('git', ['remote', 'add', 'origin', remote], seed); command('git', ['push', '-u', 'origin', 'main'], seed);
    const gh = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const a = process.argv.slice(2), remote = process.env.YHWH_TEST_REMOTE, release = process.env.YHWH_TEST_RELEASE;
function git(args) { const r = spawnSync('git', args, {encoding:'utf8'}); if(r.status) throw Error(r.stderr); return r.stdout; }
if(a[0]==='api' && a[1]==='repos/example/yhwh') console.log(JSON.stringify({private:false,default_branch:'main'}));
else if(a[0]==='api' && a[1].endsWith('/contents/manifest.json')) process.stdout.write(git(['--git-dir',remote,'show','main:manifest.json']));
else if(a[0]==='repo' && a[1]==='clone') git(['clone',remote,a[3]]);
else if(a[0]==='release' && a[1]==='create') {
  fs.mkdirSync(release,{recursive:true});
  for(const f of a.filter(f=>/\\/(main\\.js|manifest\\.json|styles\\.css)$/.test(f))) fs.copyFileSync(f,path.join(release,path.basename(f)));
  git(['--git-dir',remote,'tag',a[2],'main']);
  console.log('https://github.com/example/yhwh/releases/tag/'+a[2]);
} else if(a[0]==='release' && a[1]==='view') console.log(JSON.stringify({assets:['main.js','manifest.json','styles.css'].map(name=>({name})),isDraft:false,isPrerelease:false,url:'https://github.com/example/yhwh/releases/tag/'+a[2]}));
else if(a[0]==='release' && a[1]==='download') {
  const dir=a[a.indexOf('--dir')+1]; for(const f of fs.readdirSync(release)) fs.copyFileSync(path.join(release,f),path.join(dir,f));
} else throw Error('Unexpected GitHub operation: '+a.join(' '));
`;
    await writeFile(join(bin, 'gh'), gh); await chmod(join(bin, 'gh'), 0o755);
    // The outer npm test already runs checks; don't recursively invoke this suite.
    await writeFile(join(bin, 'npm'), '#!/usr/bin/env node\nprocess.exit(0);\n'); await chmod(join(bin, 'npm'), 0o755);
    const cli = join(root, 'scripts/cli.mjs');
    command(process.execPath, [cli, 'publish', '--repo', 'example/yhwh']);
    const tree = command('git', ['--git-dir', remote, 'ls-tree', '--name-only', 'main']);
    assert.match(tree, /src/); assert.match(tree, /manifest.json/); assert.doesNotMatch(tree, /\.obsidian|node_modules|^root$/m);
    for (const file of ['main.js', 'manifest.json', 'styles.css'])
      assert.deepEqual(await readFile(join(root, file)), await readFile(join(temp, 'release', file)));
    const output = command(process.execPath, [cli, 'submit', '--repo', 'example/yhwh', '--no-open']);
    assert.match(output, /community.obsidian.md/);
    const repeated = spawnSync(process.execPath, [cli, 'publish', '--repo', 'example/yhwh'], { env, encoding: 'utf8' });
    assert.notEqual(repeated.status, 0); assert.match(repeated.stderr, /already exists/);
    await writeFile(join(temp, 'release/main.js'), 'different build');
    const mismatch = spawnSync(process.execPath, [cli, 'submit', '--repo', 'example/yhwh', '--no-open'], { env, encoding: 'utf8' });
    assert.notEqual(mismatch.status, 0); assert.match(mismatch.stderr, /differs/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
