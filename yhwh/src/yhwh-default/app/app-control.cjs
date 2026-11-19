const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');
const { O_RDONLY, O_NOFOLLOW, O_NONBLOCK } = require('node:fs').constants;

const sizeLimit = 128 * 1024;

async function readRequest(filename) {
  const file = await fs.open(filename, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > sizeLimit) throw new Error('Invalid app request.');
    const buffer = Buffer.alloc(stat.size + 1);
    const { bytesRead } = await file.read(buffer);
    if (bytesRead > sizeLimit) throw new Error('Invalid app request.');
    return JSON.parse(buffer.subarray(0, bytesRead).toString('utf8'));
  } finally { await file.close(); }
}

// A private mailbox lets shell tools reach the owning desktop while running
// inside a workspace sandbox, including when the sandbox blocks network I/O.
async function serve(parent, dispatch) {
  const directory = await fs.mkdtemp(path.join(parent, 'app-'));
  let open = true;
  const loop = (async () => {
    while (open) {
      for (const name of await fs.readdir(directory)) {
        if (!open) break;
        const id = /^([a-f\d-]{36})\.request$/.exec(name)?.[1];
        if (!id) continue;
        const filename = path.join(directory, name);
        let result;
        try {
          const { action, args } = await readRequest(filename);
          // Consume the request before performing a side effect.
          await fs.unlink(filename);
          result = { value: await dispatch(action, args) };
        } catch (error) {
          await fs.unlink(filename).catch(() => {});
          result = { error: error.message };
        }
        const response = path.join(directory, `${id}.response`);
        await fs.writeFile(response + '.tmp', JSON.stringify(result), { flag: 'wx', mode: 0o600 });
        await fs.rename(response + '.tmp', response);
      }
      if (open) await pause(75);
    }
  })().catch(error => { if (open) console.error('YHWH app control:', error.message); });
  return { directory, async close() { open = false; await loop; } };
}

async function request(directory, action, args = {}) {
  if (!directory || !action) throw new Error('Use this command inside a YHWH conversation: <action> [JSON object].');
  const id = path.join(directory, randomUUID());
  const data = JSON.stringify({ action, args });
  if (Buffer.byteLength(data) > sizeLimit) throw new Error('YHWH app request exceeds 128 KiB.');
  await fs.writeFile(id + '.tmp', data, { flag: 'wx', mode: 0o600 });
  await fs.rename(id + '.tmp', id + '.request');
  const expires = Date.now() + 30000;
  while (Date.now() < expires) {
    let response;
    try { response = await fs.readFile(id + '.response', 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await fs.access(directory);
      await pause(80);
      continue;
    }
    await fs.unlink(id + '.response');
    const { value, error } = JSON.parse(response);
    if (error) throw new Error(error);
    return value;
  }
  await fs.unlink(id + '.request').catch(() => {});
  throw new Error('The app did not confirm this action. Check its state before retrying.');
}

if (require.main === module) {
  Promise.resolve().then(() => request(process.env.YHWH_APP_MAILBOX, process.argv[2], JSON.parse(process.argv[3] || '{}')))
    .then(value => console.log(JSON.stringify(value, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { serve };
