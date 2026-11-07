const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createDemo, git } = require("../src/repository.cjs");
const { createCodex } = require("../test/codex-fixture.cjs");

(async () => {
  const root = path.join(__dirname, "..");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-ui-"));
  const artifacts = path.join(root, "artifacts");
  await fs.mkdir(artifacts, { recursive: true });
  const codex = await createCodex(temp);
  const env = { ...process.env, YHWH_DATA_DIR: path.join(temp, "data"), YHWH_CODEX: codex.executable };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = require("./runtime.cjs")();
  let app, page;
  const errors = [];
  async function launch(theme) {
    app = await electron.launch({ executablePath, args: [root, "--disable-gpu", ...(theme ? ["--theme", theme] : [])], env, timeout: 60000 });
    page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(".shell").waitFor();
  }
  try {
    await launch();
    await require("./help-menu-test.cjs")(app);
    assert.equal(await page.locator(".modal").count(), 0);
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.showFacts, false);
    assert.equal(await page.locator('.walkthrough-start [data-action="walkthrough"]').isVisible(), true);
    assert.equal(await page.locator('.walkthrough-start [data-action="walkthrough"]').evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight), true);
    await page.screenshot({ path: path.join(artifacts, "01-welcome.png") });
    const launchWindow = await app.browserWindow(page);
    await launchWindow.evaluate((win) => win.setSize(1060, 700));
    await page.screenshot({ path: path.join(artifacts, "15-compact-walkthrough.png") });
    assert.equal(await page.locator('.walkthrough-start [data-action="walkthrough"]').evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight), true);
    assert.equal(await page.locator(".page").evaluate((el) => el.scrollWidth > el.clientWidth), false);
    await launchWindow.evaluate((win) => win.setSize(1510, 980));
    await page.locator('.sidebar [data-action="facts"]').click();
    const factTitle = await page.locator(".startup-fact h2").textContent();
    await page.locator('[data-action="fact-dialog-next"]').click();
    assert.notEqual(await page.locator(".startup-fact h2").textContent(), factTitle);
    await page.locator('.modal [data-action="close-dialog"]').first().click();
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.showFacts, false);
    await page.locator('.rail-bottom [data-action="settings"]').click();
    await page.locator('#settings-form [name="showFacts"]').check();
    await page.locator("#settings-form button:not([data-action])").click();
    await page.waitForFunction(() => !document.querySelector(".modal") && !document.querySelector(".button.primary:disabled"));
    await app.close();
    await launch();
    await page.locator(".startup-fact").waitFor();
    await page.locator('.modal [data-action="close-dialog"]').last().click();
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.showFacts, true);
    await page.locator('.sidebar [data-action="facts"]').click();
    await page.keyboard.press("Escape");
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.showFacts, true);
    await app.close();
    await launch();
    await page.locator(".startup-fact").waitFor();
    await page.locator('[data-action="disable-facts"]').click();
    await page.locator(".modal").waitFor({ state: "detached" });
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.mode, "codex");
    await app.close();
    await launch();
    assert.equal(await page.locator(".modal").count(), 0);
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.showFacts, false);
    await page.locator('section[aria-label="Character tips"] [data-action="facts"]').click();
    await page.locator(".startup-fact").waitFor();
    await page.locator('.modal [data-action="close-dialog"]').last().click();
    await page.locator('[data-action="hide-fact"]').click();
    assert.equal(await page.locator(".fact-card").count(), 0);
    await page.locator('.sidebar [data-action="facts"]').click();
    await page.locator(".startup-fact").waitFor();
    await page.locator('.modal [data-action="close-dialog"]').last().click();
    await page.locator(".page").evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: path.join(artifacts, "02-overview.png") });
    console.log("✓ Fresh launch shows walkthrough; ordinary/X/Escape dismissals preserve preferences; Don’t show this again survives restart; tips remain accessible");

    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.mode, "codex");
    await page.locator("#chat-input").fill("Inspect this proposal with Codex.");
    await page.locator("#chat-input").press("Enter");
    await page.waitForFunction(() => document.querySelector(".chat-message.assistant:last-child p")?.textContent.includes("inspect that diff"));
    assert.match(await page.locator(".god-heading small").textContent(), /Codex.*xhigh.*full access/);
    await page.locator('.rail-bottom [data-action="settings"]').click();
    assert.equal(await page.locator('#settings-form [name="mode"]').inputValue(), "codex");
    assert.equal(await page.locator('[data-engine="codex"]').isVisible(), true);
    await page.screenshot({ path: path.join(artifacts, "13-codex-settings.png") });
    await page.locator('#settings-form [name="mode"]').selectOption("ollama");
    assert.equal(await page.locator('#settings-form [name="model"]').isVisible(), true);
    assert.equal(await page.locator('#settings-form [name="model"]').inputValue(), "qwen3:8b");
    await page.locator('#settings-form [name="mode"]').selectOption("offline");
    await page.locator('#settings-form [name="mode"]').selectOption("codex");
    await page.locator("#settings-form button:not([data-action])").click();
    await page.locator(".modal").waitFor({ state: "detached" });
    console.log("✓ Default Codex chat, full-access settings, and retained Ollama/offline choices");

    await page.locator('.walkthrough-start [data-action="walkthrough"]').click();
    await page.locator('[data-field="evidence"]').waitFor();
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.mode, "offline");
    assert.match(await page.locator(".walkthrough-hint").textContent(), /Verification evidence/);
    await page.locator('[data-tab="patch"]').click();
    await page.locator(".diff-hunk").waitFor();
    assert.match(
      await page.locator(".diff-hunk").textContent(),
      /requests==2.32.3/,
    );
    await page.screenshot({
      path: path.join(artifacts, "03-patch-review.png"),
    });
    await page.locator("[data-hunk]").first().uncheck();
    await page.waitForFunction(() =>
      document.querySelector(".diff-hunk")?.classList.contains("excluded"),
    );
    await page.locator("[data-hunk]").first().check();
    await page.locator('[data-tab="brief"]').click();
    await page.locator('[data-field="evidence"]').fill(
      "Reviewed requirements.txt: exact requests and rich version pins are removed. Runtime comparisons are still pending.",
    );
    await page.locator('.review-actions [data-action="rehearse"]').click();
    await page.locator(".reaction").first().waitFor();
    assert.equal(await page.locator(".reaction").count(), 3);
    await page
      .locator('#feedback-form [name="personId"]')
      .selectOption({ index: 1 });
    await page
      .locator('#feedback-form [name="content"]')
      .fill(
        "Keep this to the dependency pins; runtime comparisons are still pending.",
      );
    await page.locator("#feedback-form button:not([data-action])").click();
    await page.locator(".feedback").waitFor();
    await page.screenshot({
      path: path.join(artifacts, "04-company-review.png"),
    });
    await page.locator('[data-action="revise"]').click();
    await page.locator('[data-draft="chat"]').waitFor();
    assert.match(
      await page.locator('[data-draft="chat"]').inputValue(),
      /Keep this to the dependency pins/,
    );
    await page.locator('.walkthrough-hint [data-page="mail"]').click();
    assert.match(await page.locator('[data-draft="mail"]').inputValue(), /Subject: A small proposal/);
    assert.match(await page.locator('[data-draft="mail"]').inputValue(), /Evidence supplied for review/);
    assert.match(await page.locator('[data-draft="mail"]').inputValue(), /Review clarification: Keep this to the dependency pins/);
    await page.locator('[data-draft="mail"]').fill((await page.locator('[data-draft="mail"]').inputValue()) + "\n\nSample review only; keep the previous environment available.");
    await page.screenshot({ path: path.join(artifacts, "14-sample-email.png") });
    await page.locator('.sidebar [data-action="chat"]').click();
    await page.locator('[data-draft="chat"]').waitFor();
    await page.locator('.sidebar [data-action="forge"]').click();
    assert.match(await page.locator('[data-draft="forge"]').inputValue(), /Rollback/);
    await page.locator('.walkthrough-hint [data-page="room"]').click();
    await page
      .locator('[data-draft="chat"]')
      .fill(
        "A small dependency cleanup for review. Runtime comparisons remain pending.",
      );
    await page
      .locator('[data-action="copy-draft"][data-destination="chat"]')
      .click();
    assert.equal(
      await app.evaluate(({ clipboard }) => clipboard.readText()),
      "A small dependency cleanup for review. Runtime comparisons remain pending.",
    );
    await page.locator('.review-actions [data-action="approve"]').click();
    await page.locator('[data-action="confirm-approve"]').click();
    await page.waitForFunction(() =>
      document.querySelector(".round-title .badge.approved"),
    );
    const saved = await page.evaluate(() => window.yhwh.read());
    const first = saved.companies[0].proposals[0];
    assert.equal((await fs.readFile(codex.requests, "utf8")).trim().split("\n").length, 1);
    assert.ok(first.approvedCommit);
    assert.equal(
      await git(path.join(saved.dataPath, "repositories", first.repoId), [
        "rev-list",
        "--count",
        "main..master",
      ]),
      "1",
    );
    await page.locator('.sidebar [data-action="master"]').click();
    await page.locator(".final-packet").waitFor();
    assert.match(
      await page.locator(".final-packet").textContent(),
      /A small dependency cleanup/,
    );
    assert.match(await page.locator(".final-packet").textContent(), /Sample review only; keep the previous environment available/);
    await page.screenshot({
      path: path.join(artifacts, "05-approved-handoff.png"),
    });
    console.log(
      "✓ Real patch → hunk decisions → company feedback → revision → edited draft → clipboard → Git approval",
    );

    await page.locator('.sidebar [data-action="board"]').click();
    assert.match(await page.locator('[data-drop="approved"]').textContent(), /Let the environment choose dependency versions/);
    await page.locator('[data-action="new-task"]').click();
    await page.locator("#task-form input").fill("Run the output comparison");
    await page.locator("#task-form button").click();
    await page.locator(".task-status").waitFor();
    await page.locator(".task-status").selectOption("review");
    await page.waitForFunction(() =>
      document.querySelector('[data-drop="review"] .task-status'),
    );
    await page.screenshot({ path: path.join(artifacts, "06-kanbun.png") });
    console.log("✓ Independent Kanbun tasks and round state");

    await page.locator('[data-action="new-company"]').click();
    await page.locator('#new-company-form [name="name"]').fill("Tiny Bakery");
    await page
      .locator('#new-company-form [name="goal"]')
      .fill("Make deliveries easier to coordinate.");
    await page.locator("#new-company-form button").click();
    await page.locator("#company-form").waitFor();
    await page
      .locator('#company-form [name="context"]')
      .fill("Three people and one oven. <img src=x onerror=alert(1)>");
    await page.locator("#company-form button:not([data-action])").click();
    await page.locator('.sidebar [data-action="room"]').click();
    await page.locator('.empty-state [data-action="new-proposal"]').click();
    await page
      .locator('#new-proposal-form [name="title"]')
      .fill("Try a shared delivery list");
    await page
      .locator('#new-proposal-form [name="summary"]')
      .fill("Use a single checklist for tomorrow’s deliveries.");
    await page.locator("#new-proposal-form button").click();
    await page.locator('.review-actions [data-action="rehearse"]').click();
    await page.locator(".reaction").first().waitFor();
    await page.locator("#chat-input").fill("How can we keep this small?");
    await page.locator("#chat-input").press("Enter");
    await page.waitForFunction(
      () => document.querySelectorAll(".chat-message").length === 2,
    );
    assert.match(
      await page.locator(".chat-message.assistant").last().textContent(),
      /bargain/,
    );
    assert.equal(await page.locator("img").count(), 0);
    console.log(
      "✓ Arbitrary company, communication proposal, persona chat, escaped user content",
    );

    const source = path.join(temp, "source");
    await createDemo(source);
    const sourceHead = await git(source, ["rev-parse", "HEAD"]);
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, source);
    await page.locator('[data-action="import"]').click();
    await page.locator('#import-form [name="draft"]').fill("mistress");
    await page.locator("#import-form button").click();
    await page.waitForFunction(
      () => document.querySelectorAll("#proposal-select option").length === 5,
    );
    assert.equal(await git(source, ["rev-parse", "HEAD"]), sourceHead);
    assert.equal(await git(source, ["branch", "--show-current"]), "master");
    const exportDirectory = path.join(temp, "exports");
    await fs.mkdir(exportDirectory);
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
    }, exportDirectory);
    await page.locator('.toolbar [data-action="export"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector("#toast")
        .textContent.startsWith("Handoff exported"),
    );
    const [folder] = await fs.readdir(exportDirectory);
    assert.ok(
      (await fs.readdir(path.join(exportDirectory, folder))).includes(
        "MASTER.md",
      ),
    );
    console.log(
      "✓ Import native dialog boundary → real isolated Git clone → export files",
    );

    await page.keyboard.press("Control+k");
    await page.locator("#search-input").fill("delivery");
    assert.equal(await page.locator(".search-result").count(), 1);
    await page.locator(".search-result").click();
    await page.locator(".round-title").waitFor();
    assert.match(
      await page.locator(".round-title").textContent(),
      /shared delivery list/,
    );
    await page.locator('.rail-bottom [data-action="settings"]').click();
    await page.locator('#settings-form [name="showFacts"]').uncheck();
    await page.locator("#settings-form button:not([data-action])").click();
    const browserWindow = await app.browserWindow(page);
    await browserWindow.evaluate((win) => win.setSize(1080, 760));
    await page.screenshot({
      path: path.join(artifacts, "07-compact-window.png"),
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    const companyId = (await page.evaluate(() => window.yhwh.read()))
      .selectedCompany;
    // Close with a focused editor, before blur or the autosave debounce.
    await page
      .locator('[data-field="summary"]')
      .fill("Preserve the edit that was still focused when the window closed.");
    await app.close();
    app = null;
    await launch();
    const reopened = page;
    assert.equal(
      (await reopened.evaluate(() => window.yhwh.read())).selectedCompany,
      companyId,
    );
    assert.equal(await reopened.locator(".modal").count(), 0);
    assert.equal(
      await reopened.locator("#company-select").inputValue(),
      companyId,
    );
    const restored = await reopened.evaluate(() => window.yhwh.read());
    assert.equal(restored.settings.mode, "offline");
    assert.equal(
      restored.companies.find((c) => c.id === companyId).proposals[0].summary,
      "Preserve the edit that was still focused when the window closed.",
    );
    await reopened.locator('.walkthrough-start [data-action="walkthrough"]').click();
    await reopened.locator(".final-packet").waitFor();
    assert.match(await reopened.locator(".final-packet").textContent(), /Sample review only/);
    await reopened.locator('.sidebar [data-action="home"]').click();
    assert.match(await reopened.locator(".walkthrough-complete").textContent(), /approved and saved/);
    assert.deepEqual(errors, []);
    console.log(
      "✓ Search, settings, compact layout, company persistence and restart",
    );
    // The company app honors --theme and retains the selection through later saves.
    await app.close(); app = null;
    await launch("dawkins");
    assert.equal(await page.locator("body").getAttribute("data-theme"), "dawkins");
    assert.equal(await page.locator(".wordmark").textContent(), "YHWH");
    assert.match(await page.locator("#chat-input").evaluate(el => getComputedStyle(el).fontFamily), /Mono|monospace/);
    assert.equal(await page.locator("body").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(0, 0, 0)");
    assert.equal(await page.locator('section[aria-label="Character tips"]').isVisible(), false);
    await page.screenshot({ path: path.join(artifacts, "yhwh-dawkins.png") });
    const compact = await app.browserWindow(page);
    await compact.evaluate(win => win.setSize(1060, 700));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('.walkthrough-start [data-action="walkthrough"]').isVisible(), true);
    await page.locator('.walkthrough-start [data-action="walkthrough"]').click();
    await page.locator(".final-packet").waitFor();
    await page.screenshot({ path: path.join(artifacts, "yhwh-dawkins-compact.png") });
    await page.locator('.sidebar [data-action="settings"]').click();
    await page.locator('#settings-form [name="showFacts"]').check();
    await page.locator("#settings-form button:not([data-action])").click();
    await page.locator(".modal").waitFor({ state: "detached" });
    await app.close(); app = null;
    await launch();
    assert.equal(await page.locator("body").getAttribute("data-theme"), "dawkins");
    assert.equal(await page.locator(".modal").count(), 0);
    assert.equal((await page.evaluate(() => window.yhwh.read())).settings.showFacts, true);
    await page.locator('.sidebar [data-action="settings"]').click();
    await page.locator('#settings-form [name="theme"]').selectOption("yhwh");
    await page.locator('#settings-form [name="showFacts"]').uncheck();
    await page.locator("#settings-form button:not([data-action])").click();
    await page.waitForFunction(() => document.body.dataset.theme === "yhwh");
    await page.locator('.rail-bottom [data-action="settings"]').click();
    await page.locator('#settings-form [name="theme"]').selectOption("dawkins");
    await page.locator("#settings-form button:not([data-action])").click();
    await page.waitForFunction(() => document.body.dataset.theme === "dawkins");
    assert.deepEqual(errors, []);
    console.log("✓ YHWH: Dawkins launch, compact layout, completed handoff, theme persistence, suppressed startup tips and in-place theme switching");
    console.log(`Screenshots: ${artifacts}`);
  } catch (error) {
    if (app) {
      const page = await app.firstWindow().catch(() => null);
      if (page)
        await page
          .screenshot({ path: path.join(artifacts, "failure.png") })
          .catch(() => {});
    }
    throw error;
  } finally {
    if (app) await app.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
