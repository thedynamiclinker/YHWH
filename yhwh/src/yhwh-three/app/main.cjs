const ui = require('../../../lib/text.cjs').text(require('../../../etc/three/text-main.json'));
const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
} = require("electron");
const fs = require("node:fs/promises");
const watch = require("node:fs").watch;
const path = require("node:path");
const os = require("node:os");
const files = require("./files.cjs");
const { defaults, loadConfig } = require("./config.cjs");
const { openTerminal } = require("./terminal.cjs");
const { nextPair } = require("../../../lib/circus.cjs");

// Only our bundled shaders execute here. Permit Chromium's software fallback
// when a desktop/remote-session driver cannot provide a WebGL context.
if (process.env.YHWH_THREE_GPU !== "hardware")
  app.commandLine.appendSwitch("enable-unsafe-swiftshader");
if (process.env.YHWH_THREE_GPU === "software") {
  app.commandLine.appendSwitch("use-gl", "angle");
  app.commandLine.appendSwitch("use-angle", "swiftshader");
}

const profile =
  process.env.YHWH_THREE_DATA_DIR ||
  path.join(
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local/state"),
    "yhwh-three",
  );
app.setPath(ui("userdata"), profile);
let win;
const tabs = new Map();
const copyFile = require('../../../lib/paths.cjs').etc('three', 'voice.json');
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const requested = option("--root") || process.env.YHWH_THREE_OPEN || process.cwd();
const emit = (id, event) => {
  if (win && !win.isDestroyed())
    win.webContents.send("terminal", { id, ...event });
};
function tab(id) {
  if (!tabs.has(id)) throw new Error(ui("that-focus-tab-is-closed-"));
  return tabs.get(id);
}
async function config(target) {
  try {
    const result = await loadConfig(target);
    for (const key of ["theme_css", "stylesheet", "plugin"])
      if (result.values[key])
        result[key] = await fs.readFile(result.values[key], "utf8");
    if (result.values.bg) {
      const data = await files.read(result.values.bg);
      result.background = data.image;
    }
    return result;
  } catch (error) {
    return { values: defaults, files: [], warnings: error.message };
  }
}
function observe(session) {
  session.watcher?.close();
  try {
    let timer;
    session.watcher = watch(session.directory, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!win.isDestroyed())
          win.webContents.send("directory", { id: session.id });
      }, 180);
    });
    session.watcher.on("error", () => {});
  } catch {}
}

ipcMain.handle("call", async (event, method, input = {}) => {
  if (
    event.sender !== win.webContents ||
    event.senderFrame !== win.webContents.mainFrame
  )
    throw new Error(ui("only-the-application-window-can-access-files-"));
  switch (method) {
    case "bootstrap": {
      let target = path.resolve(requested);
      try {
        await fs.stat(target);
      } catch {
        target = os.homedir();
      }
      return {
        target,
        home: os.homedir(),
        profile,
        copy: JSON.parse(await fs.readFile(copyFile, "utf8")),
        copyFile,
        platform: process.platform,
      };
    }
    case "graphics-fallback": {
      if (
        process.env.YHWH_THREE_GPU === "hardware" ||
        app.commandLine.getSwitchValue("use-angle").includes("swiftshader")
      )
        return false;
      await fs.writeFile(
        path.join(profile, "graphics.json"),
        JSON.stringify({ software: true }),
      );
      // The launcher retries once with software graphics. Only requested before
      // any user interaction, so a driver failure cannot discard an editing session.
      setTimeout(() => {
        for (const session of tabs.values()) {
          session.watcher?.close();
          session.terminal?.close();
        }
        app.exit(75);
      }, 50);
      return true;
    }
    case "tab-open": {
      const directory = path.resolve(input.path);
      const stat = await fs.stat(directory);
      const cwd = stat.isDirectory() ? directory : path.dirname(directory);
      const session = { id: input.id, directory: cwd };
      tabs.set(input.id, session);
      session.terminal = await openTerminal(cwd, profile, input.id, (msg) => {
        if (msg.type === "cwd" && msg.data !== session.directory) {
          session.directory = msg.data;
          observe(session);
        }
        emit(input.id, msg);
      });
      observe(session);
      return {
        directory: await files.list(cwd),
        config: await config(directory),
      };
    }
    case "tab-close": {
      const session = tab(input.id);
      session.terminal.close();
      session.watcher?.close();
      tabs.delete(input.id);
      return true;
    }
    case "navigate": {
      const session = tab(input.id);
      const directory = await files.list(path.resolve(input.path));
      session.directory = directory.path;
      if (!input.fromTerminal) session.terminal.cd(directory.path);
      observe(session);
      return { directory, config: await config(directory.path) };
    }
    case "list":
      return files.list(input.path);
    case "read":
      return {
        ...(await files.read(input.path)),
        config: await config(input.path),
      };
    case "save":
      return files.save(input);
    case "rename":
      return files.rename(input.path, input.destination);
    case "create":
      return files.create(input.path, input.name, input.folder);
    case "trash":
      await shell.trashItem(input.path);
      return true;
    case "copy":
      await fs.cp(input.path, input.destination, {
        recursive: true,
        errorOnExist: true,
        force: false,
      });
      return true;
    case "terminal-input":
      tab(input.id).terminal.write({ type: "input", data: input.data });
      return true;
    case "terminal-resize":
      tab(input.id).terminal.write({
        type: "resize",
        cols: Math.max(2, Math.min(500, input.cols)),
        rows: Math.max(2, Math.min(300, input.rows)),
      });
      return true;
    case "choose":
      return (
        await dialog.showOpenDialog(win, {
          properties: input.directory ? [ui("opendirectory")] : [ui("openfile")],
        })
      ).filePaths[0];
    case "external": {
      const url = new URL(input.url);
      if (!["https:", "http:", "mailto:"].includes(url.protocol))
        throw new Error(ui("unsupported-link-"));
      await shell.openExternal(url.href);
      return true;
    }
    case "open-external":
      return shell.openPath(input.path);
    case "reveal":
      shell.showItemInFolder(input.path);
      return true;
    case "circus":
      return nextPair();
    case "voice":
      return JSON.parse(await fs.readFile(copyFile, "utf8"));
    case "offering": {
      const selected = (
        await dialog.showOpenDialog(win, {
          title: ui("piece-offering-choose-a-file-to-stage-locally"),
          properties: [ui("openfile")],
        })
      ).filePaths[0];
      if (!selected) return null;
      const receipt = {
        path: selected,
        name: path.basename(selected),
        size: (await fs.stat(selected)).size,
        endpoint: "https://thedynamiclinker.com",
        status: ui("staged-locally-upload-endpoint-has-not-been-conn"),
      };
      await fs.writeFile(
        path.join(profile, "piece-offering.json"),
        JSON.stringify(receipt, null, 2),
      );
      return receipt;
    }
    default:
      throw new Error(ui("unknown-action-", method));
  }
});

app.whenReady().then(async () => {
  await fs.mkdir(profile, { recursive: true });
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({
    ...require('../../../etc/three/window.json'),
    
    
    
    
    title: ui("yhwh-three"),
    
    icon: require('../../../lib/paths.cjs').etc('assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-prevent-unload", (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: [ui("keep-editing"), ui("discard-changes")],
      defaultId: 0,
      cancelId: 0,
      title: ui("unsaved-changes"),
      message: ui("close-yhwh-three-and-discard-unsaved-file-edits-"),
    });
    if (choice === 1) event.preventDefault();
  });
  win.webContents.session.setPermissionRequestHandler((_, __, callback) =>
    callback(false),
  );
  await win.loadFile(require('../../../lib/paths.cjs').etc('three', 'index.html'));
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  for (const session of tabs.values()) {
    session.watcher?.close();
    session.terminal?.close();
  }
});
