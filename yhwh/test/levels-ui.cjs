const assert = require('node:assert/strict');
const { levelAt } = require('../lib/levels.cjs');

module.exports = async function checkLevels(page, screenshot) {
  const run = command => page.evaluate(command => window.YHWH.run(command), command);
  const level = id => page.waitForFunction(id => document.body.dataset.level === id, id);
  const welcome = page.locator('.document-content:visible .welcome');
  const upgrade = page.locator('#upgrade-button'), dialog = page.locator('#dialog');
  const slider = page.locator('#energy');
  const unsteal = dialog.getByRole('button', { name: 'Unsteal Upgrade' });
  const steal = dialog.getByRole('button', { name: 'Steal Upgrade' });
  const defaultWelcome = async () => {
    const text = await welcome.innerText();
    assert.match(text, /Welcome to We\.[\s\S]*Where are you\?[\s\S]*Hey Abe, can I stay with you for a bit\?/);
    assert.doesNotMatch(text, /YHWH level YHWH|four letter word/i);
  };
  const checkAbout = async notes => {
    await page.getByRole('button', { name: 'About YHWH', exact: true }).click();
    const text = await dialog.innerText();
    for (const note of notes) assert.ok(text.includes(note), note);
    await dialog.getByRole('button', { name: 'Close dialog' }).click();
  };
  const choose = async (energy, id) => {
    await page.locator('#mode-name').click();
    await dialog.locator(`[data-energy="${energy}"]`).click();
    await level(id);
  };

  await run('new-tab'); await run('focus-document');
  await choose(0, 'dawkins');
  assert.match(await welcome.innerText(), /The old testament god is the most unpleasant character in all fiction\./);
  await choose(50, 'nietzsche');
  assert.match(await welcome.innerText(), /God is dead\.[\s\S]*It's Over Man\.™/);
  assert.doesNotMatch(await welcome.innerText(), /four letter word/);
  await checkAbout(['Lord is a four letter word.']);
  assert.match(await page.locator('#margin-box').innerText(), /Nietzsche Family Circus/i);
  await choose(100, 'yhwh');
  await defaultWelcome();
  await checkAbout(['God is a four letter word.', 'LD is a four letter word.']);
  await run('new-tab'); await run('focus-document');
  await defaultWelcome();
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-energy="120"], [data-energy="140"]').count(), 0);
  assert.equal(await unsteal.count(), 0);
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
  assert.equal(await slider.getAttribute('max'), '3');
  await slider.press('ArrowLeft');
  await level('yhwh');
  await defaultWelcome();
  await slider.press('ArrowRight');
  await level('pro');
  await upgrade.click();
  await dialog.getByRole('heading', { name: 'Upgrade to Zanmen Elite!' }).waitFor();
  await dialog.getByRole('button', { name: 'Steal Upgrade' }).click();
  await level('elite');
  assert.equal(await upgrade.isVisible(), false);
  assert.match(await welcome.innerText(), /YHWH level Zanmen[\s\S]*Hey Josh/i);
  assert.deepEqual(await welcome.locator('pre').allTextContents(), [levelAt(140).welcomePoem, levelAt(140).poem]);
  assert.equal(await page.locator('#file-filter').getAttribute('placeholder'), levelAt(140).filter);
  assert.equal(await slider.getAttribute('max'), '4');
  const poemStyles = await welcome.locator('pre code').evaluateAll(async blocks => {
    const font = `16px ${getComputedStyle(blocks[0]).fontFamily}`;
    const faces = await document.fonts.load(font);
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = font;
    const width = ctx.measureText(' ').width;
    const glyphs = [...new Set(blocks.flatMap(block => [...block.textContent]).filter(char => char.trim()))];
    const han = glyphs.filter(char => /\p{Script=Han}/u.test(char));
    const other = glyphs.filter(char => !han.includes(char));
    const near = (actual, expected) => Math.abs(actual - expected) < .01;
    return {
      loaded: faces.some(face => face.family.includes('Mono for YHWH')),
      fixedWidth: other.every(char => near(ctx.measureText(char).width, width)),
      hanWidth: han.length > 0 && han.every(char => near(3 * ctx.measureText(char).width, 5 * width)),
      styles: blocks.map(block => {
        const { fontFamily, tabSize, whiteSpace } = getComputedStyle(block);
        return { mono: fontFamily.startsWith('"Mono for YHWH"'), tabSize, whiteSpace };
      }),
    };
  });
  assert.equal(poemStyles.loaded, true);
  assert.equal(poemStyles.fixedWidth, true);
  assert.equal(poemStyles.hanWidth, true);
  assert.deepEqual(poemStyles.styles, Array(2).fill({ mono: true, tabSize: '4', whiteSpace: 'pre' }));
  await slider.press('Home');
  await level('dawkins');
  await slider.press('End');
  await level('elite');
  await slider.press('ArrowLeft');
  await level('pro');
  await slider.press('ArrowLeft');
  await level('yhwh');
  assert.equal(await slider.inputValue(), '2');
  await defaultWelcome();
  await slider.press('End');
  await level('elite');
  if (screenshot) await page.screenshot({ path: screenshot });

  await page.locator('#mode-name').click();
  await unsteal.click();
  await level('pro');
  assert.equal(await slider.getAttribute('max'), '3');
  assert.equal(await upgrade.innerText(), '咱');
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-energy="140"]').count(), 0);
  await unsteal.click();
  await level('yhwh');
  assert.equal(await slider.getAttribute('max'), '2');
  assert.equal(await upgrade.innerText(), '曰');
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-energy="120"], [data-energy="140"]').count(), 0);
  assert.equal(await unsteal.count(), 0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await upgrade.click(); await steal.click(); await level('pro');
  await upgrade.click(); await steal.click(); await level('elite');
};
