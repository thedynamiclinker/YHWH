const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  clipboard,
  Menu,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { pathToFileURL } = require("node:url");
const { Workspace } = require("../../../lib/company/workspace.cjs");
const { hunks } = require("../../../lib/company/repository.cjs");
const { Review } = require("../../../lib/company/review.cjs");
const { primarySender, emailLetters } = require("../../../lib/inbox.cjs");
const { etc, output } = require("../../../lib/paths.cjs");
const thwh = process.argv.includes("--thwh");

if (thwh) {
  app.setPath("userData", require("../../../lib/company/thwh-profile.cjs")());
} else if (process.env.YHWH_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.YHWH_DATA_DIR));
app.setName(thwh ? "THWH" : "𐤉𐤄𐤅𐤄");
if (!app.requestSingleInstanceLock()) {
  app.quit();
}
let window;
let workspace;
let review;
let closeApproved = false;
let queue = Promise.resolve();
const entry = path.join(__dirname, thwh ? "thwh.html" : "index.html");
const entryUrl = pathToFileURL(entry).href;
app.on("second-instance", () => {
  if (window) {
    if (window.isMinimized()) window.restore();
    window.focus();
  }
});

function handle(channel, callback, serial = true) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.senderFrame.url !== entryUrl)
      throw new Error("Untrusted window.");
    if (!serial) return callback(...args);
    // Model calls, approvals and saves share a queue: a late model response
    // must never replace a newer review decision or race another Git commit.
    const operation = queue.then(() => callback(...args));
    queue = operation.catch(() => {});
    return operation;
  });
}

async function readEmail(letter) {
  try {
    const words = JSON.parse(await fs.readFile(etc("default", "words.json"), "utf8"));
    const body = words[letter.textKey];
    const link = body.match(/https?:\/\/[^\s)>]+/u)?.[0];
    const { response } = await dialog.showMessageBox(window, {
      title: "YHWH emails",
      message: letter.title,
      detail: 'From: YHWH <' + primarySender + '>\n\n' + body,
      buttons: link ? ["Close", "Open link"] : ["Close"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response === 1 && link) await shell.openExternal(link);
  } catch (error) {
    dialog.showErrorBox("Could not open YHWH email", error.message);
  }
}

async function openUniverse(action) {
  try {
    const picked = await dialog.showOpenDialog(window, {
      title: action === "nu" ? "Choose a parent directory" : "Choose a universe directory",
      defaultPath: process.cwd(),
      properties: ["openDirectory"],
    });
    if (picked.canceled) return;
    const [directory] = picked.filePaths;
    if (action !== "nu") await require("../../../lib/universes.cjs").enter(directory);
    const env = { ...process.env };
    for (const key of ["ELECTRON_RUN_AS_NODE", "YHWH_DATA_DIR", "YHWH_TAB", "YHWH_INTERFACE"]) delete env[key];
    const bin = path.join(__dirname, "../../../bin"), node = env.YHWH_NODE || "node";
    try { await fs.access(output("default/ui/renderer.js")); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      await promisify(execFile)(node, [path.join(bin, "build.cjs"), "default"], { env });
    }
    const child = spawn(node, [path.join(bin, "yhwh"), "open", "default", "--open", directory, `--universe=${action}`], { env, stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", chunk => { errors = (errors + chunk).slice(-4000); });
    child.on("error", error => dialog.showErrorBox("Could not open YHWH", error.message));
    child.on("close", code => {
      if (code) dialog.showErrorBox("Could not open YHWH", errors.trim() || `Exited with status ${code}.`);
    });
  } catch (error) {
    dialog.showErrorBox("Could not open universe", error.message);
  }
}

app
  .whenReady()
  .then(async () => {
    workspace = new Workspace(path.join(app.getPath("userData"), "workspace"));
    await workspace.load();
    review = new Review(
      path.join(app.getPath("userData"), "review.json"),
      process.cwd(),
    );
    await review.load();
    if (thwh) review = await require("../../../lib/company/thwh.cjs").register({ handle, app, review, workspace });
    else {
      const themeFlag = process.argv.indexOf("--theme");
      if (themeFlag >= 0) await workspace.act("settings", { theme: process.argv[themeFlag + 1] });
    }
    handle("workspace:read", () => workspace.view());
    handle("workspace:act", async (action, input) => {
      if (action === "chat" && input?.review) {
        const view = await review.act("read");
        input = { ...input, reviewContext: {
          root: view.root, round: view.round, status: view.status,
          hunk: view.hunks[view.hunk], position: view.hunk + 1,
          total: view.hunks.length, comments: view.comments,
        } };
      }
      return workspace.act(action, input);
    });
    handle("review:read", () => review.act("read"));
    handle("review:act", (action, input) => review.act(action, input));
    handle("review:choose", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "Choose a workspace containing .review/plan.json",
        properties: ["openDirectory"],
      });
      return result.canceled ? null : review.choose(result.filePaths[0]);
    });
    handle("review:export", async () => {
      const result = await dialog.showOpenDialog(window, {
        title: "Export the selected review's files into a new subfolder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled) return null;
      const view = await review.act("read");
      const target = await fs.mkdtemp(path.join(result.filePaths[0], "review-files-"));
      await fs.writeFile(path.join(target, thwh ? path.basename(view.paths.master) : "MASTER.md"), view.master);
      await fs.writeFile(path.join(target, thwh ? path.basename(view.paths.board) : "Kanbun.md"), view.board);
      return target;
    });
    handle("patch:hunks", (patch) => {
      if (typeof patch !== "string" || patch.length > 500000)
        throw new Error("Invalid patch.");
      return hunks(patch);
    });
    handle("clipboard:write", (content) => {
      if (typeof content !== "string") throw new Error("Invalid text.");
      clipboard.writeText(content.slice(0, 1000000));
      return true;
    });
    handle("repository:import", async ({ companyId, base, draft }) => {
      const result = await dialog.showOpenDialog(window, {
        title: "Choose a local Git repository to copy and review",
        properties: ["openDirectory"],
      });
      if (result.canceled) return null;
      return workspace.import(companyId, result.filePaths[0], base, draft);
    });
    handle("workspace:export", async (companyId) => {
      const result = await dialog.showOpenDialog(window, {
        title: "Export files into a new subfolder",
        properties: ["openDirectory", "createDirectory"],
      });
      if (result.canceled) return null;
      return workspace.export(companyId, result.filePaths[0]);
    });
    handle("workspace:folder", () => shell.openPath(workspace.directory));
    handle("window:close", () => {
      closeApproved = true;
      window.close();
    });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === "darwin"
          ? [
              {
                label: app.name,
                submenu: [
                  { role: "about" },
                  { type: "separator" },
                  { role: "quit" },
                ],
              },
            ]
          : []),
        {
          label: "File",
          submenu: [
            {
              label: "Export files",
              accelerator: "CmdOrCtrl+Shift+E",
              click: () => window.webContents.send("ui:export"),
            },
            {
              label: "Universes",
              submenu: [
                { label: "Nu · Make new universe…", click: () => openUniverse("nu") },
                { label: "Cd · Enter universe…", click: () => openUniverse("cd") },
                { label: "Go · Chroot universe…", click: () => openUniverse("go") },
              ],
            },
            { type: "separator" },
            { role: "quit" },
          ],
        },
        {
          label: "Edit",
          submenu: [
            { role: "undo" },
            { role: "redo" },
            { type: "separator" },
            { role: "cut" },
            { role: "copy" },
            { role: "paste" },
            { role: "selectAll" },
          ],
        },
        {
          label: "View",
          submenu: [
            { role: "reload" },
            { role: "toggleDevTools" },
            { type: "separator" },
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
        {
          label: "Help",
          role: "help",
          submenu: [
            { label: "YHWH emails", submenu: emailLetters.map(letter => ({
              label: letter.title,
              click: () => readEmail(letter),
            })) },
            { type: "separator" },
            ...require("../../../etc/company/help-links.json").map(({ label, url }) => ({
              label,
              click: () => shell.openExternal(url),
            })),
          ],
        },
      ]),
    );
    function createWindow() {
      closeApproved = false;
      window = new BrowserWindow({
        width: 1510,
        height: 980,
        minWidth: 1060,
        minHeight: 700,
        title: thwh ? "THWH" : "𐤉𐤄𐤅𐤄",
        backgroundColor: "#19191e",
        autoHideMenuBar: false,
        icon: require('../../../lib/paths.cjs').etc('assets', 'icon.png'),
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webviewTag: false,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      let loaded = false;
      window.webContents.on("did-finish-load", () => {
        loaded = true;
      });
      window.on("close", (event) => {
        if (
          closeApproved ||
          !loaded ||
          window.webContents.isDestroyed() ||
          window.webContents.isCrashed()
        )
          return;
        event.preventDefault();
        window.webContents.send("ui:before-close");
      });
      window.webContents.on("will-navigate", (event, url) => {
        if (url !== entryUrl) event.preventDefault();
      });
      window.webContents.session.setPermissionRequestHandler(
        (_content, _permission, callback) => callback(false),
      );
      window.loadFile(entry);
    }
    createWindow();
    app.on("activate", () => {
      if (!BrowserWindow.getAllWindows().length) createWindow();
    });
  })
  .catch((error) => {
    dialog.showErrorBox("The workspace could not open", error.message);
    app.exit(1);
  });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
