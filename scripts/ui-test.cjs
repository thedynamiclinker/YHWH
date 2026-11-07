const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createDemo, git } = require("../src/repository.cjs");

(async () => {
  const root = path.join(__dirname, "..");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "yhwh-ui-"));
  const artifacts = path.join(root, "artifacts");
  await fs.mkdir(artifacts, { recursive: true });
  const env = { ...process.env, YHWH_DATA_DIR: path.join(temp, "data") };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = require("./runtime.cjs")();
  let app;
  const errors = [];
  try {
    app = await electron.launch({
      executablePath,
      args: [root, "--disable-gpu"],
      env,
      timeout: 60000,
    });
    const page = await app.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.locator(".shell").waitFor();
    await page.locator(".modal").waitFor();
    await page.screenshot({ path: path.join(artifacts, "01-welcome.png") });
    await page.locator('[data-action="close-dialog"]').last().click();
    await page.screenshot({ path: path.join(artifacts, "02-overview.png") });
    console.log("✓ Startup character fact and workspace overview");

    await page.locator('.next-step [data-action="open-proposal"]').click();
    await page
      .locator('[data-field="evidence"]')
      .fill(
        "Manually reviewed the two removed dependency pins. Runtime comparisons are still pending.",
      );
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
    await page.locator('.review-actions [data-action="rehearse"]').click();
    await page.locator(".reaction").first().waitFor();
    assert.equal(await page.locator(".reaction").count(), 3);
    await page
      .locator('#feedback-form [name="personId"]')
      .selectOption({ index: 1 });
    await page
      .locator('#feedback-form [name="content"]')
      .fill(
        "Keep the runtime unchanged and describe the unverified comparison honestly.",
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
      /Keep the runtime unchanged/,
    );
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
    await page.screenshot({
      path: path.join(artifacts, "05-approved-handoff.png"),
    });
    console.log(
      "✓ Real patch → hunk decisions → company feedback → revision → edited draft → clipboard → Git approval",
    );

    await page.locator('.sidebar [data-action="board"]').click();
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
    app = await electron.launch({
      executablePath,
      args: [root, "--disable-gpu"],
      env,
      timeout: 60000,
    });
    const reopened = await app.firstWindow();
    await reopened.locator(".shell").waitFor();
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
    assert.equal(
      restored.companies.find((c) => c.id === companyId).proposals[0].summary,
      "Preserve the edit that was still focused when the window closed.",
    );
    assert.deepEqual(errors, []);
    console.log(
      "✓ Search, settings, compact layout, company persistence and restart",
    );
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
