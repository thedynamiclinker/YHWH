const assert = require('node:assert/strict');

module.exports = async function checkTerminalLayout(page, app, screenshot) {
  const run = name => page.evaluate(name => window.YHWH.run(name), name);
  const move = area => page.evaluate(area => window.YHWH.movePanel('terminal', area), area);
  const fitted = () => page.waitForFunction(() => {
    const tab = window.YHWH.active(), panel = document.querySelector('#terminal-panel').getBoundingClientRect();
    return panel.width >= 280 && panel.height >= 90 && tab.terminal.cols > 20 && tab.terminal.rows > 1
      && tab.terminals.find(session => session.id === tab.terminalId)?.shellSize === `${tab.terminal.cols}x${tab.terminal.rows}`;
  });
  const win = await app.browserWindow(page);
  const original = await win.evaluate(win => win.getSize());
  try {
    await move('right'); await fitted();
    await page.waitForFunction(() => document.querySelector('#terminal-panel').getBoundingClientRect().height >= document.querySelector('#workspace').getBoundingClientRect().height - 2);
    await win.evaluate(win => win.setSize(900, 650)); await fitted();
    assert.equal(await page.locator('#terminal-panel [data-command=terminal-bottom]').isVisible(), true);
    assert.equal(await page.evaluate(() => document.querySelector('#terminal-panel').getBoundingClientRect().right <= innerWidth), true);
    await page.screenshot({ path: screenshot });
    // A drop on a docked panel must not bubble into its former right container,
    // which would immediately dock it right again and make it appear stuck.
    await page.evaluate(() => {
      const dataTransfer = new DataTransfer(); dataTransfer.setData('application/x-yhwh-panel', 'terminal');
      document.querySelector('#terminal-panel').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
    });
    assert.equal(await page.locator('#focus-area > #terminal-panel').count(), 1);
    await fitted();
    // Hiding an ancestor must leave the running PTY's last useful size intact.
    const size = await page.evaluate(async () => {
      const tab = window.YHWH.active(), before = tab.terminals.find(session => session.id === tab.terminalId)?.shellSize;
      document.querySelector('#focus-area').hidden = true;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { before, after: tab.terminals.find(session => session.id === tab.terminalId)?.shellSize, actual: `${tab.terminal.cols}x${tab.terminal.rows}` };
    });
    assert.equal(size.after, size.before); assert.equal(size.actual, size.before);
    await page.evaluate(() => { document.querySelector('#focus-area').hidden = false; }); await fitted();
    for (const area of ['left', 'center', 'right']) { await move(area); await fitted(); }
    await page.locator('#terminal-panel [data-command=terminal-bottom]').click();
    assert.equal(await page.locator('#focus-area > #terminal-panel').count(), 1); await fitted();
    await move('right'); await run('expand-terminal'); await fitted();
    assert.equal(await page.locator('#focus-area > #terminal-panel').count(), 1);
    assert.equal(await page.evaluate(() => window.YHWH.active().expanded), 'terminal');
    await run('expand-terminal'); await fitted();
    await page.evaluate(() => window.YHWH.active().terminal.focus());
    // Check the real shell, not just xterm's displayed dimensions.
    const dimensions = await page.evaluate(() => ({ rows: window.YHWH.active().terminal.rows, cols: window.YHWH.active().terminal.cols }));
    await page.keyboard.type('printf "LAYOUT:"; stty size'); await page.keyboard.press('Enter');
    await page.waitForFunction(({ rows, cols }) => {
      const terminal = window.YHWH.active().terminal;
      for (let line = 0; line < terminal.buffer.active.length; line++)
        if (terminal.buffer.active.getLine(line)?.translateToString().trim() === `LAYOUT:${rows} ${cols}`) return true;
      return false;
    }, dimensions);
  } finally {
    await page.evaluate(() => { document.querySelector('#focus-area').hidden = false; window.YHWH.active().expanded = ''; });
    await run('terminal-bottom');
    await win.evaluate((win, size) => win.setSize(...size), original);
    await fitted();
  }
};
