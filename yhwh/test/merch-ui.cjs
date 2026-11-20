const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

module.exports = async function checkMerch(page, { opened, screenshot }) {
  const run = name => page.evaluate(name => window.YHWH.run(name), name);
  const dialog = page.locator('#dialog');
  const close = () => dialog.getByRole('button', { name: 'Close dialog' }).click();
  const button = name => dialog.getByRole('button', { name, exact: true });
  const guide = id => dialog.locator(`[data-merch-guide="${id}"]`).click();
  const shop = id => dialog.locator(`[data-merch-store="${id}"]`);
  const check = dialog.getByRole('checkbox', { name: 'Mark step complete' });
  const status = dialog.locator('[data-merch-status]');
  const url = dialog.getByLabel('Public storefront URL');
  const save = button('Save URL');
  const primary = 'https://yhwh-shop.example/';
  const secondary = 'https://yhwh-shirts.example/';
  async function openedBy(action, expected) {
    const previous = await opened();
    await action();
    for (let attempt = 0; attempt < 40; attempt++) {
      if ((await opened()).length > previous.length) break;
      await delay(25);
    }
    assert.deepEqual((await opened()).slice(previous.length), [expected]);
  }

  await page.clock.setFixedTime(new Date(2027, 1, 10, 12));
  await run('about');
  assert.equal(await dialog.locator('.merch-links').textContent(), 'YHWH merch!');
  await close();
  const mobile = await page.locator('body').evaluate(body => body.classList.contains('is-mobile'));
  if (mobile) await page.getByRole('button', { name: 'Open menu' }).tap();
  const shortcut = page.locator(mobile ? '#mobile-dialog #merch-shortcut' : '.statusbar #merch-shortcut');
  assert.equal(await shortcut.isVisible(), true);
  assert.equal(await shortcut.textContent(), 'YHWH merch!');
  const fourthwall = shortcut.locator('[data-merch-store="fourthwall"]');
  assert.match(await fourthwall.getAttribute('title'), /Fourthwall/);
  if (mobile) await fourthwall.tap();
  else await fourthwall.press('Enter');
  await dialog.getByRole('heading', { name: 'Fourthwall setup' }).waitFor();
  await openedBy(() => button('Open Fourthwall ↗').click(), 'https://fourthwall.com/');
  assert.equal(await check.isChecked(), false);
  await check.check();
  await button('Next').click();
  await dialog.getByRole('heading', { name: 'Design your first shirt' }).waitFor();
  await close();
  await run('about');
  await shop('shopify').click();
  await dialog.getByRole('heading', { name: 'Printify + Shopify setup' }).waitFor();
  await openedBy(() => button('Open Shopify ↗').click(), 'https://www.shopify.com/');
  await button('Next').click();
  await openedBy(() => button('Open Printify ↗').click(), 'https://printify.com/');
  assert.equal(await dialog.locator('[data-merch-count]').textContent(), '0 complete');
  await button('Storefront URL').click();
  await url.fill(secondary);
  await save.click();
  await status.filter({ hasText: /URL saved/ }).waitFor();
  await close();

  await run('settings');
  await button('Presence').click();
  await button('Merch store setup').click();
  await guide('fourthwall');
  await dialog.getByRole('heading', { name: 'Design your first shirt' }).waitFor();
  await button('Back').click();
  assert.equal(await check.isChecked(), true);
  assert.equal(await dialog.locator('[data-merch-count]').textContent(), '1 complete');
  await button('Storefront URL').click();
  for (const invalid of ['file:///tmp/shop', 'http://example.com/', 'https://login:secret@example.com/', 'https://admin.shopify.com/store/yhwh']) {
    await url.fill(invalid);
    await save.click();
    assert.equal(await url.getAttribute('aria-invalid'), 'true');
  }
  await url.fill(primary);
  await openedBy(() => button('Test in browser ↗').click(), primary);
  assert.equal(await page.evaluate(() => window.YHWH.active().config.values.merch_fourthwall_url || ''), '');
  await save.click();
  await status.filter({ hasText: /URL saved/ }).waitFor();
  if (screenshot) await page.screenshot({ path: screenshot });
  await close();

  // Leave the regular mail queue available but mark the tab topic as seen.
  await page.evaluate(() => localStorage.setItem('yhwh:presence:v1', JSON.stringify({
    letters: [{ id: 'covenant', at: Date.now(), read: true }], lastLetter: Date.now(),
  })));
  await page.reload();
  await page.waitForFunction(() => window.YHWH?.active());
  await run('about');
  await openedBy(() => shop('fourthwall').click(), primary);
  await openedBy(() => shop('shopify').click(), secondary);
  await close();
  await run('new-tab');
  const received = () => page.evaluate(() => JSON.parse(localStorage.getItem('yhwh:presence:v1')).letters.filter(letter => letter.id === 'merch').length);
  assert.equal(await received(), 0);
  await page.clock.setFixedTime(new Date(2027, 1, 10, 12, 5));
  await run('new-tab');
  await run('inbox');
  await page.locator('[data-mail="merch"]').click();
  assert.equal(await page.locator('.mail-body .merch-links').textContent(), 'YHWH merch!');
  await page.clock.setFixedTime(new Date(2027, 1, 10, 12, 10));
  await run('new-tab');
  assert.equal(await received(), 1);

  await run('merch-setup');
  await guide('fourthwall');
  assert.equal(await url.inputValue(), primary);
  assert.equal(await dialog.locator('[data-merch-count]').textContent(), '1 complete');
  await button('Clear saved URL').click();
  await status.filter({ hasText: 'Storefront URL cleared.' }).waitFor();
  assert.equal(await page.evaluate(() => window.YHWH.active().config.values.merch_shopify_url), secondary);
  await close();
  await run('about');
  await shop('fourthwall').click();
  await dialog.getByRole('heading', { name: 'Fourthwall setup' }).waitFor();
  assert.equal(await url.inputValue(), '');
  await close();
};
