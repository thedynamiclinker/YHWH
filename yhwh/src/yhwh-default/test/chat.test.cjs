const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { chat, characterPrompt } = require('../app/chat.cjs');

test('every Genesis manuscript is available to the character, with Abraham and subdued modes', async () => {
  const prompt = await characterPrompt();
  assert.match(prompt, /SOURCE 12.tex/); assert.match(prompt, /SOURCE 23.tex/);
  assert.match(prompt, /SOURCE 50.tex/); assert.match(prompt, /SOURCE apocrypha.tex/);
  assert.match(prompt, /Do not change files/);
  assert.match(prompt, /Always address the user as Abe, in every mode/);
  assert.match(prompt, /George Carlin → Charlie or Charleen/);
  assert.match(prompt, /occasionally promise to spread Abe's seed everywhere/);
  assert.match(await characterPrompt(0), /No deity performance/);
  assert.match(await characterPrompt(120), /Always address the user as Mo/);
  assert.match(await characterPrompt(140), /Address the user as Josh, Son[\s\S]*Jesus 𐤇 Christ What Was Ur Name Again[\s\S]*XP[\s\S]*χLD人/);
});

test('conversation uses stdin, cwd and read-only Codex; cleans output and reports failures', async () => {
  let temp, received;
  const spawn = (exe, args, options) => {
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    assert.equal(options.cwd, '/tmp');
    const output = args[args.indexOf('--output-last-message') + 1]; temp = output;
    const child = new EventEmitter(); child.stderr = new PassThrough(); child.kill = () => {};
    child.stdin = new Writable({ write(data, _, done) { received = data.toString(); done(); }, final(done) { fs.writeFile(output, 'Ah. Here.').then(() => { done(); child.emit('close',0); }); } });
    return child;
  };
  assert.equal(await chat({ directory: '/tmp', energy:100, messages:[{ role:'user',content:'hello' }] }, { spawn }), 'Ah. Here.');
  assert.match(received, /"content":"hello"/);
  await assert.rejects(fs.access(temp), { code:'ENOENT' });
  const fail = () => {
    const child = new EventEmitter(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
    process.nextTick(() => child.emit('error', Object.assign(new Error('missing'), { code:'ENOENT' })));
    return child;
  };
  await assert.rejects(chat({ directory:'/tmp', messages:[{ role:'user',content:'hello' }] }, { spawn: fail }), /codex login/);
  await assert.rejects(chat({ directory:'/tmp', messages:[{ role:'system',content:'bad' }] }), /Invalid conversation/);
});
