const assert = require('node:assert/strict');
const { primarySender, alternateSenders, letters, emailLetters } = require('../lib/inbox.cjs');
const { nightLetters, letterInterval } = require('../lib/presence.cjs');
const copy = require('../etc/default/words.json');

module.exports = async function checkStartupInbox(page, screenshots) {
  const start = new Date(2027, 0, 15, 21).getTime();
  const readState = () => page.evaluate(() => JSON.parse(localStorage.getItem('yhwh:presence:v1')));
  const run = name => page.evaluate(name => window.YHWH.run(name), name);
  await page.clock.setFixedTime(new Date(start));
  // Preserve a legacy letter without a sender; isolate the existing name arc.
  await page.evaluate(({ start, ids }) => localStorage.setItem('yhwh:presence:v1', JSON.stringify({
    letters: [{ id: 'house', read: true, at: start - 60000 }, ...ids.map(id => ({ id, read: true, at: start - 60000 }))],
    steps: [], enabled: false, nightStartedAt: start,
  })), { start, ids: nightLetters.map(letter => letter.id) });
  await page.reload(); await page.waitForFunction(() => window.YHWH?.active());
  await run('inbox');
  await page.locator('[data-mail="house"]').click();
  assert.ok((await page.locator('.mail-envelope').innerText()).includes(primarySender));
  const sources = page.locator('.mail-source');
  const commentary = sources.locator('.verse-commentary');
  const color = selector => sources.locator(selector).first().evaluate(node => getComputedStyle(node).color);
  await sources.locator('.verse-english').waitFor();
  assert.equal(await color('.verse-english .source-j'), 'rgb(148, 192, 145)');
  await page.locator('[data-mail-back]').click();

  const night = letters.filter(letter => letter.afterMinutes !== undefined);
  for (const [index, letter] of night.entries()) {
    const at = start + letter.afterMinutes * 60000;
    await page.clock.setFixedTime(new Date(at));
    await page.keyboard.press('Shift');
    const received = (await readState()).letters.filter(item => item.id.startsWith('night-'));
    assert.deepEqual(received.map(item => item.id), night.slice(0, index + 1).map(item => item.id));
    await run('inbox'); await page.locator(`[data-mail="${letter.id}"]`).click();
    assert.equal(await page.locator('.mail-body .character-copy').innerText(), copy[letter.textKey]);
    assert.ok((await page.locator('.mail-envelope').innerText()).includes(primarySender));
    assert.equal(await page.locator('.mail-envelope time').getAttribute('datetime'), new Date(at).toISOString());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (letter.id === 'night-milk') await page.screenshot({ path: screenshots.night });
    if (letter.id === 'night-runway') {
      const citation = commentary.locator('summary');
      const commentaryText = commentary.locator('.verse-commentary-text');
      await citation.waitFor();
      assert.equal(await sources.locator(':scope > summary').textContent(), 'In the Margins, Literary sources');
      assert.equal(await sources.evaluate(node => node.open), true);
      assert.equal(await citation.textContent(), 'From We The Nameless: Genesis 17:8');
      assert.equal(await commentaryText.isVisible(), false);
      assert.equal(await color('.verse-english .source-p'), 'rgb(109, 136, 174)');
      await citation.click();
      assert.equal(await commentaryText.isVisible(), true);
      await citation.click();
      assert.equal(await commentaryText.isVisible(), false);
      await sources.locator(':scope > summary').press('Enter');
      assert.equal(await citation.isVisible(), false);
      await sources.locator(':scope > summary').press('Enter');
      assert.equal(await citation.isVisible(), true);
      assert.equal(await commentaryText.isVisible(), false);
    }
    if (letter.id === 'night-keyboard') await page.screenshot({ path: screenshots.keyboard });
    await page.locator('[data-mail-back]').click();
  }

  const blockedAt = new Date(2027, 0, 16, 12).getTime();
  await page.clock.setFixedTime(new Date(blockedAt));
  await page.locator('[data-mail-settings]').click();
  assert.equal(await page.locator('[name=blocked_yhwh]').isVisible(), false);
  await page.locator('.mail-sender-settings summary').click();
  await page.locator('[name=blocked_yhwh]').check();
  await page.locator('[data-mail-cancel]').click();
  assert.ok(!(await readState()).blockedYhwh);
  await page.locator('[data-mail-settings]').click();
  await page.locator('.mail-sender-settings summary').click();
  await page.locator('[name=blocked_yhwh]').check();
  await page.screenshot({ path: screenshots.settings });
  await page.locator('#mail-settings-form [type=submit]').click();
  assert.equal((await readState()).blockedAt, blockedAt);

  // Reload through the real renderer, rather than resetting the model.
  await page.reload(); await page.waitForFunction(() => window.YHWH?.active());
  await run('inbox'); await page.locator('[data-mail-settings]').click();
  await page.locator('.mail-sender-settings summary').click();
  assert.equal(await page.locator('[name=blocked_yhwh]').isChecked(), true);
  await page.locator('[data-mail-cancel]').click();
  assert.ok((await readState()).letters.filter(item => item.id.startsWith('night-')).every(item => item.read));

  // The master switch silences an alternate-address reply too.
  await run('settings'); await page.locator('[data-category=presence]').click();
  await page.locator('[name=inbox]').uncheck();
  await page.locator('#settings-form [type=submit]').click();
  await page.locator('#dialog').waitFor({ state: 'hidden' });
  await page.clock.setFixedTime(new Date(blockedAt + 5 * 60000));
  await page.keyboard.press('Shift');
  assert.equal((await readState()).letters.filter(item => item.id.startsWith('blocked-')).length, 0);
  await run('settings'); await page.locator('[data-category=presence]').click();
  await page.locator('[name=inbox]').check();
  await page.locator('#settings-form [type=submit]').click();
  await page.locator('#dialog').waitFor({ state: 'hidden' });

  const replies = letters.filter(letter => letter.afterBlockMinutes !== undefined);
  for (const [index, letter] of replies.entries()) {
    await page.clock.setFixedTime(new Date(blockedAt + letter.afterBlockMinutes * 60000));
    await page.keyboard.press('Shift');
    const received = (await readState()).letters.filter(item => item.id.startsWith('blocked-'));
    assert.deepEqual(received.map(item => item.sender), alternateSenders.slice(0, index + 1));
    await run('inbox'); await page.locator(`[data-mail="${letter.id}"]`).click();
    assert.ok((await page.locator('.mail-envelope').innerText()).includes(alternateSenders[index]));
    assert.equal(await page.locator('.mail-body .character-copy').innerText(), copy[letter.textKey]);
    if (letter.id === 'blocked-yahoo') await page.screenshot({ path: screenshots.yahoo });
    await page.locator('[data-mail-back]').click();
  }
  // A new ordinary work topic stays blocked even after the cooldown expires.
  await page.clock.setFixedTime(new Date(blockedAt + 60 * 60000));
  await run('new-tab');
  assert.ok(!(await readState()).letters.some(item => item.id === 'covenant'));
  await run('inbox');
  assert.equal(await page.locator('[data-mail="house"]').count(), 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);

  // Work advances the authored correspondence even after its own topic was delivered.
  await page.clock.setFixedTime(new Date(blockedAt));
  await page.evaluate(at => localStorage.setItem('yhwh:presence:v1', JSON.stringify({
    letters: [{ id: 'covenant', read: true, at }],
    lastLetter: at,
  })), blockedAt - letterInterval);
  await page.reload(); await page.waitForFunction(() => window.YHWH?.active());
  for (const [index, letter] of emailLetters.entries()) {
    const now = blockedAt + index * letterInterval;
    await page.clock.setFixedTime(new Date(now));
    await run('new-tab'); await run('inbox');
    await page.locator('[data-mail="' + letter.id + '"].unread').click();
    assert.equal(await page.locator('.mail-message h1').textContent(), letter.title);
    const link = copy[letter.textKey].match(/https?:\/\/[^\s)]+/)?.[0];
    const links = await page.locator('.mail-body a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
    assert.deepEqual(links, link ? [link] : [], letter.id);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const received = (await readState()).letters.slice(1);
    assert.equal(received.length, index + 1);
    assert.deepEqual(received.at(-1), { id: letter.id, sender: primarySender, read: true, at: now });
  }
  await page.reload(); await page.waitForFunction(() => window.YHWH?.active());
  await run('inbox');
  assert.equal(await page.locator('.mail-row').count(), emailLetters.length + 1);
  assert.equal(await page.locator('.mail-row.unread').count(), 0);
};
