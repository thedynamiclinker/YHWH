const { spawn } = require('node:child_process');
const { address, message, draft } = require('../../../lib/mail-message.cjs');

function subjectHeader(subject) {
  const chunks = [];
  let chunk = '';
  for (const char of subject) {
    if (Buffer.byteLength(chunk + char) > 42) { chunks.push(chunk); chunk = ''; }
    chunk += char;
  }
  chunks.push(chunk);
  return chunks.map(value => `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`).join('\r\n ');
}

async function mail(action, fields, { config, directory, openExternal }) {
  const { mail_self: self, mail_transport: transport } = config.values;
  const letter = message(fields, self);
  if (action === 'draft') {
    await openExternal(draft(letter));
    return { drafted: true, to: letter.to };
  }
  if (action !== 'send') throw new Error('Choose draft or send.');
  if (!transport || !self) throw new Error('Set your email address and a sendmail-compatible command in Settings → Advanced to send from YHWH.');
  const body = Buffer.from(letter.body.replace(/\r\n?|\n/g, '\r\n')).toString('base64').match(/.{1,76}/g).join('\r\n');
  const mime = [`From: ${address(self)}`, `To: ${letter.to}`, `Subject: ${subjectHeader(letter.subject)}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body, ''].join('\r\n');
  await new Promise((resolve, reject) => {
    const child = spawn(transport, ['-i', '-t'], { cwd: directory, env: config.environment, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true, timeout: 20000 });
    child.once('error', error => reject(new Error(`Electronic Mail could not start the configured transport (${error.code || 'process error'}).`)));
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(signal ? 'The mail transport stopped before confirming acceptance. Check its queue before retrying.' : `The mail transport exited with code ${code}. Check its configuration and queue before retrying.`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(mime);
  });
  return { accepted: true, to: letter.to };
}

module.exports = { mail };
