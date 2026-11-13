const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
(async () => {
  const root = path.resolve(__dirname, ".."),
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-three-ui-")),
    workspace = path.join(temp, "Workspace");
  const screenshots = require('../../../lib/paths.cjs').output('three', 'screenshots');
  await fs.mkdir(screenshots, { recursive: true });
  await fs.mkdir(workspace);
  await fs.mkdir(path.join(workspace, "A directory"));
  await fs.mkdir(path.join(workspace, "Second directory"));
  await fs.writeFile(
    path.join(workspace, "Welcome.md"),
    "# A little room to think\n\nA real filesystem, with **three dimensions**.\n\n- Navigate anywhere\n- Edit the actual file\n",
  );
  await fs.writeFile(
    path.join(workspace, "data.json"),
    '{"hello":"world","dimensions":3}',
  );
  await fs.writeFile(
    path.join(workspace, "script"),
    '#!/usr/bin/env python3\nprint("hello")\n',
  );
  await fs.writeFile(path.join(workspace, ".secret"), "hidden");
  const config = path.join(temp, ".config/yhwh");
  await fs.mkdir(config, { recursive: true });
  await fs.writeFile(
    path.join(config, "rc"),
    '/\n    title="Shared configuration"\n    theme=nietzsche\n    bloom=0.4\n',
  );
  await fs.writeFile(
    path.join(config, "rc.three"),
    '/\n    if [[ $theme != dawkins ]]; then\n        bloom=0.9\n    fi\n    title="$title + 3D"\n',
  );
  const env = {
    ...process.env,
    HOME: temp,
    YHWH_CONFIG_HOME: config,
    YHWH_SYSTEM_CONFIG: path.join(temp, "system"),
    YHWH_THREE_DATA_DIR: path.join(temp, "state"),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];
  try {
    app = await electron.launch({
      executablePath: require("../../../lib/electron.cjs")(),
      args: [
        root,
        "--root",
        workspace,
        ...(process.env.YHWH_THREE_TEST_GPU === "native"
          ? []
          : [
              "--use-gl=angle",
              "--use-angle=swiftshader",
              "--enable-unsafe-swiftshader",
            ]),
      ],
      env,
      timeout: 60000,
    });
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(".node-label").first().waitFor();
    await page.waitForFunction(
      () => document.title === "Shared configuration + 3D",
    );
    assert.match(
      await page.locator("#gpu-status").textContent(),
      /^WEBGL 2 · (LIVE|SOFTWARE)$/,
    );
    assert.equal(
      await page.locator("body").getAttribute("data-theme"),
      "nietzsche",
    );
    assert.equal(await page.locator(".node-label").count(), 5);
    assert.equal(await page.locator(".file-row").count(), 6);
    await page.screenshot({ path: path.join(screenshots, "01-space.png") });
    await page
      .locator(".file-row")
      .filter({ hasText: "A directory" })
      .dblclick();
    await page.waitForFunction(() =>
      window.yhwhApp.directory.endsWith("/A directory"),
    );
    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForFunction(() =>
      window.yhwhApp.directory.endsWith("/Workspace"),
    );
    await page.keyboard.press("Control+b");
    await page.locator("#terminal-panel").waitFor({ state: "visible" });
    await page
      .locator(".xterm-helper-textarea")
      .pressSequentially("cd 'Second directory'");
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => window.yhwhApp.directory.endsWith("/Second directory"),
      { timeout: 10000 },
    );
    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForFunction(() =>
      window.yhwhApp.directory.endsWith("/Workspace"),
    );
    await page.keyboard.press("Control+b");
    await page
      .locator(".file-row")
      .filter({ hasText: "Welcome.md" })
      .dblclick();
    await page.locator(".cm-content").waitFor();
    assert.equal(await page.locator("#language").inputValue(), "Markdown");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type("\nSaved from the 3D app.");
    await page.keyboard.press("Control+s");
    await page.waitForFunction(
      () => document.querySelector("#save-state").textContent === "Saved",
    );
    assert.match(
      await fs.readFile(path.join(workspace, "Welcome.md"), "utf8"),
      /Saved from the 3D app/,
    );
    await page.keyboard.press("Control+Shift+v");
    await page.locator("#pretty-view h1").waitFor();
    assert.equal(
      await page.locator("#pretty-view h1").textContent(),
      "A little room to think",
    );
    await page.screenshot({ path: path.join(screenshots, "02-editor.png") });
    await page.locator("#filename").fill("Renamed.md");
    await page.locator("#filename").press("Enter");
    await page.waitForFunction(() =>
      document
        .querySelector("#document-path")
        .textContent.endsWith("/Renamed.md"),
    );
    assert.ok(await fs.stat(path.join(workspace, "Renamed.md")));
    await page.keyboard.press("Control+d");
    await page.locator("#expanded-files").waitFor({ state: "visible" });
    await page.keyboard.press("Control+d");
    await page.locator("#document-view").waitFor({ state: "visible" });
    await page.keyboard.press("Control+t");
    await page.waitForFunction(
      () => document.querySelectorAll("[role=tab]").length === 2,
    );
    await page.locator(".file-row").filter({ hasText: "data.json" }).dblclick();
    await page.waitForFunction(
      () => document.querySelector("#language").value === "JSON",
    );
    await page.keyboard.press("Control+Shift+v");
    await page.locator("[data-action=format-json]").click();
    await page.keyboard.press("Control+s");
    await page.waitForFunction(
      () => document.querySelector("#save-state").textContent === "Saved",
    );
    assert.match(
      await fs.readFile(path.join(workspace, "data.json"), "utf8"),
      /\n  "hello"/,
    );
    await page.keyboard.press("Control+Shift+Tab");
    assert.equal(await page.locator("#filename").textContent(), "Renamed.md");
    await page.keyboard.press("Control+e");
    assert.ok(
      await page
        .locator(".shell")
        .evaluate((el) => el.classList.contains("hide-files")),
    );
    await page.keyboard.press("Control+e");
    await page.locator("[data-action=commands]").first().click();
    await page.locator("#command-filter").fill("hello");
    await page.locator(".command-result").click();
    await page.waitForFunction(() =>
      document.querySelector("#toast").textContent.includes("fewer floods"),
    );
    await page.locator("[data-action=settings]").click();
    await page.locator("#settings-form [name=theme]").selectOption("dawkins");
    await page.locator("#settings-form button").click();
    assert.equal(
      await page.locator("body").getAttribute("data-theme"),
      "dawkins",
    );
    await page.locator("[data-action=help]").click();
    await page.locator("#dialog h2").waitFor();
    await page.keyboard.press("Escape");
    await page.keyboard.press("Control+n");
    await page.locator("#dialog input").fill("no-extension");
    await page.locator("#dialog button[value=ok]").click();
    await page.waitForFunction(
      () => document.querySelector("#filename").textContent === "no-extension",
    );
    assert.equal(await page.locator("#language").inputValue(), "Plain text");
    await page.locator("[data-action=space]").first().click();
    await page.keyboard.press("Control+b");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshots, "03-shell.png") });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: WebGL2, shared Bash config, directory navigation, shell sync, file save/rename, pretty modes, file-manager focus, tabs, settings, plugins and new extensionless files.",
    );
  } catch (error) {
    console.error(
      "UI state:",
      await page?.evaluate(() => ({
        filename: document.querySelector("#filename")?.textContent,
        dialog: document.querySelector("#dialog")?.open,
        dialogText: document.querySelector("#dialog-content")?.textContent,
        toast: document.querySelector("#toast")?.textContent,
      })),
    );
    await page?.screenshot({ path: path.join(screenshots, "failure.png") });
    throw error;
  } finally {
    await app?.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
