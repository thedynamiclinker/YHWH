const assert = require('node:assert/strict');
const { nightLetters } = require('../lib/presence.cjs');
const copy = require('../etc/default/words.json');

// Run against the real shared renderer on desktop, Three and touch devices.
module.exports = async function checkNightInbox(page, screenshot) {
  const at = (hour, minute = 0) => new Date(2027, 0, 15, hour, minute);
  await page.clock.setFixedTime(at(21, 59));
  await page.evaluate(() => localStorage.removeItem('yhwh:presence:v1'));
  await page.reload();
  await page.waitForFunction(() => window.YHWH?.active());
  const received = () => page.evaluate(() => JSON.parse(localStorage.getItem('yhwh:presence:v1') || '{"letters":[]}').letters.filter(letter => letter.id.startsWith('name-')));
  assert.equal((await received()).length, 0);
  await page.clock.setFixedTime(at(22, 4));
  for (let index = 0; index < nightLetters.length; index++) {
    const letter = nightLetters[index];
    await page.keyboard.press('Shift');
    assert.deepEqual((await received()).map(item => item.id), nightLetters.slice(0, index + 1).map(item => item.id));
    await page.evaluate(() => window.YHWH.run('inbox'));
    await page.locator(`[data-mail="${letter.id}"]`).click();
    assert.equal(await page.locator('.mail-body .character-copy').innerText(), copy[letter.textKey]);
    assert.equal(await page.locator('.mail-body a').getAttribute('href'), 'https://en.wiktionary.org/wiki/%E6%9B%B0');
    assert.equal(await page.locator('.mail-message [data-citation]').count(), 0);
    if (index === nightLetters.length - 1) await page.screenshot({ path: screenshot });
    await page.locator('[data-mail-back]').click();
    await page.keyboard.press('Shift');
    assert.equal((await received()).length, index + 1);
    assert.equal((await received())[index].read, true);
    await page.clock.setFixedTime(at(22, 9 + index * 5));
  }
  // Resuming on another night keeps the final cutoff and never restarts the joke.
  await page.clock.setFixedTime(new Date(2027, 0, 16, 23));
  await page.reload();
  await page.waitForFunction(() => window.YHWH?.active());
  await page.keyboard.press('Shift');
  assert.equal((await received()).length, 4);
  await page.evaluate(() => window.YHWH.run('inbox'));
  for (const letter of nightLetters) assert.equal(await page.locator(`[data-mail="${letter.id}"].unread`).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
};
