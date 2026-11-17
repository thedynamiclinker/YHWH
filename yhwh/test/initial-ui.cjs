const assert=require('node:assert/strict');
const path=require('node:path');
module.exports=async function initialUI(page,artifacts) {
  const dialog=page.locator('#initial-dialog');
  const press=async action=>{await dialog.locator(`[data-initial="${action}"]`).click();};
  await page.locator('#initial-commands').click();
  await page.waitForSelector('#initial-dialog[open] .initial-shelf');
  assert.equal(await dialog.locator('.initial-tile').count(),6);
  await page.screenshot({path:path.join(artifacts,'initial-shelf.png')});
  // Create an alias using only glyph and action pickers, then train a mark.
  await press('alias');await press('glyph');
  await dialog.locator('[data-alphabet="Greek"]').click();
  await dialog.locator('[data-glyph="1"]').click();
  assert.equal(await dialog.locator('[name=names]').inputValue(),'beta');
  await press('action');await dialog.locator('.initial-choices button').filter({has:page.locator('b',{hasText:/^pwd$/})}).click();
  await press('train');
  const canvas=dialog.locator('canvas'),box=await canvas.boundingBox();
  await page.mouse.move(box.x+45,box.y+30);await page.mouse.down();
  await page.mouse.move(box.x+45,box.y+140,{steps:12});await page.mouse.move(box.x+140,box.y+140,{steps:12});await page.mouse.up();
  await press('match');
  await dialog.locator('form button.primary').click();
  await page.waitForSelector('#initial-dialog[open] .initial-shelf');
  await dialog.locator('[data-search]').fill('beta');
  assert.equal(await dialog.locator('.initial-tile b').textContent(),'Β');
  await dialog.locator('.initial-tile').click();
  await page.waitForSelector('#initial-dialog[open] .initial-output');
  assert.match(await dialog.locator('.initial-output').textContent(),/YHWH/);
  await press('back');await press('draw');
  const drawBox=await dialog.locator('canvas').boundingBox();
  await page.mouse.move(drawBox.x+45,drawBox.y+30);await page.mouse.down();
  await page.mouse.move(drawBox.x+45,drawBox.y+140,{steps:12});await page.mouse.move(drawBox.x+140,drawBox.y+140,{steps:12});await page.mouse.up();
  await press('match');assert.match(await dialog.locator('[data-match]').textContent(),/Β/);
  await page.screenshot({path:path.join(artifacts,'initial-gesture.png')});
  await press('back');await dialog.locator('[data-search]').fill('');
  // The substitution and output buttons build runnable syntax without text input.
  await press('clear');await press('sub');await dialog.locator('[data-find]').fill('pwd');
  await dialog.locator('.initial-choices button').first().click();
  assert.match(await dialog.locator('[data-composer]').inputValue(),/\$\('pwd'\)/);
  await press('clear');

  // Build a reusable pipeline entirely by tapping; the proposed filename is usable.
  await press('word');const filename=await dialog.locator('[data-word-name]').inputValue();
  await press('command');
  await dialog.locator('.initial-choices button').filter({has:page.locator('b',{hasText:/^ls$/})}).click();
  await press('pipe');await press('command');
  await dialog.locator('.initial-choices button').filter({has:page.locator('b',{hasText:/^view$/})}).click();
  assert.match(await dialog.locator('[data-composer]').inputValue(),/'ls' \| 'view'/);
  await press('save');
  await page.waitForSelector('#initial-dialog[open] .initial-shelf');
  await page.screenshot({path:path.join(artifacts,'initial-words.png')});
  await dialog.locator('.initial-tile').filter({has:page.locator('b',{hasText:filename})}).click();
  await page.waitForSelector('.document-content:not([hidden]) .initial-file-view');
  assert.match(await page.locator('.document-content:not([hidden]) .initial-file-view > header').textContent(),/FIXED LIST/);
  // A fixed result stays fixed while a live fm tab follows mutations.
  const frozen=await page.locator('.document-content:not([hidden]) [data-open]').count();
  await page.evaluate(()=>window.YHWH.initial.run('mkdir initial-live-test'));
  assert.equal(await page.locator('.document-content:not([hidden]) [data-open]').count(),frozen);
  await page.evaluate(()=>window.YHWH.initial.run('fm .'));
  await page.waitForSelector('.document-content:not([hidden]) .initial-file-view');
  await page.evaluate(()=>window.YHWH.initial.run('touch live-note.md'));
  await page.waitForFunction(()=>document.querySelector('.document-content:not([hidden]) .initial-file-grid')?.textContent.includes('live-note.md'));
  await page.screenshot({path:path.join(artifacts,'initial-file-manager.png')});
  await page.evaluate(()=>window.YHWH.initial.run('chroot initial-live-test'));
  assert.equal(await page.evaluate(()=>window.YHWH.active().worldRoot),'/YHWH/initial-live-test');
  await page.evaluate(()=>window.YHWH.navigate('/YHWH'));
  assert.equal(await page.evaluate(()=>window.YHWH.active().cwd),'/YHWH/initial-live-test');
  await page.evaluate(()=>window.YHWH.initial.run('chroot --leave'));
  await page.evaluate(()=>window.YHWH.run('mobile-connect'));
  assert.match(await page.locator('#mobile-dialog').textContent(),/not authorize|not connected|still to come/);
  await page.screenshot({path:path.join(artifacts,'initial-connect.png')});
  await page.locator('#mobile-dialog header button').click();
  // Recreate bridge and WebView: aliases, gestures and ordinary ~/bin files survive.
  await page.reload();await page.waitForFunction(()=>window.YHWH?.commands.has('mobile-tabs'));
  await page.locator('#initial-commands').click();await page.waitForSelector('#initial-dialog[open] .initial-shelf');
  await dialog.locator('[data-search]').fill('beta');assert.equal(await dialog.locator('.initial-tile b').textContent(),'Β');
  assert.match(await page.evaluate(async name=>(await window.YHWH.initial.readWord(name)).content,filename),/ls.*\|.*view/);
  await dialog.locator('[data-close]').click();
};
