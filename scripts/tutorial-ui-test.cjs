const { _electron: electron } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createReview } = require("../test/review-fixture.cjs");
const { invoke } = require("../src/review.cjs");
const { git } = require("../src/repository.cjs");

(async () => {
  const root = path.resolve(__dirname, "..");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "thwh-tutor-ui-"));
  const realRoot = path.join(temp, "real-review");
  const plan = await createReview(realRoot);
  await invoke(realRoot, "draft", { key: "Teams message", text: "My real unfinished message." });
  await invoke(realRoot, "position", { hunk: 2, screen: { page: 2, offset: 128 } });
  const before = await fs.readFile(path.join(realRoot, ".review/state.json"), "utf8");
  const env = { ...process.env, THWH_DATA_DIR: path.join(temp, "profile"), YHWH_REVIEW_ROOT: realRoot,
    YHWH_CODEX: path.join(temp, "no-model-needed") };
  delete env.ELECTRON_RUN_AS_NODE;
  const executablePath = require("./runtime.cjs")();
  const artifacts = path.join(root, "artifacts");
  await fs.mkdir(artifacts, { recursive: true });
  let app, page;
  const errors = [];
  const click = action => page.locator(`[data-action="${action}"]`).first().click();
  const view = () => page.evaluate(() => window.yhwh.reviewRead());
  const step = n => page.waitForFunction(n => document.querySelector(".tw-tutorial .tw-kicker")?.textContent === `PRACTICE · LESSON ${n} OF 8`, n);
  const go = n => page.locator(`nav [data-page="${n}"]`).click();
  const keys = async key => {
    await page.waitForFunction(() => !document.querySelector("#energy").disabled);
    await page.locator(".tw-content").focus();
    await page.keyboard.press(key);
  };
  async function launch() {
    app = await electron.launch({ executablePath, args: [root, "--thwh", "--disable-gpu", "--root", env.YHWH_REVIEW_ROOT], env, timeout: 60000 });
    page = await app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    await page.locator(".tw-app").waitFor();
  }
  try {
    await launch();
    await page.getByRole("heading", { name: "Learn THWH by doing." }).waitFor();
    assert.equal(await page.locator(".tw-content").evaluate(el => el.scrollTop), 0);
    assert.equal(await page.locator(".tw-modal").count(), 0);
    await page.screenshot({ path: path.join(artifacts, "thwh-tutor-welcome.png") });
    await click("tutorial-start");
    await step(1);
    const practiceRoot = (await view()).root;
    assert.notEqual(practiceRoot, realRoot);
    // Visiting every view and opening a preview does not pass a lesson.
    await go(4); await go(5); await go(0);
    await click("accept"); await click("confirm-accept");
    await page.waitForFunction(() => document.querySelector("#toast").textContent.includes("Finish the practice lessons"));
    await step(1);
    await keys("Enter"); await step(2);
    await keys("Enter");
    await page.waitForFunction(() => document.querySelector(".tw-diff-toolbar")?.textContent.includes("Hunk 2/2"));
    await keys("Enter"); await step(3);
    await click("tutorial-hint");
    await page.locator("#review-note").fill("The fallback keeps a missing name readable.");
    await page.waitForFunction(async () => !!(await window.yhwh.reviewRead()).drafts.comment);
    await app.close(); app = null;
    await launch();
    await step(3);
    assert.equal(await page.locator("#review-note").inputValue(), "The fallback keeps a missing name readable.");
    await page.locator(".tw-content").dispatchEvent("scroll");
    await click("tutorial-leave");
    await page.waitForTimeout(350); // Let an old practice scroll autosave attempt to run.
    assert.equal((await view()).root, realRoot);
    assert.equal(await fs.readFile(path.join(realRoot, ".review/state.json"), "utf8"), before);
    await click("tutorial-start"); await step(3);
    await click("comment"); await step(4);
    await page.locator("#review-note").fill("Explain what happens when a name is missing.");
    await click("reject"); await step(5);
    await click("tutorial-hint");
    const message = page.locator('[data-editor="Teams message"]');
    await message.fill("Both apps now say Hello, friend! when a visitor has no name.");
    await message.press("Control+s"); await step(6);
    await click("tutorial-hint");
    await keys("r"); await step(7);
    await page.setViewportSize({ width: 1100, height: 740 });
    for (const [energy, theme] of [[0, "dawkins"], [50, "nietzsche"], [100, "yhwh"]]) {
      await page.locator("#energy").fill(String(energy));
      await page.locator("#energy").dispatchEvent("change");
      await page.waitForFunction(theme => document.body.dataset.theme === theme && !document.querySelector("#energy").disabled, theme);
      await step(7);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const banner = await page.locator(".tw-tutorial").boundingBox();
      const footer = await page.locator(".tw-actions").boundingBox();
      assert.ok(banner.height > 60 && footer.y + footer.height <= 740);
      await page.screenshot({ path: path.join(artifacts, `thwh-tutor-${theme}.png`) });
    }
    await page.locator("#assistant-message").fill("How do I finish?");
    await page.locator("#assistant-form button[type=submit]").click();
    await page.locator(".tw-chat-log article.assistant").waitFor();
    assert.match(await page.locator(".tw-chat-log").textContent(), /Practice guidance:.*Preview acceptance/s);
    await keys("a");
    await page.locator(".tw-modal").waitFor();
    await keys("Escape"); await step(7);
    await keys("a"); await keys("y"); await step(8);
    assert.equal((await view()).round, null);
    await keys("6");
    await page.locator('[data-document="master"]').click();
    await page.getByRole("heading", { name: "You’ve reviewed your first pair." }).waitFor();
    assert.match(await page.locator(".tw-document").textContent(), /Both apps now say Hello, friend/);
    await page.screenshot({ path: path.join(artifacts, "thwh-tutor-complete.png") });
    await app.close(); app = null;
    await launch();
    await page.getByRole("heading", { name: "You’ve reviewed your first pair." }).waitFor();
    await click("tutorial-restart"); await step(1);
    assert.equal((await view()).root, practiceRoot);
    assert.equal((await view()).comments.length, 0);
    await click("tutorial-leave");
    const restored = await view();
    assert.equal(restored.root, realRoot);
    assert.equal(restored.hunk, 2);
    assert.equal(restored.drafts["Teams message"], "My real unfinished message.");
    assert.equal(await page.locator(".tw-welcome").count(), 0);
    assert.equal(await fs.readFile(path.join(realRoot, ".review/state.json"), "utf8"), before);
    for (const [repo, meta] of Object.entries(plan.repositories)) assert.equal(await git(path.join(realRoot, repo), ["rev-parse", "master"]), meta.base);
    await app.close(); app = null;
    env.THWH_DATA_DIR = path.join(temp, "no-workspace-profile");
    env.YHWH_REVIEW_ROOT = path.join(temp, "not-prepared");
    await launch();
    await page.getByRole("heading", { name: "Learn THWH by doing." }).waitFor();
    await click("tutorial-skip");
    await page.getByRole("heading", { name: "Open your review workspace." }).waitFor();
    await app.close(); app = null;
    await launch();
    await page.getByRole("heading", { name: "Open your review workspace." }).waitFor();
    await click("tutorial-start"); await step(1);
    await assert.rejects(fs.access(env.YHWH_REVIEW_ROOT));
    assert.deepEqual(errors, []);
    console.log("✓ THWH tutor: fresh entry, eight action-checked lessons, keyboard review, offline help, three themes, resume, replay, and untouched real workspace");
  } catch (error) {
    if (page) await page.screenshot({ path: path.join(artifacts, "thwh-tutor-failure.png") }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
    await fs.rm(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
