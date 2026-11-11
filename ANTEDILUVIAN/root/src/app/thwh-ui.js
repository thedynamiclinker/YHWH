/* Six views, one saved review. The Python engine owns every review decision. */
const api = window.yhwh;
const $ = s => document.querySelector(s);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages = ["Start", "Diff", "Messages", "Comments", "Changes", "Files"];
const glyphs = ["◈", "±", "≡", "◇", "⌘", "▤"];
let v, settings, page = 0, full = false, patchRepo = null, notice = "Your place is saved. One hunk is enough.", working = false;
let lastError = "", applying = false;
let circus = null, circusError = "", circusBusy = false, chain = Promise.resolve(), scrollTimer, anchorNote = true, noteKey = "comment", factIndex = 2;
const edits = {};
const chatKey = () => "thwh:chat:" + (v?.root || "");
const fieldNames = [["Round title", "title"], ["Teams message", "teams"], ["MR title", "mr_title"], ["Validation and limits", "validation"]];
const practice = () => settings?.tutorial?.active;
const divine = () => settings?.energy === 100;
const dawkins = () => settings?.energy === 0;
const button = (action, label, cls = "quiet", extra = "") => `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const value = (key, fallback = "") => edits[key] ?? v?.drafts?.[key] ?? fallback;
function enqueue(fn) {
  const next = chain.then(fn);
  chain = next.catch(error => { toast(error.message, true); });
  return next;
}
function toast(message, error = false) {
  notice = message;
  if (error) { lastError = message; render(); }
  $("#toast").textContent = message;
  $("#toast").className = `show${error ? " error" : ""}`;
  setTimeout(() => $("#toast").className = "", 6000);
}
async function request(action, input = {}) {
  const step = settings.tutorial?.step;
  v = await api.reviewAct(action, { roundId: v?.round?.id, revision: v?.revision, ...input });
  lastError = "";
  if (v.tutorial) settings.tutorial = v.tutorial;
  if (practice() && settings.tutorial.step > step) toast(`✓ ${settings.tutorial.lessons[step].title}`);
  return v;
}
async function work(fn) {
  working = true; render();
  try { await fn(); }
  finally { working = false; render(); }
}
function diff(text) {
  return `<pre class="tw-diff">${esc(text).split("\n").map(line => `<span class="${line.startsWith("@@") ? "range" : line.startsWith("+") && !line.startsWith("+++") ? "added" : line.startsWith("-") && !line.startsWith("---") ? "removed" : line.startsWith("diff --git") ? "file" : ""}">${line || " "}</span>`).join("")}</pre>`;
}
function fieldLabel(key) {
  return ({ "Round title": "Change title", "Teams message": "Message", "MR title": "PR title", "Validation and limits": "Checks" })[key] || key.replace(/ MR description$/, " PR description");
}
function field(key, fallback, rows = 4) {
  const dirty = key in edits || key in (v?.drafts || {});
  return `<section class="tw-field"><label>${esc(fieldLabel(key))}<textarea data-editor="${esc(key)}" rows="${rows}" spellcheck="false">${esc(value(key, fallback))}</textarea></label><div class="tw-field-foot"><small>${dirty ? "Draft saved. Click Save to use it." : "Saved. This text will go in the record."}</small>${button("save-field", "Save", "secondary", `data-key="${esc(key)}"`)}</div></section>`;
}
function messages() {
  return fieldNames.slice(0, 3).map(([key, name]) => field(key, v.round[name], name === "teams" ? 4 : 2)).join("") +
    Object.entries(v.round.descriptions).map(([repo, description]) => field(`${repo} MR description`, description)).join("") +
    field("Validation and limits", v.round.validation, 5);
}
function sequenceInstructions() {
  const pending = (v.requests || []).filter(note => !note.applied_at);
  return `<section class="tw-sequence"><h1>How should these commits look?</h1><p>Tell me in rough words. Give an example. Say what feels wrong. These instructions apply to the whole sequence.</p><label for="sequence-instructions">Your instructions<textarea id="sequence-instructions" data-editor="instructions" rows="5" placeholder="First PR: only remove version constraints. No README edits. Keep every diff tiny. Put installation before the new commands…">${esc(edits.instructions ?? v.instructionsDraft ?? v.instructions)}</textarea></label><div class="tw-note-actions">${button("save-instructions", "Save instructions", "secondary")}${button("apply-requests", "Apply saved requests", "primary")}</div><small>${v.instructionsDraft !== null || "instructions" in edits ? "Unfinished instructions saved. Save instructions to use them." : "Saved instructions are shared by this review workspace."} Applying uses Codex to revise the draft commits.</small>${pending.length ? `<details><summary>${pending.length} saved comment${pending.length === 1 ? "" : "s"} to apply</summary>${pending.map(note => `<article><b>${esc(note.roundId)}</b><p>${esc(note.text)}</p></article>`).join("")}</details>` : ""}</section>`;
}
function welcome() {
  return `<section class="tw-welcome"><span class="tw-kicker">WHERE ARE YOU? AH. HERE.</span><h1>Let's read<br>some code.</h1><p>Two small Python repos. We drop a version pin, use standard logging, and stop looking for a file in the wrong directory. A little JavaScript wandered in too. I'll deal with it.</p><ol><li>Read the patches and leave a comment.</li><li>Tell me my message is useless. Write a better one.</li><li>Accept the patches and find the commits.</li></ol><p class="muted">Five minutes or so. No login. Your place is saved.<br>I'll say what I'm waiting for. If I break, I'll say that too.</p><div>${button("tutorial-start", settings.tutorial?.step ? "Continue practice →" : "Start practice →", "primary")}${button("tutorial-skip", "Open my review", "quiet")}</div></section>`;
}
function lesson() {
  if (!practice()) return "";
  const t = settings.tutorial, current = t.lessons[t.step];
  if (!current) return `<section class="tw-tutorial tw-tutorial-complete" aria-label="Practice complete"><span class="tw-kicker">✓ DONE</span><h2>And there were commits.</h2><p>You read the patches, improved the message, and made a commit in each sample repo. The text and commit IDs are in Files → Accepted changes. Go have a look. I kept a record this time.</p><div>${button("tutorial-leave", "Back to my code →", "primary")}${button("tutorial-restart", "Start over")}</div></section>`;
  const remaining = t.step === 1 ? ` ${v.hunks.filter(h => h.seen).length}/${v.hunks.length} read.` : "";
  return `<section class="tw-tutorial" aria-label="Current practice step"><div class="tw-tutorial-heading"><span class="tw-kicker">PRACTICE · STEP ${t.step + 1}/${t.lessons.length}</span>${button("tutorial-leave", "Leave practice")}</div><progress aria-label="Practice progress" value="${t.step}" max="${t.lessons.length}"></progress><h2>${esc(current.title)}</h2><p>${esc(current.text)}</p>${current.example ? `<details><summary>One way to say it</summary><pre>${esc(current.example)}</pre></details>` : ""}<p class="tw-waiting"><b>Waiting for:</b> ${esc(current.waiting)}${remaining}</p><div class="tw-tutorial-tools">${button("tutorial-hint", "Take me there", "secondary")}<small>These are button checks. You judge the code.</small></div></section>`;
}
function content() {
  if (!practice() && !v && !settings.tutorial?.completed && !settings.tutorial?.dismissed) return welcome();
  if (!v) return `<div class="tw-empty"><span class="tw-big-glyph">⌘</span><h1>Where's the repo?</h1><p>Choose a directory with a .review/plan.json file. Or use the practice repos first.</p>${button("choose", "Choose directory", "primary")}</div>`;
  const r = v.round, h = v.hunks[v.hunk];
  if (page === 5) return `<div class="tw-context-tabs">${button("document", "Accepted changes", "quiet", 'data-document="master"')}${button("document", "Board", "quiet", 'data-document="board"')}</div><div class="tw-document-list">${v.documents.map(name => button("document", esc(name.split("/").at(-1)), "quiet", `data-document="${esc(name)}"`)).join("")}</div><pre class="tw-document">${esc(v.screen.document ? v.document : v.screen.record === "board" ? v.board : v.master || "No accepted changes yet. The other files are above.")}</pre>${button("copy-document", "Copy displayed text", "secondary")}`;
  if (page === 4) return `${practice() ? "" : sequenceInstructions()}<p class="tw-lead">Here are the changes. One at a time. No tablets required.</p><div class="tw-rounds">${v.rounds.map(item => `<article class="${item.id === r?.id ? "current" : ""}"><span class="tw-round-id">${esc(item.id)}</span><div><h3>${esc(item.title)}</h3><small>${esc(item.status.replaceAll("_", " "))}</small></div><span>${item.status === "accepted" ? "✓" : item.id === r?.id ? "← you are here" : ""}</span></article>`).join("")}</div>`;
  if (!r) return `<div class="tw-empty"><span class="tw-big-glyph">✓</span><h1>${divine() ? "And the review was good." : "Every round is accepted."}</h1><p>The messages, PR text, checks, and commit IDs are in Files.</p>${button("view", "Read the record", "primary", 'data-page="5"')}</div>`;
  if (page === 0) return `${practice() ? "" : sequenceInstructions()}<section class="tw-next"><span class="tw-kicker">THE CODE IS HERE</span><h1>One patch.<br>Let's see it.</h1><p>Read hunk <b>${v.hunks.length ? v.hunk + 1 : 0} of ${v.hunks.length}</b>. Read what changed. Tell me what's wrong.<br>You can stop whenever you like.</p>${button("advance", "Read the patch →", "primary")}</section><section class="tw-purpose"><span class="tw-kicker">WHY CHANGE IT?</span><h2>${esc(r.title)}</h2><p>${esc(r.teams)}</p></section><div class="tw-start-meta"><span>◈ ${Object.keys(r.commits).map(esc).join(" + ")}</span><span>✓ ${v.hunks.filter(h => h.seen).length}/${v.hunks.length} hunks read</span><span>◇ ${v.comments.length} comments</span></div>${v.status === "changes_requested" ? '<p class="tw-warning">You requested changes. Read Comments, fix the code or message, then click Request fixed.</p>' : ""}`;
  if (page === 1) {
    if (patchRepo) return `<div class="tw-patch-top"><label>Repository <select id="patch-repo">${Object.keys(v.patches).map(repo => `<option ${repo === patchRepo ? "selected" : ""}>${esc(repo)}</option>`).join("")}</select></label>${button("close-patch", "Return to diff")}</div><p class="muted">Edit the diff. Git checks that it applies before making commits. If you change the code, run the checks again and update Checks.</p><section class="tw-field"><label>${esc(patchRepo)} patch<textarea class="tw-patch-editor" data-editor="${esc(patchRepo)} patch" rows="24" spellcheck="false">${esc(value(`${patchRepo} patch`, v.patches[patchRepo]))}</textarea></label>${button("save-patch", "Save patch", "primary")}</section>`;
    return `<div class="tw-diff-toolbar"><span>${h ? `${esc(h.repo)} <b>·</b> Hunk ${v.hunk + 1}/${v.hunks.length} ${h.seen ? "· ✓ read" : ""}` : "No patch hunks"}</span><div>${button("toggle-diff", full ? "One hunk" : "Full diff")}${button("edit-patch", "Edit patch")}</div></div>${full ? Object.entries(v.patches).map(([repo, text]) => `<h3 class="tw-repo-heading">${esc(repo)}</h3>${diff(text)}`).join("") : `<div class="tw-anchor">${esc(h?.anchor || "Read the message and checks.")}</div>${diff(h?.text || "This round has no patch hunks.")}`}<div class="tw-diff-note">${button("note", "◇ Comment", "secondary")}${button("request-change", "Request changes")}</div>`;
  }
  if (page === 2) return `<p class="tw-lead">Say what changed.</p><p class="muted">What changed? Why? What did you run? Put that here. Typing keeps a draft; Save puts the text in the record.</p>${messages()}`;
  return `<div class="tw-notes">${v.comments.map(note => `<article><small>${esc(note.anchor || "Whole round")} · ${esc(new Date(note.at).toLocaleString())}</small><p>${esc(note.text)}</p></article>`).join("") || '<p class="tw-lead">No comments yet. See something wrong? Say so.</p>'}</div><label class="tw-note-label">Your comment<textarea id="review-note" data-editor="${noteKey}" rows="5" placeholder="What should change here, and why?">${esc(value(noteKey))}</textarea></label><label class="tw-checkbox"><input id="anchor-note" type="checkbox" ${anchorNote ? "checked" : ""}> Comment on this hunk</label><div class="tw-note-actions">${button("comment", "Save comment", "primary")}${button("reject", "Request changes", "secondary")}${v.status === "changes_requested" ? button("resolve", "Request fixed") : ""}</div>${Object.keys(v.drafts).length ? `<div class="tw-drafts"><b>Unfinished drafts</b><p>${Object.keys(v.drafts).map(key => esc(fieldLabel(key))).join(" · ")}</p>${["comment", "requested change"].filter(key => key in v.drafts).map(key => button("resume-note", "Resume " + key, "quiet", `data-key="${key}"`)).join("")}${button("discard", "Discard unfinished drafts")}</div>` : ""}`;
}
function companion() {
  const messages = settings.messages.filter(m => m.root === v?.root);
  return `<aside class="tw-companion">${lesson()}${practice() || dawkins() ? "" : `<section class="tw-widget">${divine() ? `<div class="tw-divine-orbit"><span>✧</span><bdi>𐤉𐤄𐤅𐤄</bdi></div><div class="tw-widget-caption"><span class="tw-kicker">I BROUGHT THE PATCH</span><h2>Let there be<br>less bullshit.</h2><p>“I will go down and see.”<br><small>Genesis 18:21 · I have to look too.</small></p>${button("fact", "A footnote from Genesis ↗")}</div>` : `<div class="tw-obituary"><strong>God is dead.</strong><small>His patches still need review.</small></div><div class="tw-circus" aria-label="Nietzsche Family Circus">${circus ? `<img src="${esc(circus.image)}" alt="Family Circus cartoon"><p>${esc(circus.quote)}</p>` : `<p>${circusBusy ? "Finding the eternal recurrence…" : "Random cartoons. Random Nietzsche."}</p>`}${circusError ? `<small role="alert">${esc(circusError)}</small>` : ""}<div>${button("circus-next", circusBusy ? "Loading…" : "Next ↻", "quiet", circusBusy ? "disabled" : "")}${button("circus-share", "Share", "quiet", circus ? "" : "disabled")}</div><small>Nietzsche Family Circus</small></div>`}</section>`}<section class="tw-assistant"><header><span class="tw-assistant-mark">${divine() ? "✧" : ">_"}</span><div><b>${divine() ? "Yahweh" : "Review assistant"}</b><small>${practice() ? "Instructions only · no model running" : settings.mode === "offline" ? "Fixed replies · no model running" : settings.mode === "codex" ? "Codex · xhigh" : "Ollama"}</small></div>${button("settings", dawkins() ? "Setup" : "···", "quiet", 'aria-label="Assistant settings"')}</header><div class="tw-chat-log" role="log">${practice() ? `<p class="tw-chat-welcome">No model is running here. This box repeats the current step; it cannot answer a question about the code.</p>` : ""}${messages.length ? messages.map(m => `<article class="${m.role}"><small>${m.role === "user" ? "You" : divine() ? "Yahweh" : "Assistant"}</small><p>${esc(m.content)}</p></article>`).join("") : practice() ? "" : `<p class="tw-chat-welcome">${divine() ? "Where are you? Ah. Here. Show me the code. I'll come down and look. Bring bread if this takes a while." : "Ask about the current hunk, the evidence, or how to make the change smaller."}</p>`}</div><form id="assistant-form"><textarea id="assistant-message" aria-label="Message review assistant" rows="2" placeholder="${practice() ? "Get the current instructions…" : divine() ? "Show me what's wrong…" : "Discuss this hunk…"}"></textarea><div><small>${applying ? "Revising commits…" : working ? "Waiting for the assistant…" : practice() ? "Fixed instructions" : "Whole sequence included · Enter sends"}</small><button class="button secondary" type="submit">${practice() ? "Repeat step" : dawkins() ? "Send" : "Send ↗"}</button></div></form></section></aside>`;
}
function render() {
  if (!settings) return;
  const active = document.activeElement;
  const editor = $("#app").contains(active) && (active?.dataset.editor
    ? `[data-editor="${CSS.escape(active.dataset.editor)}"]` : active?.id ? `#${CSS.escape(active.id)}` : null);
  const selection = editor && active.matches("textarea,input:not([type=range])") ? [active.selectionStart, active.selectionEnd, active.scrollTop] : null;
  const previousScroll = $(".tw-content")?.scrollTop || 0;
  const accepted = v?.rounds.filter(r => r.status === "accepted").length || 0;
  document.body.dataset.theme = divine() ? "yhwh" : dawkins() ? "dawkins" : "nietzsche";
  $("#app").innerHTML = `<div class="tw-app"><header class="tw-header"><div class="tw-brand"><span class="tw-logo">${divine() ? "✧" : "⌘"}</span><b>THWH</b><span>the review</span></div><div class="tw-workspace-name">${practice() ? "PRACTICE · sample repositories" : esc(v?.root.split("/").at(-1) || "Choose directory")} <span>/</span> ${v?.round ? esc(v.round.id) : "review"}</div><label class="tw-energy"><span>Amount of YHWH-ness <b>${settings.energy}%</b></span><input id="energy" type="range" min="0" max="100" step="50" value="${settings.energy}" aria-label="Amount of YHWH-ness" aria-valuetext="${divine() ? "YHWH, 100 percent" : dawkins() ? "dawkins, 0 percent" : "nietzsche, 50 percent"}"><span class="tw-energy-labels"><span>dawkins</span><span>nietzsche</span><span>YHWH</span></span></label></header><aside class="tw-sidebar"><div class="tw-nav-label">${dawkins() ? "REVIEW" : "READ THE CODE"}</div><nav aria-label="Review views">${pages.map((name, i) => `<button data-action="view" data-page="${i}" class="${page === i ? "selected" : ""}" aria-current="${page === i ? "page" : "false"}"><span>${glyphs[i]}</span>${name}<kbd>${i + 1}</kbd></button>`).join("")}</nav><div class="tw-nav-label tw-files-label">THIS ROUND <span>${v?.hunks.length || 0} HUNKS</span></div><div class="tw-hunk-list">${v?.hunks.map((h, i) => `<button class="${i === v.hunk ? "selected" : ""}" data-action="hunk" data-hunk="${i}" title="${esc(h.anchor)}"><span>${h.seen ? "✓" : "·"}</span><div><b>${esc(h.repo)}</b><small>${esc(h.text.split("\n")[0].replace("diff --git ", ""))}</small></div><small>${i + 1}</small></button>`).join("") || '<p class="muted">Open a prepared review.</p>'}</div><div class="tw-sidebar-bottom"><div class="tw-progress"><span>${accepted}/${v?.rounds.length || 0} rounds accepted</span><progress value="${accepted}" max="${v?.rounds.length || 1}"></progress></div>${button("tutorial-start", "Practice review")}${button("choose", dawkins() ? "Choose directory" : "⌘  Choose directory")}${button("refresh", dawkins() ? "Refresh review" : "↻  Refresh review")}${button("help", dawkins() ? "Keys / ?" : "?  Keyboard shortcuts")}</div></aside><main class="tw-main">${lastError ? `<div class="tw-error" role="alert"><b>${divine() ? "Well, shit. That failed." : "That failed."}</b><p>${esc(lastError)}</p></div>` : ""}<header class="tw-round-header"><div><span class="tw-kicker">${v?.round ? esc(v.round.id) + " · " + esc(v.status.replaceAll("_", " ")) : "LOCAL CODE REVIEW"}</span><h2>${esc(v?.round?.title || "The review")}</h2></div><span class="tw-page-name">${pages[page]}</span></header>${v?.pending ? '<div class="tw-warning">I stopped while accepting a change. Click Start / resume to finish the commits already recorded in the journal.</div>' : ""}<div class="tw-content" tabindex="0">${content()}</div><footer class="tw-actions"><div>${button("previous", "← Previous")}${button("note", "◇ Comment")}${v?.status === "changes_requested" ? button("resolve", "Request fixed") : ""}</div><div>${v?.round ? button("accept", "Accept…", "quiet") + button("advance", v.pending || !v.active ? "Start / resume →" : page === 0 ? "Read the patch →" : page === 1 ? "Read · next →" : page === 2 ? "Accept…" : "Back to the patch →", "primary") : ""}</div></footer></main>${companion()}<footer class="tw-status"><span><i></i> ${applying ? "Codex is revising the sequence. This may take a few minutes." : working ? "Working…" : Object.keys(v?.drafts || {}).length ? "Drafts saved · click Save in each editor before Accept" : "Your place is saved"}</span><span>${v ? `${v.hunks.filter(h => h.seen).length}/${v.hunks.length} hunks read · ` : ""}Local commits · nothing pushed</span>${button("pause", "Save & quit   q")}</footer></div>`;
  $(".tw-content").scrollTop = previousScroll;
  $("#assistant-message").value = localStorage.getItem(chatKey()) || "";
  $(".tw-chat-log").scrollTop = $(".tw-chat-log").scrollHeight;
  if (working) document.querySelectorAll(".tw-app button, .tw-app select, #energy").forEach(b => b.disabled = true);
  const replacement = editor && $(editor);
  if (replacement && !replacement.disabled) {
    replacement.focus({ preventScroll: true });
    if (selection && replacement.setSelectionRange && selection[0] !== null) {
      replacement.setSelectionRange(selection[0], selection[1]);
      replacement.scrollTop = selection[2];
    }
  }
}
async function go(next, extra = {}) {
  page = next; patchRepo = null;
  if (v) await request("position", { screen: { page, offset: 0, document: null, full_diff: full, ...extra } });
  render(); $(".tw-content").scrollTop = 0;
}
function modal(html) {
  $("#modal-root").innerHTML = `<div class="tw-modal-shade"><section class="tw-modal" role="dialog" aria-modal="true" tabindex="-1">${html}<div class="tw-modal-close">${button("close-modal", "Close / Esc")}</div></section></div>`;
  $(".tw-modal").focus();
}
async function preview() {
  if (!v?.round) return;
  if (v.instructionsDraft !== null || "instructions" in edits) throw new Error("Save the commit sequence instructions before Accept.");
  if (Object.keys(v.drafts).length) throw new Error("There are unfinished drafts. Open Comments to find them, then save or discard them before Accept.");
  if (v.status === "changes_requested") throw new Error("Fix the requested changes, then click Request fixed in Comments.");
  modal(`<span class="tw-kicker">READ THIS BEFORE YOU COMMIT</span><h1>Accept ${esc(v.round.id)} locally?</h1><p>${v.hunks.filter(h => h.seen).length}/${v.hunks.length} hunks marked read · ${v.comments.length} comments</p><p>Add one commit to <b>master</b> in ${Object.keys(v.patches).map(esc).join(" + ")}. Save the final text in ${esc(v.paths.master)} and update ${esc(v.paths.board)}.</p><p class="muted">Git checks that every patch applies before either branch moves. This does not run tests. Nothing is pushed or posted.</p><div class="tw-preview-copy"><h3>Message</h3><p>${esc(v.round.teams)}</p><h3>${esc(v.round.mr_title)}</h3>${Object.entries(v.round.descriptions).map(([repo, text]) => `<h4>${esc(repo)}</h4><p>${esc(text)}</p>`).join("")}<h3>Checks</h3><p>${esc(v.round.validation)}</p></div>${button("confirm-accept", (Object.keys(v.patches).length === 2 ? "Accept both patches" : "Accept patches") + " · y", "primary")}`);
}
async function advance() {
  if (!v?.active || v.pending) {
    const recovering = v?.pending;
    await request("start");
    if (recovering) return go(0);
    if (page !== 0) return go(page);
  }
  if (page === 0) return go(1);
  if (page === 1) { const last = v.hunk >= v.hunks.length - 1; await request("next"); return go(last ? 2 : 1); }
  if (page === 2) return preview();
  return go(1);
}
async function loadCircus() {
  if (circusBusy) return;
  circusBusy = true; circusError = ""; render();
  try { circus = await api.circus(); }
  catch (error) { circusError = error.message; }
  finally { circusBusy = false; render(); }
}
async function action(name, element) {
  if (name === "save-instructions") {
    await request("save-instructions", { text: edits.instructions ?? v.instructionsDraft ?? v.instructions });
    delete edits.instructions;
    toast("Instructions saved for the whole commit sequence.");
    return;
  }
  if (name === "apply-requests") {
    if ("instructions" in edits || v.instructionsDraft !== null) await action("save-instructions");
    applying = true; render();
    try { settings = await api.thwhRevise(); lastError = ""; }
    finally { applying = false; settings = await api.thwhRead(); v = await api.reviewRead(); }
    toast("The assistant finished. Read its result and review the commits.");
    return;
  }
  if (["tutorial-start", "tutorial-leave", "tutorial-restart", "tutorial-skip"].includes(name)) {
    clearTimeout(scrollTimer);
    const result = await api.thwhTutorial(name.replace("tutorial-", ""));
    v = result.view; settings.tutorial = result.tutorial;
    page = v?.screen.page || 0; full = v?.screen.full_diff || false;
    patchRepo = null; noteKey = "comment"; anchorNote = true;
    Object.keys(edits).forEach(key => delete edits[key]);
    $("#modal-root").innerHTML = "";
    render();
    $(".tw-content").scrollTop = v?.screen.offset || 0;
    toast(practice() ? "The practice repos are ready. The instructions are on the right." : v ? "Practice saved. Back to your code." : "Choose a prepared workspace, or return to practice.");
    return;
  }
  if (name === "tutorial-hint") {
    const current = settings.tutorial.lessons[settings.tutorial.step];
    await go(current.page);
    const target = $(current.target);
    target?.scrollIntoView({ block: "nearest" });
    target?.focus({ preventScroll: true });
    return;
  }
  if (name === "close-modal") { $("#modal-root").innerHTML = ""; return; }
  if (name === "circus-next") { loadCircus(); return; }
  if (name === "circus-share") { await api.copy(circus.permalink); toast("Permalink copied."); return; }
  if (name === "fact" || name === "next-fact") {
    if (name === "next-fact") factIndex = (factIndex + 1) % settings.facts.length;
    const fact = settings.facts[factIndex];
    modal(`<span class="tw-kicker">GENESIS, WITH FOOTNOTES</span><h1>${esc(fact.title)}</h1><p>${esc(fact.text)}</p><blockquote>${esc(fact.evidence)}</blockquote><p class="muted">${esc(fact.source)}</p>${button("next-fact", "Another footnote →", "secondary")}`); return;
  }
  if (name === "help") { modal(`<h1>Read. Comment. Commit.</h1><p>Practice uses its own repos. The instructions say which button I'm waiting for. They check saved actions, not whether you understood the code.</p>${button("tutorial-start", "Open practice", "primary")}<p>Enter: Start → Diff → Messages → Accept…<br>1–6 / Tab: change pages · ←/→: hunks<br>d: full diff · f: pick a hunk · c/n: comment / request changes<br>e: messages · Shift+E: patch · r: request fixed<br>a: open Accept… · y: commit in that window · q: save & quit<br>Ctrl+S in an editor: save its text · Esc: close window</p><p>The slider turns the god down. The code stays put.</p>`); return; }
  if (name === "settings") { modal(`<h1>Review assistant</h1><form id="settings-form"><label>Engine<select name="mode"><option value="codex" ${settings.mode === "codex" ? "selected" : ""}>Codex</option><option value="ollama" ${settings.mode === "ollama" ? "selected" : ""}>Ollama</option><option value="offline" ${settings.mode === "offline" ? "selected" : ""}>Fixed replies · no model</option></select></label><label>Ollama model<input name="model" value="${esc(settings.model)}"></label><p class="muted">Codex uses your installed CLI configuration, xhigh reasoning, and full access. Run codex login first.</p><button class="button primary" type="submit">Save settings</button></form>`); return; }
  if (name === "view") return go(Number(element.dataset.page));
  if (name === "note" || name === "request-change") { noteKey = name === "request-change" ? "requested change" : "comment"; await go(3); $("#review-note").focus(); if (name === "request-change") toast("Write the requested change, then choose Request changes."); return; }
  if (name === "resume-note") { noteKey = element.dataset.key; render(); $("#review-note").focus(); return; }
  if (name === "choose") { const result = await api.reviewChoose(); if (result) { clearTimeout(scrollTimer); v = result; settings.tutorial = v.tutorial; page = v.screen.page || 0; full = v.screen.full_diff || false; patchRepo = null; Object.keys(edits).forEach(k => delete edits[k]); } return; }
  if (name === "refresh") { v = await api.reviewRead(); settings.tutorial = v.tutorial; toast("Review reloaded. Your unfinished text is still in the editors."); return; }
  if (name === "advance") return advance();
  if (name === "previous") { await request("previous"); return go(1); }
  if (name === "hunk") { full = false; $("#modal-root").innerHTML = ""; await request("position", { hunk: Number(element.dataset.hunk), screen: { page: 1, offset: 0, full_diff: false } }); return go(1); }
  if (name === "toggle-diff") { full = !full; return go(1); }
  if (name === "edit-patch") { page = 1; patchRepo = Object.keys(v.patches)[0]; return; }
  if (name === "close-patch") { patchRepo = null; return; }
  if (name === "save-field") { const key = element.dataset.key; const field = fieldNames.find(([label]) => label === key)?.[1]; const fallback = field ? v.round[field] : v.round.descriptions[key.replace(/ MR description$/, "")]; await request("save-field", { key, text: value(key, fallback) }); delete edits[key]; toast("Saved. That text will go in the record."); return; }
  if (name === "save-patch") { const key = patchRepo + " patch"; await request("save-patch", { repo: patchRepo, patch: value(key, v.patches[patchRepo]) }); delete edits[key]; toast("Patch saved. Read it again, run the checks, then update Checks. I haven't run them for you."); return; }
  if (name === "comment" || name === "reject") { const text = value(noteKey); await request(name === "reject" ? "reject" : "comment", { text, draftKey: noteKey, onHunk: anchorNote }); delete edits[noteKey]; toast(name === "reject" ? "Request saved. Fix it, then click Request fixed." : "Comment saved."); return; }
  if (name === "resolve") { await request("resolve"); toast("Request marked fixed. Read the changes before Accept."); return; }
  if (name === "accept") return preview();
  if (name === "confirm-accept") { $("#modal-root").innerHTML = ""; const count = Object.keys(v.patches).length; await request("accept"); page = 0; await go(0); toast(`Committed in ${count} ${count === 1 ? "repo" : "repos"}. Saved in Files → Accepted changes.`); return; }
  if (name === "discard") { modal(`<h1>Discard unfinished drafts?</h1><p>Saved messages, patches, and notes remain.</p>${button("confirm-discard", "Discard drafts", "primary")}`); return; }
  if (name === "confirm-discard") { await request("discard-drafts"); Object.keys(edits).forEach(k => delete edits[k]); $("#modal-root").innerHTML = ""; return; }
  if (name === "document") {
    const document = element.dataset.document;
    if (["master", "board"].includes(document)) await go(5, { record: document });
    else await go(5, { document });
    return;
  }
  if (name === "copy-document") { await api.copy(v.screen.document ? v.document : v.screen.record === "board" ? v.board : v.master); toast("Document copied."); return; }
  if (name === "pause") { if (v) await request("pause"); await api.closeAfterSave(); }
}
document.addEventListener("click", event => {
  const element = event.target.closest("[data-action]");
  if (!element || element.disabled) return;
  const name = element.dataset.action;
  enqueue(() => ["circus-next", "circus-share", "fact", "next-fact", "help", "settings", "close-modal", "accept", "discard"].includes(name) ? action(name, element) : work(() => action(name, element)));
});
document.addEventListener("input", event => {
  if (event.target.id === "assistant-message") localStorage.setItem(chatKey(), event.target.value);
  const key = event.target.dataset.editor;
  if (!key) return;
  const text = event.target.value;
  edits[key] = text;
  if (key === "instructions") {
    const root = v.root;
    enqueue(async () => { if (v.root === root) await request("draft-instructions", { text }); });
    return;
  }
  const roundId = v.round.id, root = v.root;
  enqueue(async () => { if (v.root !== root || v.round?.id !== roundId) throw new Error("The review changed; refresh before editing."); await request("draft", { key, text }); });
});
document.addEventListener("change", event => {
  if (event.target.id === "anchor-note") anchorNote = event.target.checked;
  if (event.target.id === "patch-repo") { patchRepo = event.target.value; render(); }
  if (event.target.id === "energy") {
    const energy = Number(event.target.value);
    enqueue(() => work(async () => {
      settings = await api.thwhSettings({ energy });
      render();
      if (energy === 50 && !circus) loadCircus();
    }));
  }
});
document.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.id === "settings-form") {
    const form = new FormData(event.target);
    enqueue(() => work(async () => { settings = await api.thwhSettings(Object.fromEntries(form)); $("#modal-root").innerHTML = ""; }));
  }
  if (event.target.id === "assistant-form") {
    const message = $("#assistant-message").value;
    if (!message.trim()) return;
    enqueue(() => work(async () => {
      try { settings = await api.thwhChat(message); lastError = ""; localStorage.removeItem(chatKey()); }
      finally { settings = await api.thwhRead(); v = await api.reviewRead(); }
    }));
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { $("#modal-root").innerHTML = ""; return; }
  if (event.target.matches("textarea,input,select")) {
    if (event.target.id === "assistant-message" && event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      if (!working) $("#assistant-form").requestSubmit();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "s" && event.target.dataset.editor) {
      event.preventDefault(); const key = event.target.dataset.editor;
      enqueue(() => work(() => action(key === "instructions" ? "save-instructions" : key.endsWith(" patch") ? "save-patch" : ["comment", "requested change"].includes(key) ? "comment" : "save-field", { dataset: { key } })));
    }
    return;
  }
  if (working || event.ctrlKey || event.metaKey || event.altKey) return;
  if ($(".tw-modal")) { if (event.key === "y" && $("[data-action=confirm-accept]")) $("[data-action=confirm-accept]").click(); return; }
  if (event.key === "Enter" && event.target.closest("button")) return;
  if (["j", "k", "ArrowDown", "ArrowUp", "PageDown", "PageUp", " ", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const area = $(".tw-content"), key = event.key;
    if (key === "Home" || key === "End") area.scrollTop = key === "Home" ? 0 : area.scrollHeight;
    else area.scrollTop += ["k", "ArrowUp", "PageUp"].includes(key) ? -(key === "PageUp" ? area.clientHeight * .8 : 40) : ["PageDown", " "].includes(key) ? area.clientHeight * .8 : 40;
    return;
  }
  const nextPage = /^[1-6]$/.test(event.key) ? Number(event.key) - 1 : event.key === "Tab" ? (page + (event.shiftKey ? 5 : 1)) % 6 : null;
  if (nextPage !== null) { event.preventDefault(); enqueue(() => work(() => go(nextPage))); return; }
  const name = { Enter: "advance", ArrowLeft: "previous", p: "previous", ArrowRight: "hunk-next", y: "hunk-next", d: "toggle-diff", c: "note", n: "request-change", e: "messages", E: "edit-patch", a: "accept", q: "pause", r: "resolve", "?": "help", f: "files" }[event.key];
  if (!name || !v) return;
  event.preventDefault();
  enqueue(() => work(async () => {
    if (name === "messages") return go(2);
    if (name === "files") { modal(`<h1>Choose a hunk</h1>${v.hunks.map((h, i) => button("hunk", esc(h.anchor), "quiet", `data-hunk="${i}"`)).join("")}`); return; }
    if (name === "hunk-next") { await request("position", { hunk: v.hunk + 1, screen: { page: 1, offset: 0, full_diff: false } }); return go(1); }
    await action(name, { dataset: {} });
  }));
});
document.addEventListener("scroll", event => {
  if (!event.target.matches?.(".tw-content") || !v?.round) return;
  clearTimeout(scrollTimer);
  const root = v.root, roundId = v.round.id;
  const screen = { ...v.screen, page, offset: event.target.scrollTop, full_diff: full };
  scrollTimer = setTimeout(() => enqueue(() => {
    if (v?.root === root && v.round?.id === roundId) return request("position", { screen });
  }), 250);
}, true);
api.onBeforeClose(() => enqueue(async () => { if (v) await request("pause"); await api.closeAfterSave(); }));
api.onExport(() => enqueue(async () => { const result = await api.reviewExport(); if (result) toast("Review files exported."); }));
setInterval(() => {
  if (!v || working || practice() || Object.keys(edits).length || $(".tw-modal") || document.activeElement?.matches("textarea,input,select")) return;
  enqueue(async () => {
    if (working) return;
    const next = await api.reviewRead();
    if (next.revision === v.revision) return;
    v = next; settings.tutorial = v.tutorial;
    render();
  });
}, 4000);
(async () => {
  settings = await api.thwhRead();
  try { v = await api.reviewRead(); settings.tutorial = v.tutorial; page = v.screen.page || 0; full = v.screen.full_diff || false; }
  catch (error) { if (practice() || settings.tutorial?.dismissed || settings.tutorial?.completed) toast(error.message, true); }
  render(); if (v?.screen.offset && page === v.screen.page) $(".tw-content").scrollTop = v.screen.offset;
  if (settings.energy === 50) loadCircus();
})().catch(error => toast(error.message, true));
