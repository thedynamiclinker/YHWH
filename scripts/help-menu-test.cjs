const assert = require("node:assert/strict");

module.exports = async function checkHelpMenu(app) {
  const result = await app.evaluate(async ({ Menu, shell, BrowserWindow }) => {
    const help = Menu.getApplicationMenu().items.find(item => item.label === "Help");
    const opened = [];
    const original = shell.openExternal;
    shell.openExternal = async url => { opened.push(url); };
    try {
      for (const item of help.submenu.items) await item.click();
    } finally {
      shell.openExternal = original;
    }
    return {
      labels: help.submenu.items.map(item => item.label),
      opened,
      visible: process.platform === "darwin" || BrowserWindow.getAllWindows()[0].isMenuBarVisible(),
    };
  });
  assert.equal(result.visible, true);
  assert.deepEqual(result.labels, ["About Us", "About YHWH"]);
  assert.deepEqual(result.opened, [
    "https://www.amazon.com/stores/The-Nameless/author/B0HP8PGPW7",
    "https://www.amazon.com/clp/B0HNR3B4MB?lv=shuf&channelId=500",
  ]);
};
