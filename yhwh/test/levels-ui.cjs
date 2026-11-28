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
    await page.locator('.titlebar [data-command="about"]').click();
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
  assert.equal(await page.evaluate(() => window.YHWH.commands.has('circus')), false);
  await choose(50, 'nietzsche');
  assert.match(await welcome.innerText(), /God is dead\.[\s\S]*It's Over Man\.™/);
  assert.doesNotMatch(await welcome.innerText(), /four letter word/);
  await checkAbout(['Lord is a four letter word.']);
  assert.match(await page.locator('#margin-box').innerText(), /Nietzsche Family Circus/i);
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-command="circus"]').isVisible(), true);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await run('palette');
  await dialog.locator('#palette-search').fill('Nietzsche Family Circus');
  assert.equal(await dialog.locator('[data-palette-command="circus"]').count(), 1);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await choose(80, 'samuel');
  assert.match(await welcome.innerText(), /Dave.*box/i);
  await choose(120, 'exodus');
  assert.match(await welcome.innerText(), /Mo.*b\*sh is burning/i);
  assert.equal(await upgrade.innerText(), '咱');
  await choose(100, 'genesis');
  await defaultWelcome();
  await checkAbout(['God is a four letter word.', 'LD is a four letter word.']);
  await run('new-tab'); await run('focus-document');
  await defaultWelcome();
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-energy="120"]').count(), 1);
  assert.equal(await dialog.locator('[data-energy="140"]').count(), 0);
  assert.equal(await dialog.locator('[data-command="circus"]').count(), 0);
  assert.equal(await unsteal.count(), 0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await run('palette');
  await dialog.locator('#palette-search').fill('Nietzsche Family Circus');
  assert.equal(await dialog.locator('[data-palette-command="circus"]').count(), 0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  assert.equal(await upgrade.innerText(), '咱');
  assert.equal(await slider.getAttribute('max'), '4');
  await upgrade.click();
  await dialog.getByRole('heading', { name: 'Upgrade to Zanmen Elite!' }).waitFor();
  await dialog.getByText('Set up Stripe', { exact: true }).click();
  assert.equal(await dialog.getByRole('link', { name: /Create Payment Links/ }).isVisible(), true);
  await steal.click();
  await level('elite');
  assert.equal(await upgrade.isVisible(), false);
  assert.match(await welcome.innerText(), /YHWH level Zanmen[\s\S]*Hey Josh/i);
  assert.deepEqual(await welcome.locator('pre').allTextContents(), [levelAt(140).welcomePoem, levelAt(140).poem]);
  assert.equal(await page.locator('#file-filter').getAttribute('placeholder'), levelAt(140).filter);
  assert.equal(await slider.getAttribute('max'), '5');
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
  await level('exodus');
  await slider.press('ArrowLeft');
  await level('genesis');
  assert.equal(await slider.inputValue(), '3');
  await defaultWelcome();
  await slider.press('End');
  await level('elite');
  if (screenshot) await page.screenshot({ path: screenshot });

  await page.locator('#mode-name').click();
  await unsteal.click();
  await level('exodus');
  assert.equal(await slider.getAttribute('max'), '4');
  assert.equal(await upgrade.innerText(), '咱');
  await page.locator('#mode-name').click();
  assert.equal(await dialog.locator('[data-energy="140"]').count(), 0);
  assert.equal(await unsteal.count(), 0);
  await dialog.getByRole('button', { name: 'Close dialog' }).click();

  await upgrade.click(); await steal.click(); await level('elite');
};
