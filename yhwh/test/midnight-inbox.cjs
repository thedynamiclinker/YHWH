const assert = require('node:assert/strict');
const { letters } = require('../lib/inbox.cjs');
const { nightLetters } = require('../lib/presence.cjs');

// The same real-renderer check runs in Electron, Three and all mobile viewports.
module.exports = async function checkMidnightInbox(page, screenshot) {
  // Construct times in the browser's timezone, independently of the test host.
  const before = await page.evaluate(() => new Date(2027, 0, 20, 23, 59).getTime());
  const ids = [...letters, ...nightLetters].map(letter => letter.id).filter(id => id !== 'seedis');
  ids.push('house', 'bread', 'offering', 'inspect', 'seed', 'covenant');
  await page.clock.install({ time: before });
  await page.evaluate(({ before, ids }) => localStorage.setItem('yhwh:presence:v1', JSON.stringify({
    letters: ids.map(id => ({ id, read: true, at: before - 3600000 })), steps: [], enabled: false,
  })), { before, ids });
  const ready = () => page.waitForFunction(() => window.YHWH?.active());
  const received = () => page.evaluate(() => JSON.parse(localStorage.getItem('yhwh:presence:v1')).letters.filter(letter => letter.id === 'seedis'));
  await page.reload(); await ready();
  assert.equal((await received()).length, 0);
  // Sleeping through midnight must not deliver a late letter on resume.
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }));
  await page.clock.pauseAt(before + 59000);
  await page.clock.fastForward(61000);
  await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
  assert.equal((await received()).length, 0);
  await page.clock.resume();

  const next = await page.evaluate(() => new Date(2027, 0, 21, 23, 59).getTime());
  await page.clock.setSystemTime(next);
  await page.reload(); await ready();
  await page.clock.pauseAt(next + 59000);
  assert.equal((await received()).length, 0);
  await page.clock.runFor(1000); // No click or keypress: the timer delivers it.
  const delivered = await received();
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].at, next + 60000);
  assert.equal(delivered[0].sender, 'yhwh@thedynamiclinker.com');
  await page.clock.resume();
  await page.evaluate(() => window.YHWH.run('inbox'));
  await page.locator('[data-mail="seedis"]').click();
  const envelope = await page.locator('.mail-envelope').innerText();
  for (const text of ['to ʾbe', 'CC: 𐤀be, אbe, Abe, abe', 'BCC: ew']) assert.ok(envelope.includes(text), text);
  assert.equal(await page.locator('.mail-message h1').innerText(), 'seedis');
  assert.match(await page.locator('.mail-body').innerText(), /PSA: Problem Solved Abe\./);
  assert.match(await page.locator('.mail-body em').first().innerText(), /burp/);
  assert.equal(await page.locator('.mail-body hr').count(), 2);
  const footnote = page.locator('.mail-body a[href="#mail-footnote-1"]');
  assert.equal(await footnote.count(), 1);
  await footnote.click();
  assert.match(await page.locator('#mail-footnote-1').innerText(), /theological and the acrostic/);
  await page.waitForFunction(() => { const image = document.querySelector('.mail-attachment img'); return image?.complete && image.naturalWidth > 0; });
  assert.equal(await page.locator('[data-edit-word=letterSeedis]').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: screenshot });
  const home = page.getByRole('button', { name: 'Back to workspace' });
  const beforeScroll = await home.boundingBox();
  const scrollTop = await page.locator('#inbox-view').evaluate(inbox => {
    inbox.scrollTop = inbox.scrollHeight;
    return inbox.scrollTop;
  });
  assert.ok(scrollTop > 0);
  assert.equal((await home.boundingBox()).y, beforeScroll.y);
  await home.click();
  assert.equal(await page.locator('#document').isVisible(), true);

  await page.clock.setFixedTime(next + 13 * 3600000);
  await page.reload(); await ready();
  await page.keyboard.press('Shift');
  assert.equal((await received()).length, 1);
  assert.equal((await received())[0].read, true);
};
