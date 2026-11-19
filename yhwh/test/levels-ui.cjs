const assert = require('node:assert/strict');
const { levelAt } = require('../lib/levels.cjs');

module.exports = async function checkLevels(page, screenshot) {
  const run = command => page.evaluate(command => window.YHWH.run(command), command);
  const level = id => page.waitForFunction(id => document.body.dataset.level === id, id);
  const welcome = page.locator('.document-content:visible .welcome');
  const upgrade = page.locator('#upgrade-button'), dialog = page.locator('#dialog');
  const choose = async (energy, id) => {
    await page.locator('#mode-name').click();
    await dialog.locator(`[data-energy="${energy}"]`).click();
    await level(id);
  };

  await run('new-tab'); await run('focus-document');
  await choose(0, 'dawkins');
  assert.match(await welcome.innerText(), /The old testament god is the most unpleasant character in all fiction\./);
  await choose(50, 'nietzsche');
  assert.match(await welcome.innerText(), /God is dead\.[\s\S]*It's Over Man\.™[\s\S]*Lord is a four letter word\./);
  assert.match(await page.locator('#margin-box').innerText(), /Nietzsche Family Circus/);
  await choose(100, 'yhwh');
  assert.match(await welcome.innerText(), /Welcome to We\.[\s\S]*God is a four letter word\.[\s\S]*LD is a four letter word\./);
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-energy="120"], [data-energy="140"]').count(), 0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  assert.equal(await upgrade.innerText(), '曰');
  await upgrade.click();
  assert.match(await dialog.innerText(), /Upgrade to YHWH Pro![\s\S]*Now with Mo' YHWH![\s\S]*Pro-Mo code YHWH\.[\s\S]*Hey Mo, have you seen Abe\?/);
  await dialog.getByText('Set up Stripe', { exact: true }).click();
  assert.equal(await dialog.getByRole('link', { name: /Create Payment Links/ }).isVisible(), true);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  assert.equal(await upgrade.innerText(), '曰');
  await upgrade.click();
  await dialog.getByRole('button', { name: 'Steal Upgrade' }).click();
  await level('pro');
  assert.match(await welcome.innerText(), /Welcome to 山三[\s\S]*Hey Mo/);
  assert.equal(await welcome.locator('pre').textContent(), levelAt(120).poem);
  assert.equal(await upgrade.innerText(), '咱');
  assert.equal(await page.locator('#energy').getAttribute('max'), '120');
  await upgrade.click();
  await dialog.getByRole('heading', { name: 'Upgrade to Zanmen Elite!' }).waitFor();
  await dialog.getByRole('button', { name: 'Steal Upgrade' }).click();
  await level('elite');
  assert.equal(await upgrade.isVisible(), false);
  assert.match(await welcome.innerText(), /YHWH level Zanmen[\s\S]*Hey Josh/);
  assert.deepEqual(await welcome.locator('pre').allTextContents(), [levelAt(140).welcomePoem, levelAt(140).poem]);
  assert.equal(await page.locator('#file-filter').getAttribute('placeholder'), levelAt(140).filter);
  assert.equal(await page.locator('#energy').getAttribute('max'), '140');
  await page.locator('#energy').press('Home');
  await level('dawkins');
  await page.locator('#energy').press('End');
  await level('elite');
  if (screenshot) await page.screenshot({ path: screenshot });
};
