/* Six views, one saved review. The Python engine owns every review decision. */
const api = window.yhwh;
const $ = s => document.querySelector(s);
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pages = ["Start", "Diff", "Messages", "Notes", "Roadmap", "Context"];
const glyphs = ["◈", "±", "≡", "◇", "⌘", "▤"];
let v, settings, page = 0, full = false, patchRepo = null, notice = "Your place is saved. One hunk is enough.", working = false;
let circus = null, circusError = "", circusBusy = false, chain = Promise.resolve(), scrollTimer, anchorNote = true, noteKey = "comment", factIndex = 2;
const edits = {};
const fieldNames = [["Round title", "title"], ["Teams message", "teams"], ["MR title", "mr_title"], ["Validation and limits", "validation"]];
const divine = () => settings?.energy === 100;
const button = (action, label, cls = "quiet", extra = "") => `<button class="button ${cls}" data-action="${action}" ${extra}>${label}</button>`;
const value = (key, fallback = "") => edits[key] ?? v?.drafts?.[key] ?? fallback;
function enqueue(fn) {
  const next = chain.then(fn);
  chain = next.catch(error => { toast(error.message, true); });
  return next;
}
function toast(message, error = false) {
  notice = message;
  $("#toast").textContent = message;
  $("#toast").className = `show${error ? " error" : ""}`;
  setTimeout(() => $("#toast").className = "", 6000);
}
async function request(action, input = {}) {
  v = await api.reviewAct(action, { roundId: v?.round?.id, revision: v?.revision, ...input });
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
function field(key, fallback, rows = 4) {
  const dirty = key in edits || key in (v?.drafts || {});
  return `<section class="tw-field"><label>${esc(key)}<textarea data-editor="${esc(key)}" rows="${rows}" spellcheck="false">${esc(value(key, fallback))}</textarea></label><div class="tw-field-foot"><small>${dirty ? "Unfinished draft · saved as you type" : "Saved to this round"}</small>${button("save-field", "Save field", "secondary", `data-key="${esc(key)}"`)}</div></section>`;
}
function messages() {
  return fieldNames.slice(0, 3).map(([key, name]) => field(key, v.round[name], name === "teams" ? 4 : 2)).join("") +
    Object.entries(v.round.descriptions).map(([repo, description]) => field(`${repo} MR description`, description)).join("") +
    field("Validation and limits", v.round.validation, 5);
}
function content() {
  if (!v) return `<div class="tw-empty"><span class="tw-big-glyph">⌘</span><h1>Open your review workspace.</h1><p>Choose a folder containing the prepared review.</p>${button("choose", "Choose workspace", "primary")}</div>`;
  const r = v.round, h = v.hunks[v.hunk];
  if (page === 5) return `<div class="tw-context-tabs">${button("document", "Accepted handoff", "quiet", 'data-document="master"')}${button("document", "Board", "quiet", 'data-document="board"')}</div><div class="tw-document-list">${v.documents.map(name => button("document", esc(name.split("/").at(-1)), "quiet", `data-document="${esc(name)}"`)).join("")}</div><pre class="tw-document">${esc(v.screen.document ? v.document : v.screen.record === "board" ? v.board : v.master || "No rounds accepted yet. Open a context file above whenever you need it.")}</pre>${button("copy-document", "Copy displayed text", "secondary")}`;
  if (page === 4) return `<p class="tw-lead">The requested upgrade first. Then one useful improvement at a time.</p><div class="tw-rounds">${v.rounds.map(item => `<article class="${item.id === r?.id ? "current" : ""}"><span class="tw-round-id">${esc(item.id)}</span><div><h3>${esc(item.title)}</h3><small>${esc(item.status.replaceAll("_", " "))}</small></div><span>${item.status === "accepted" ? "✓" : item.id === r?.id ? "← you are here" : ""}</span></article>`).join("")}</div>`;
  if (!r) return `<div class="tw-empty"><span class="tw-big-glyph">✓</span><h1>${divine() ? "And the review was good." : "Every round is accepted."}</h1><p>Your finished messages, MR descriptions, and evidence are ready in Context.</p>${button("view", "Read the handoff", "primary", 'data-page="5"')}</div>`;
  if (page === 0) return `<section class="tw-next"><span class="tw-kicker">YOUR NEXT SMALL STEP</span><h1>One hunk.<br>Then you can stop.</h1><p>Read hunk <b>${v.hunks.length ? v.hunk + 1 : 0} of ${v.hunks.length}</b>. Give it your attention.<br>You don’t have to finish the whole review today.</p>${button("advance", "Begin this small step →", "primary")}</section><section class="tw-purpose"><span class="tw-kicker">WHY THIS CHANGE</span><h2>${esc(r.title)}</h2><p>${esc(r.teams)}</p></section><div class="tw-start-meta"><span>◈ ${Object.keys(r.commits).map(esc).join(" + ")}</span><span>✓ ${v.hunks.filter(h => h.seen).length}/${v.hunks.length} hunks read</span><span>◇ ${v.comments.length} notes</span></div>${v.status === "changes_requested" ? '<p class="tw-warning">Changes requested. Read Notes, revise the patch and message, then mark the request addressed.</p>' : ""}`;
  if (page === 1) {
    if (patchRepo) return `<div class="tw-patch-top"><label>Repository <select id="patch-repo">${Object.keys(v.patches).map(repo => `<option ${repo === patchRepo ? "selected" : ""}>${esc(repo)}</option>`).join("")}</select></label>${button("close-patch", "Return to diff")}</div><p class="muted">Edit the unified diff. Git checks every repository before acceptance; update validation after code changes.</p><section class="tw-field"><label>${esc(patchRepo)} patch<textarea class="tw-patch-editor" data-editor="${esc(patchRepo)} patch" rows="24" spellcheck="false">${esc(value(`${patchRepo} patch`, v.patches[patchRepo]))}</textarea></label>${button("save-patch", "Save patch", "primary")}</section>`;
    return `<div class="tw-diff-toolbar"><span>${h ? `${esc(h.repo)} <b>·</b> Hunk ${v.hunk + 1}/${v.hunks.length} ${h.seen ? "· ✓ read" : ""}` : "No patch hunks"}</span><div>${button("toggle-diff", full ? "One hunk" : "Full paired diff")}${button("edit-patch", "Edit patch")}</div></div>${full ? Object.entries(v.patches).map(([repo, text]) => `<h3 class="tw-repo-heading">${esc(repo)}</h3>${diff(text)}`).join("") : `<div class="tw-anchor">${esc(h?.anchor || "Review the messages and evidence.")}</div>${diff(h?.text || "This round has no patch hunks.")}`}<div class="tw-diff-note">${button("note", "◇ Leave a note", "secondary")}${button("request-change", "Request changes")}</div>`;
  }
  if (page === 2) return `<p class="tw-lead">A small change deserves a clear handoff.</p><p class="muted">Read the message, MR descriptions, and evidence. Text drafts save as you type; Save field makes an edit final.</p>${messages()}`;
  return `<div class="tw-notes">${v.comments.map(note => `<article><small>${esc(note.anchor || "Whole round")} · ${esc(new Date(note.at).toLocaleString())}</small><p>${esc(note.text)}</p></article>`).join("") || '<p class="tw-lead">No notes yet. A concrete observation is enough.</p>'}</div><label class="tw-note-label">Your observation<textarea id="review-note" data-editor="${noteKey}" rows="5" placeholder="What should change here, and why?">${esc(value(noteKey))}</textarea></label><label class="tw-checkbox"><input id="anchor-note" type="checkbox" ${anchorNote ? "checked" : ""}> Attach to the displayed hunk</label><div class="tw-note-actions">${button("comment", "Save note", "primary")}${button("reject", "Request changes", "secondary")}${v.status === "changes_requested" ? button("resolve", "Mark changes addressed") : ""}</div>${Object.keys(v.drafts).length ? `<div class="tw-drafts"><b>Unfinished drafts</b><p>${Object.keys(v.drafts).map(esc).join(" · ")}</p>${["comment", "requested change"].filter(key => key in v.drafts).map(key => button("resume-note", "Resume " + key, "quiet", `data-key="${key}"`)).join("")}${button("discard", "Discard unfinished drafts")}</div>` : ""}`;
}
function companion() {
  const messages = settings.messages.filter(m => m.energy === settings.energy && m.root === v?.root);
  return `<aside class="tw-companion"><section class="tw-widget">${divine() ? `<div class="tw-divine-orbit"><span>✧</span><bdi>𐤉𐤄𐤅𐤄</bdi></div><div class="tw-widget-caption"><span class="tw-kicker">A LITTLE DIVINE INTERVENTION</span><h2>Let there be<br>one small change.</h2><p>“I will go down and see.”<br><small>Genesis 18:21 · even omniscience checks.</small></p>${button("fact", "A footnote from Genesis ↗")}</div>` : `<div class="tw-obituary"><strong>God is dead.</strong><small>We’ve reassigned his code reviews.</small></div><div class="tw-circus" aria-label="Nietzsche Family Circus">${circus ? `<img src="${esc(circus.image)}" alt="Family Circus cartoon"><p>${esc(circus.quote)}</p>` : `<p>${circusBusy ? "Finding the eternal recurrence…" : "Random cartoons. Random Nietzsche."}</p>`}${circusError ? `<small role="alert">${esc(circusError)}</small>` : ""}<div>${button("circus-next", circusBusy ? "Loading…" : "Next ↻", "quiet", circusBusy ? "disabled" : "")}${button("circus-share", "Share", "quiet", circus ? "" : "disabled")}</div><small>Nietzsche Family Circus</small></div>`}</section><section class="tw-assistant"><header><span class="tw-assistant-mark">${divine() ? "✧" : ">_"}</span><div><b>${divine() ? "Yahweh" : "Review assistant"}</b><small>${settings.mode === "offline" ? "Scripted guidance" : settings.mode === "codex" ? "Codex · xhigh" : "Ollama"}</small></div>${button("settings", "···", "quiet", 'aria-label="Assistant settings"')}</header><div class="tw-chat-log" role="log">${messages.length ? messages.map(m => `<article class="${m.role}"><small>${m.role === "user" ? "You" : divine() ? "Yahweh" : "Assistant"}</small><p>${esc(m.content)}</p></article>`).join("") : `<p class="tw-chat-welcome">${divine() ? "Where are you? Ah. Here. Give me the situation. I will come down and have a look." : "Ask about the current hunk, the evidence, or how to make the change smaller."}</p>`}</div><form id="assistant-form"><textarea id="assistant-message" aria-label="Message review assistant" rows="2" placeholder="${divine() ? "Give Yahweh the situation…" : "Discuss this hunk…"}"></textarea><div><small>${working ? "Working…" : "Current hunk included"}</small><button class="button secondary" type="submit">Send ↗</button></div></form></section></aside>`;
}
function render() {
  if (!settings) return;
  const active = document.activeElement;
  const editor = $("#app").contains(active) && (active?.dataset.editor
    ? `[data-editor="${CSS.escape(active.dataset.editor)}"]` : active?.id ? `#${CSS.escape(active.id)}` : null);
  const selection = editor && active.matches("textarea,input:not([type=range])") ? [active.selectionStart, active.selectionEnd, active.scrollTop] : null;
  const previousScroll = $(".tw-content")?.scrollTop || 0;
  const draftChat = $("#assistant-message")?.value || "";
  const accepted = v?.rounds.filter(r => r.status === "accepted").length || 0;
  document.body.dataset.theme = divine() ? "yhwh" : "nietzsche";
  $("#app").innerHTML = `<div class="tw-app"><header class="tw-header"><div class="tw-brand"><span class="tw-logo">${divine() ? "✧" : "⌘"}</span><b>THWH</b><span>the review</span></div><div class="tw-workspace-name">${esc(v?.root.split("/").at(-1) || "Choose workspace")} <span>/</span> ${v?.round ? esc(v.round.id) : "review"}</div><label class="tw-energy"><span>Amount of YHWH-ness <b>${settings.energy}%</b></span><input id="energy" type="range" min="0" max="100" step="50" value="${settings.energy}" aria-label="Amount of YHWH-ness" aria-valuetext="${divine() ? "YHWH, 100 percent" : "nietzsche, 50 percent"}"><span class="tw-energy-labels"><span>dawkins</span><span>nietzsche</span><span>YHWH</span></span></label></header><aside class="tw-sidebar"><div class="tw-nav-label">ONE SMALL STEP AT A TIME</div><nav aria-label="Review views">${pages.map((name, i) => `<button data-action="view" data-page="${i}" class="${page === i ? "selected" : ""}" aria-current="${page === i ? "page" : "false"}"><span>${glyphs[i]}</span>${name}<kbd>${i + 1}</kbd></button>`).join("")}</nav><div class="tw-nav-label tw-files-label">THIS ROUND <span>${v?.hunks.length || 0} HUNKS</span></div><div class="tw-hunk-list">${v?.hunks.map((h, i) => `<button class="${i === v.hunk ? "selected" : ""}" data-action="hunk" data-hunk="${i}" title="${esc(h.anchor)}"><span>${h.seen ? "✓" : "·"}</span><div><b>${esc(h.repo)}</b><small>${esc(h.text.split("\n")[0].replace("diff --git ", ""))}</small></div><small>${i + 1}</small></button>`).join("") || '<p class="muted">Open a prepared review.</p>'}</div><div class="tw-sidebar-bottom"><div class="tw-progress"><span>${accepted}/${v?.rounds.length || 0} rounds accepted</span><progress value="${accepted}" max="${v?.rounds.length || 1}"></progress></div>${button("choose", "⌘  Choose workspace")}${button("refresh", "↻  Refresh shared review")}${button("help", "?  Keyboard shortcuts")}</div></aside><main class="tw-main"><header class="tw-round-header"><div><span class="tw-kicker">${v?.round ? esc(v.round.id) + " · " + esc(v.status.replaceAll("_", " ")) : "LOCAL PR REHEARSAL"}</span><h2>${esc(v?.round?.title || "The review")}</h2></div><span class="tw-page-name">${pages[page]}</span></header>${v?.pending ? '<div class="tw-warning">An interrupted acceptance needs recovery. Start / resume completes only the recorded transaction.</div>' : ""}<div class="tw-content" tabindex="0">${content()}</div><footer class="tw-actions"><div>${button("previous", "← Previous")}${button("note", "◇ Note")}${v?.status === "changes_requested" ? button("resolve", "Mark changes addressed") : ""}</div><div>${v?.round ? button("accept", "Preview acceptance", "quiet") + button("advance", v.pending || !v.active ? "Start / resume →" : page === 0 ? "Review next hunk →" : page === 1 ? "Read · next →" : page === 2 ? "Review acceptance →" : "Continue review →", "primary") : ""}</div></footer></main>${companion()}<footer class="tw-status"><span><i></i> ${working ? "Working…" : Object.keys(v?.drafts || {}).length ? "Drafts saved · finish before acceptance" : "Your place is saved"}</span><span>${v ? `${v.hunks.filter(h => h.seen).length}/${v.hunks.length} hunks read · ` : ""}Local rehearsal · nothing posted</span>${button("pause", "Save & pause   q")}</footer></div>`;
  $(".tw-content").scrollTop = previousScroll;
  $("#assistant-message").value = draftChat;
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
  if (Object.keys(v.drafts).length) throw new Error("Finish or discard unfinished drafts before acceptance. Open Notes to see them.");
  if (v.status === "changes_requested") throw new Error("Revise the requested changes, then mark them addressed in Notes.");
  modal(`<span class="tw-kicker">REVIEW YOUR DECISION</span><h1>Accept ${esc(v.round.id)} locally?</h1><p>${v.hunks.filter(h => h.seen).length}/${v.hunks.length} hunks marked read · ${v.comments.length} notes</p><p>Add one commit to <b>master</b> in ${Object.keys(v.patches).map(esc).join(" + ")}. Save the final text in ${esc(v.paths.master)} and update ${esc(v.paths.board)}.</p><p class="muted">Every patch is checked before either branch moves. Nothing is pushed or posted.</p><div class="tw-preview-copy"><h3>Teams</h3><p>${esc(v.round.teams)}</p><h3>${esc(v.round.mr_title)}</h3>${Object.entries(v.round.descriptions).map(([repo, text]) => `<h4>${esc(repo)}</h4><p>${esc(text)}</p>`).join("")}<h3>Validation and limits</h3><p>${esc(v.round.validation)}</p></div>${button("confirm-accept", "Accept this paired round · y", "primary")}`);
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
  if (name === "close-modal") { $("#modal-root").innerHTML = ""; return; }
  if (name === "circus-next") { loadCircus(); return; }
  if (name === "circus-share") { await api.copy(circus.permalink); toast("Permalink copied."); return; }
  if (name === "fact" || name === "next-fact") {
    if (name === "next-fact") factIndex = (factIndex + 1) % settings.facts.length;
    const fact = settings.facts[factIndex];
    modal(`<span class="tw-kicker">GENESIS, WITH FOOTNOTES</span><h1>${esc(fact.title)}</h1><p>${esc(fact.text)}</p><blockquote>${esc(fact.evidence)}</blockquote><p class="muted">${esc(fact.source)}</p>${button("next-fact", "Another footnote →", "secondary")}`); return;
  }
  if (name === "help") { modal('<h1>One hunk is enough.</h1><p>Enter: Start → Diff → Messages → acceptance preview.<br>1–6 / Tab: switch views · ←/→: hunks<br>d: full diff · f: choose a hunk · c/n: note / request changes<br>e: messages · Shift+E: patch · r: resolve<br>a: preview acceptance · y: confirm in preview · q: save & pause<br>Ctrl+S in an editor: save that field · Esc: close preview</p><p>The three-stop slider changes the amount of YHWH in the interface. At 0%, dawkins opens a real ncurses terminal with the same left / center / right layout.</p>'); return; }
  if (name === "settings") { modal(`<h1>Review assistant</h1><form id="settings-form"><label>Engine<select name="mode"><option value="codex" ${settings.mode === "codex" ? "selected" : ""}>Codex</option><option value="ollama" ${settings.mode === "ollama" ? "selected" : ""}>Ollama</option><option value="offline" ${settings.mode === "offline" ? "selected" : ""}>Scripted offline guidance</option></select></label><label>Ollama model<input name="model" value="${esc(settings.model)}"></label><p class="muted">Codex uses your installed CLI configuration, xhigh reasoning, and full access. Run codex login first.</p><button class="button primary" type="submit">Save settings</button></form>`); return; }
  if (name === "view") return go(Number(element.dataset.page));
  if (name === "note" || name === "request-change") { noteKey = name === "request-change" ? "requested change" : "comment"; await go(3); $("#review-note").focus(); if (name === "request-change") toast("Write the requested change, then choose Request changes."); return; }
  if (name === "resume-note") { noteKey = element.dataset.key; render(); $("#review-note").focus(); return; }
  if (name === "choose") { const result = await api.reviewChoose(); if (result) { v = result; page = v.screen.page || 0; Object.keys(edits).forEach(k => delete edits[k]); } return; }
  if (name === "refresh") { v = await api.reviewRead(); toast("Shared review refreshed. Your unfinished editor text is retained."); return; }
  if (name === "advance") return advance();
  if (name === "previous") { await request("previous"); return go(1); }
  if (name === "hunk") { $("#modal-root").innerHTML = ""; await request("position", { hunk: Number(element.dataset.hunk), screen: { page: 1, offset: 0, full_diff: false } }); return go(1); }
  if (name === "toggle-diff") { full = !full; return go(1); }
  if (name === "edit-patch") { page = 1; patchRepo = Object.keys(v.patches)[0]; return; }
  if (name === "close-patch") { patchRepo = null; return; }
  if (name === "save-field") { const key = element.dataset.key; const field = fieldNames.find(([label]) => label === key)?.[1]; const fallback = field ? v.round[field] : v.round.descriptions[key.replace(/ MR description$/, "")]; await request("save-field", { key, text: value(key, fallback) }); delete edits[key]; toast("Field saved."); return; }
  if (name === "save-patch") { const key = patchRepo + " patch"; await request("save-patch", { repo: patchRepo, patch: value(key, v.patches[patchRepo]) }); delete edits[key]; toast("Patch saved. Review the changed hunks and update validation."); return; }
  if (name === "comment" || name === "reject") { const text = value(noteKey); await request(name === "reject" ? "reject" : "comment", { text, draftKey: noteKey, onHunk: anchorNote }); delete edits[noteKey]; toast(name === "reject" ? "Changes requested. Revise, then resolve." : "Note saved on this hunk."); return; }
  if (name === "resolve") { await request("resolve"); toast("Changes marked addressed. Inspect the revision before accepting."); return; }
  if (name === "accept") return preview();
  if (name === "confirm-accept") { $("#modal-root").innerHTML = ""; await request("accept"); page = 0; await go(0); toast("Paired round accepted locally. The next small step is ready."); return; }
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
  const key = event.target.dataset.editor;
  if (!key) return;
  const text = event.target.value;
  edits[key] = text;
  const roundId = v.round.id;
  enqueue(async () => { if (v.round?.id !== roundId) throw new Error("The round changed; your editor text is retained."); await request("draft", { key, text }); });
});
document.addEventListener("change", event => {
  if (event.target.id === "anchor-note") anchorNote = event.target.checked;
  if (event.target.id === "patch-repo") { patchRepo = event.target.value; render(); }
  if (event.target.id === "energy") {
    const energy = Number(event.target.value);
    enqueue(() => work(async () => {
      if (energy === 0) { if (v) await request("pause"); await api.thwhTerminal(); await api.closeAfterSave(); }
      else { settings = await api.thwhSettings({ energy }); render(); if (energy === 50 && !circus) loadCircus(); }
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
    enqueue(() => work(async () => { settings = await api.thwhChat(message); $("#assistant-message").value = ""; v = await api.reviewRead(); }));
  }
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { $("#modal-root").innerHTML = ""; return; }
  if (event.target.matches("textarea,input,select")) {
    if ((event.ctrlKey || event.metaKey) && event.key === "s" && event.target.dataset.editor) {
      event.preventDefault(); const key = event.target.dataset.editor;
      enqueue(() => work(() => action(key.endsWith(" patch") ? "save-patch" : ["comment", "requested change"].includes(key) ? "comment" : "save-field", { dataset: { key } })));
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
  const offset = event.target.scrollTop;
  scrollTimer = setTimeout(() => enqueue(() => request("position", { screen: { ...v.screen, page, offset, full_diff: full } })), 250);
}, true);
api.onBeforeClose(() => enqueue(async () => { if (v) await request("pause"); await api.closeAfterSave(); }));
api.onExport(() => enqueue(async () => { const result = await api.reviewExport(); if (result) toast("Handoff exported."); }));
(async () => {
  settings = await api.thwhRead();
  try { v = await api.reviewRead(); page = v.screen.page || 0; full = v.screen.full_diff || false; }
  catch (error) { toast(error.message, true); }
  render(); if (v?.screen.offset) $(".tw-content").scrollTop = v.screen.offset;
  if (settings.energy === 50) loadCircus();
})().catch(error => toast(error.message, true));
