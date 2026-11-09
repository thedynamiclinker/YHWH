/* Presentation for the same durable session used by ./review start. */
class CodeReview {
  constructor() {
    this.view = null;
    this.error = "";
    this.section = "hunk";
    this.copyDraft = null;
    this.patchDrafts = {};
    this.commentDraft = "";
    this.onHunk = true;
    this.repo = "";
  }
  get dirty() { return Boolean(this.copyDraft || Object.keys(this.patchDrafts).length); }
  update(view) {
    if (this.view?.round?.id !== view.round?.id || this.view?.root !== view.root) {
      this.copyDraft = null;
      this.patchDrafts = {};
      this.commentDraft = "";
      this.repo = "";
    }
    this.view = view;
    this.error = "";
    if (!(this.repo in view.patches)) this.repo = Object.keys(view.patches)[0] || "";
  }
  async load() {
    try { this.update(await api.reviewRead()); }
    catch (error) { this.error = error.message; }
  }
  async request(action, input = {}) {
    const view = this.view;
    this.update(await api.reviewAct(action, {
      roundId: view?.round?.id, revision: view?.revision, ...input,
    }));
  }
  async save() {
    if (this.copyDraft) {
      const copy = structuredClone(this.copyDraft);
      await this.request("save-copy", { copy });
      this.copyDraft = null;
    }
    for (const [repo, patch] of Object.entries(this.patchDrafts)) {
      await this.request("save-patch", { repo, patch });
      delete this.patchDrafts[repo];
    }
  }
  async pending(operation) {
    busy = true;
    render();
    try { return await operation(); }
    finally { busy = false; render(); }
  }
  async perform(action, input = {}) {
    return this.pending(async () => {
      await saveVisible();
      await this.request(action, input);
    });
  }
  diff(text) {
    return `<pre>${escape(text).split("\n").map((line, index) =>
      `<span class="diff-line ${line.startsWith("+") && !line.startsWith("+++") ? "added" : line.startsWith("-") && !line.startsWith("---") ? "removed" : line.startsWith("@@") ? "range" : ""}"><i>${index + 1}</i>${line || " "}</span>`).join("")}</pre>`;
  }
  render() {
    const v = this.view, r = v?.round;
    const labels = { prepared: "Draft prepared", review: "In review", changes_requested: "Changes requested", accepted: "Accepted locally" };
    const controls = `${button("code-refresh", "Refresh", "refresh", "quiet")}${button("code-choose", "Choose workspace", "folder", "quiet")}`;
    const title = heading("ONE SMALL CHANGE AT A TIME", "Code review", "Read the patch. Tell me what’s wrong. We’ll fix it.", `<div class="code-heading-actions">${controls}</div>`);
    if (!v) return `${title}<div class="callout">${icon("folder")}<p>Open a prepared review workspace containing <code>.review/plan.json</code>. The app and <code>./review start</code> use the same saved decisions and repository branches.</p></div>${this.error ? `<p class="code-error" role="alert">${escape(this.error)}</p>` : ""}${button("code-choose", "Open review workspace", "folder", "primary")}`;
    const progress = v.rounds.filter((round) => round.status === "accepted").length;
    return `${title}
      <div class="repository-info code-root">${icon("git")}<div><b>${escape(v.root.split("/").filter(Boolean).at(-1))}</b><p>${escape(v.root)}</p></div><span class="badge local">${v.active ? "Review running" : "Paused"}</span></div>
      ${this.error ? `<p class="code-error" role="alert">${escape(this.error)}</p>` : ""}
      ${v.pending ? '<div class="callout"><p>An interrupted acceptance needs recovery. Start/resume finishes the saved transaction before continuing.</p></div>' : ""}
      <div class="code-session"><span>${progress} of ${v.rounds.length} rounds accepted locally</span><div>${r ? button(v.active ? "code-pause" : "code-start", v.active ? "Pause review" : "Start / resume review", v.active ? "clock" : "play", v.active ? "quiet" : "primary") : ""}</div></div>
      ${r ? `<div class="round-title"><h2>${escape(r.id)} · ${escape(r.title)}</h2><span class="badge ${v.status === "changes_requested" ? "changes" : "local"}">${escape(labels[v.status])}</span></div>
      <div class="tabs" role="tablist" aria-label="Code review sections">${[["hunk", "git", "One hunk"], ["diff", "layers", "Full diff"], ["copy", "messages", "Message & PR"], ["patch", "file", "Edit patch"], ["records", "book", "Record & tasks"]].map(([id, glyph, label]) => `<button role="tab" aria-selected="${this.section === id}" ${busy ? "disabled" : ""} class="${this.section === id ? "selected" : ""}" data-action="code-section" data-section="${id}">${icon(glyph)}${label}</button>`).join("")}</div>
      <div class="tab-content">${this.content(v, r)}</div>
      <div class="review-actions code-decisions"><p class="muted">Reading a hunk marks your place.<br>Accept makes a commit in each repo.</p><div>${v.status === "changes_requested" ? button("code-resolve", "Resolve & resume", "refresh", "secondary") : ""}${button("code-accept", "Accept paired round", "check", "primary", !v.active || v.status === "changes_requested" || v.pending ? "disabled" : "")}</div></div>`
      : `<div class="empty-state">${icon("check")}<h2>And the review was good.</h2><p>Every prepared round is accepted locally. The finished messages are ready for your review.</p></div>${this.records(v)}`}
      <details class="code-rounds"><summary>Review sequence · ${v.rounds.length} rounds</summary>${v.rounds.map((item) => `<div class="code-round-row"><b>${escape(item.id)}</b><span>${escape(item.title)}</span><small>${escape(labels[item.status])}</small></div>`).join("")}</details>
      <p class="muted code-shortcuts">${icon("shield")} Shared with the CLI and your agent · No external posts<br>Keys outside editors: Enter / y next · p previous · d full diff · c comment · n request changes · e message · Shift+E patch · a accept · q pause</p>`;
  }
  content(v, r) {
    if (this.section === "records") return this.records(v);
    if (this.section === "copy") {
      const copy = this.copyDraft || r;
      return `<div class="callout compact">${icon("messages")}<p>Say what changed and what you checked. This text goes in the review record.</p></div>
        ${[["title", "Round title"], ["teams", "Group Chat message"], ["mr_title", "PR title"], ["validation", "Checks"]].map(([field, label]) => `<label class="field">${label}<textarea data-review-copy="${field}" ${busy ? "disabled" : ""} rows="${field === "teams" || field === "validation" ? 4 : 2}">${escape(copy[field])}</textarea></label>`).join("")}
        ${Object.keys(r.commits).map((repo) => `<label class="field">${escape(repo)} · PR description<textarea data-review-description="${escape(repo)}" ${busy ? "disabled" : ""} rows="5">${escape(copy.descriptions[repo])}</textarea></label>`).join("")}
        ${button("code-save", "Save message & PR", "check", "secondary")}`;
    }
    if (this.section === "patch") return `<label class="field">Repository<select id="code-repo" ${busy ? "disabled" : ""}>${Object.keys(v.patches).map((repo) => `<option ${repo === this.repo ? "selected" : ""}>${escape(repo)}</option>`).join("")}</select></label>
      <label class="field">Unified diff <span>Saving preserves your draft. Acceptance checks all repository patches before moving either branch.</span><textarea id="code-patch" class="patch-editor" rows="24" spellcheck="false" ${busy ? "disabled" : ""}>${escape(this.patchDrafts[this.repo] ?? v.patches[this.repo])}</textarea></label>${button("code-save", "Save patch", "check", "secondary")}`;
    if (this.section === "diff") return Object.entries(v.patches).map(([repo, text]) => `<section class="diff-hunk"><header><span>${icon("git")} ${escape(repo)} · full diff</span></header>${this.diff(text || "No changes in this patch.")}</section>`).join("");
    const hunk = v.hunks[v.hunk];
    return `<div class="callout compact">${icon("messages")}<p><strong>Group Chat:</strong> ${escape(r.teams)}</p></div>
      <div class="patch-toolbar"><span>${icon("git")} Hunk ${hunk ? v.hunk + 1 : 0} of ${v.hunks.length}${hunk ? ` · ${escape(hunk.repo)}` : ""}</span><div>${button("code-previous", "Previous", "", "quiet", v.hunk === 0 || !v.active ? "disabled" : "")}${button("code-next", "Read · next", "arrow", "secondary", v.hunk >= v.hunks.length - 1 || !v.active ? "disabled" : "")}</div></div>
      <section class="diff-hunk"><header><span>${icon("file")} ${escape(hunk?.anchor || "This round has no patch hunks")}</span></header>${this.diff(hunk?.text || "Read the message and checks before accepting this round.")}</section>
      <div class="section-heading"><h2>Review conversation</h2><span>${v.comments.length} recorded comments</span></div>
      <div class="code-comments">${v.comments.map((note) => `<article class="feedback"><small>${escape(note.anchor || "Whole round")} · ${escape(new Date(note.at).toLocaleString())}</small><p>${escape(note.text)}</p></article>`).join("") || '<p class="muted">Give the agent a concrete observation. I save the file and hunk with your comment.</p>'}</div>
      <label class="field">Your review comment<textarea id="code-comment" rows="3" ${busy ? "disabled" : ""} placeholder="What should change here, and why?">${escape(this.commentDraft)}</textarea></label>
      <div class="code-comment-actions"><label class="checkbox-field"><input id="code-on-hunk" type="checkbox" ${this.onHunk ? "checked" : ""} ${!hunk ? "disabled" : ""}> Attach to displayed hunk</label><div>${button("code-comment", "Comment", "messages", "secondary")}${button("code-reject", "Request changes", "", "quiet")}</div></div>
      ${v.status === "changes_requested" ? '<div class="callout"><p>Changes requested. Your agent can read the shared comments, revise the patch and message, then resolve the request here or with <code>./review resolve</code>.</p></div>' : ""}`;
  }
  records(v) {
    return `<div class="section-heading"><h2>Accepted changes · ${escape(v.paths.master)}</h2>${button("code-copy-master", "Copy record", "copy", "quiet")}</div><pre class="code-document">${escape(v.master || "No rounds accepted yet.")}</pre><h2>${escape(v.paths.board)}</h2><pre class="code-document">${escape(v.board)}</pre>`;
  }
  input(target) {
    if (target.id === "code-comment") this.commentDraft = target.value;
    if (target.id === "code-on-hunk") this.onHunk = target.checked;
    if (target.id === "code-patch") this.patchDrafts[this.repo] = target.value;
    if (target.dataset.reviewCopy || target.dataset.reviewDescription) {
      if (!this.copyDraft) {
        const r = this.view.round;
        this.copyDraft = structuredClone(Object.fromEntries(["title", "teams", "mr_title", "descriptions", "validation"].map((key) => [key, r[key]])));
      }
      if (target.dataset.reviewCopy) this.copyDraft[target.dataset.reviewCopy] = target.value;
      else this.copyDraft.descriptions[target.dataset.reviewDescription] = target.value;
    }
  }
  async action(name, element) {
    if (name === "code-section") {
      await this.pending(async () => {
        await saveVisible();
        this.section = element.dataset.section;
      });
    } else if (name === "code-choose") {
      await this.pending(async () => {
        await saveVisible();
        const view = await api.reviewChoose();
        if (view) this.update(view);
      });
    } else if (name === "code-refresh") {
      // Keep local drafts visible for comparison when a CLI edit made them stale.
      await this.pending(() => this.load());
    } else if (name === "code-save") {
      await this.pending(() => saveVisible());
      toast("Review edits saved to the shared session.");
    } else if (name === "code-copy-master") {
      await api.copy(this.view.master);
      toast("Review record copied.");
    } else if (name === "code-accept") {
      await this.pending(() => saveVisible());
      const v = this.view;
      showDialog(`<span class="approval-emblem">${icon("check")}</span><h2>Accept ${escape(v.round.id)}?</h2><p>${escape(v.round.title)}</p><ul class="approval-list">${Object.keys(v.patches).map((repo) => `<li>${icon("git")} Add a local commit to ${escape(repo)}/master.</li>`).join("")}<li>${icon("check")} Record the final message and PR text in MASTER.md.</li><li>${icon("board")} Move this round to Done in Kanbun.md.</li></ul><p class="muted">This updates the selected workspace’s local master branches. All patches are checked first. Nothing is pushed or posted.</p><div class="modal-actions">${button("close-dialog", "Keep reviewing", "", "quiet")}${button("code-confirm", "Accept paired round", "check", "primary")}</div>`, "Accept paired round");
    } else if (name === "code-confirm") {
      closeDialog();
      await this.perform("accept");
      this.section = "hunk";
      render();
      toast("Paired round accepted locally. Record and tasks updated.");
    } else if (["code-comment", "code-reject"].includes(name)) {
      const text = this.commentDraft.trim();
      if (!text) throw new Error("Write a review comment first.");
      await this.perform(name === "code-reject" ? "reject" : "comment", { text, onHunk: this.onHunk });
      this.commentDraft = "";
      render();
      toast(name === "code-reject" ? "Changes requested. Revise the patch and message, then resolve." : "Comment recorded for your agent.");
    } else {
      const commands = { "code-start": "start", "code-pause": "pause", "code-next": "next", "code-previous": "previous", "code-resolve": "resolve" };
      if (commands[name]) await this.perform(commands[name]);
    }
  }
  key(event) {
    if (busy || $(".modal") || event.ctrlKey || event.metaKey || event.altKey || event.target.matches("input, textarea, select")) return;
    const key = event.key;
    if (key === "Enter" && event.target.closest("button")) return;
    if (["c", "n"].includes(key)) {
      event.preventDefault();
      this.action("code-section", { dataset: { section: "hunk" } }).then(() => $("#code-comment")?.focus()).catch(fail);
      return;
    }
    const section = { d: "diff", e: "copy", E: "patch" }[key];
    if (section) { event.preventDefault(); this.action("code-section", { dataset: { section } }).catch(fail); return; }
    const action = { y: "code-next", Enter: "code-next", p: "code-previous", q: "code-pause", a: "code-accept" }[key];
    if (!action) return;
    event.preventDefault();
    if (action === "code-accept" && (!this.view?.active || this.view.status === "changes_requested")) return;
    if (["code-next", "code-previous"].includes(action) && !this.view?.active) return;
    this.action(action, {}).catch(fail);
  }
}
