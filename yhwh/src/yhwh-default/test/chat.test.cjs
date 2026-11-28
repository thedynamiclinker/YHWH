const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');
const { chat, characterPrompt } = require('../app/chat.cjs');

test('the agent takes its voice from the app, with Abraham and subdued modes', async () => {
  const prompt = await characterPrompt();
  assert.match(prompt, /You are YHWH/);
  assert.ok(prompt.includes(require('../../../etc/default/words.json').chatVoice));
  assert.match(prompt, /we-the-nameless\/01-genesis/);
  assert.match(prompt, /operator/);
  assert.match(prompt, /Address the user as Abe/);
  assert.match(prompt, /George Carlin → Charlie or Charleen/);
  await assert.rejects(characterPrompt(0), /available from Samuel onward/);
  await assert.rejects(characterPrompt(50), /available from Samuel onward/);
  assert.match(await characterPrompt(80), /Address the user as Dave/);
  assert.match(await characterPrompt(120), /Address the user as Mo[\s\S]*LD and LM/);
  assert.match(await characterPrompt(140), /Address the user as Josh, Son[\s\S]*Jesus 𐤇 Christ What Was Ur Name Again[\s\S]*XP[\s\S]*χLD人/);
});

test('Samuel uses the read-only runner without an app-control mailbox', async () => {
  const spawn = (_command, args, options) => {
    assert.equal(args[args.indexOf('--sandbox') + 1], 'read-only');
    assert.equal(args.includes('--add-dir'), false);
    assert.equal(options.env.YHWH_APP_CONTROL, undefined);
    assert.equal(options.env.YHWH_APP_MAILBOX, undefined);
    const output = args[args.indexOf('--output-last-message') + 1];
    const child = new EventEmitter();
    child.kill = () => {};
    child.stdin = new Writable({
      write(_chunk, _encoding, done) { done(); },
      final(done) { fs.writeFile(output, 'Still in here, Dave.').then(() => { done(); child.emit('close', 0); }, done); },
    });
    return child;
  };
  const app = { configDirectory: '/tmp', dispatch: () => assert.fail('Samuel opened app-control') };
  const reply = await chat({ directory: '/tmp', energy: 80, app, messages: [{ role: 'user', content: 'Are you there?' }] }, { spawn });
  assert.equal(reply, 'Still in here, Dave.');
});

test('conversation uses stdin and a writable workspace, stages uploads and reports failures', async () => {
  let temp, received;
  const spawn = (exe, args, options) => {
    assert.equal(args[args.indexOf('--sandbox') + 1], 'workspace-write');
    assert.ok(args.includes('--add-dir'));
    const image = args[args.indexOf('--image') + 1];
    assert.deepEqual(require('node:fs').readFileSync(image), Buffer.from('image'));
    assert.equal(options.env.YHWH_APP_CONTROL, require.resolve('../app/app-control.cjs'));
    assert.equal(options.cwd, '/tmp');
    const output = args[args.indexOf('--output-last-message') + 1]; temp = output;
    const child = new EventEmitter(); child.stderr = new PassThrough(); child.kill = () => {};
    child.stdin = new Writable({ write(data, _, done) { received = data.toString(); done(); }, final(done) { fs.writeFile(output, 'Ah. Here.').then(() => { done(); child.emit('close',0); }); } });
    return child;
  };
  assert.equal(await chat({ directory: '/tmp', energy:100, messages:[{ role:'user',content:'hello' }], attachments:[{ name:'x,y.png', bytes:Buffer.from('image'), turn:0 }] }, { spawn }), 'Ah. Here.');
  assert.match(received, /"content":"hello"/);
  await assert.rejects(fs.access(temp), { code:'ENOENT' });
  const fail = () => {
    const child = new EventEmitter(); child.stderr = new PassThrough(); child.stdin = new PassThrough(); child.kill = () => {};
    process.nextTick(() => child.emit('error', Object.assign(new Error('missing'), { code:'ENOENT' })));
    return child;
  };
  await assert.rejects(chat({ directory:'/tmp', messages:[{ role:'user',content:'hello' }] }, { spawn: fail }), /agent runner is missing/);
  await assert.rejects(chat({ directory:'/tmp', messages:[{ role:'system',content:'bad' }] }), /Invalid conversation/);
});
