/* The renderer owns presentation. The main process owns company state and Git. */
const api = window.yhwh;
const $ = (selector) => document.querySelector(selector);
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const paths = {
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  home: "m3 10 9-7 9 7v10H3V10m6 10v-7h6v7",
  layers: "m12 3 10 5-10 5L2 8l10-5M2 12l10 5 10-5M2 16l10 5 10-5",
  messages: "M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5ZM8 9h8m-8 4h5",
  mail: "M3 5h18v14H3V5m0 1 9 7 9-7",
  git: "M7 6v9m0-6h7a4 4 0 0 0 4-4M10 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm0 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  board: "M3 4h18v16H3V4m6 0v16m6-16v16M5 8h2m4 4h2m4-4h2",
  book: "M4 3h16v18H4V3m0 14h16M8 7h8m-8 4h5",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.8M15 3.2a4 4 0 0 1 0 7.6M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  settings:
    "m12 2 2 3 3-.2.9 3.1L21 10l-1 3 1 3-3.2 2.1-.9 3.1-3-.2-2 3-2-3-3 .2-.9-3.1L3 16l1-3-1-3 3.1-2.1L7 4.8l3 .2 2-3ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  down: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  play: "m8 4 12 8-12 8V4",
  refresh:
    "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-3l1 2M4 17l1 2a8 8 0 0 0 14-3",
  copy: "M8 8h13v13H8V8m8-4V2H2v14h2",
  external: "M14 3h7v7m0-7L11 13M10 3H3v18h18v-7",
  search: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  close: "m6 6 12 12M6 18 18 6",
  file: "M14 2H4v20h16V8l-6-6v6h6M8 13h8m-8 4h6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  shield: "m12 2 8 4v6c0 5-8 10-8 10s-8-5-8-10V6l8-4m-4 10 3 3 5-6",
  spark: "m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8L12 2",
  send: "m22 2-7 20-4-9L2 9 22 2ZM22 2 11 13",
  folder: "M3 5h7l2 3h9v13H3V5",
  download: "M12 3v12m-5-5 5 5 5-5M3 16v5h18v-5",
  dot: "M12 12h.01",
};
const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/></svg>`;
let state;
let page = "home";
let proposalId;
let tab = "brief";
let busy = false;
let patchEdit = false;
let patchHunks = [];
let query = "";
let chatDraft = "";
let saveTimer;
let factVisible = true;
const codeReview = new CodeReview();
const company = () =>
  state.companies.find((c) => c.id === state.selectedCompany);
const proposal = () =>
  company()?.proposals.find((p) => p.id === proposalId) ||
  company()?.proposals.find(
    (p) => !["approved", "rejected"].includes(p.status),
  ) ||
  company()?.proposals[0];
const isClosed = (p) => ["approved", "rejected"].includes(p?.status);
const badge = (status) =>
  `<span class="badge ${status}"><i></i>${escape(state.statuses[status])}</span>`;
const button = (action, label, iconName = "", cls = "", attrs = "") =>
  `<button class="button ${cls}" data-action="${action}" ${attrs} ${busy ? "disabled" : ""}>${iconName ? icon(iconName) : ""}${label}</button>`;
const dawkins = () => state?.settings.theme === "dawkins";
const smallButton = (action, iconName, label, attrs = "") =>
  `<button class="icon-button" data-action="${action}" title="${label}" aria-label="${label}" ${attrs}>${dawkins() ? escape(({ search: "Find", settings: "Setup", refresh: "Next", close: "X" })[iconName] || label) : icon(iconName)}</button>`;

function render() {
  document.body.dataset.theme = state.settings.theme || "yhwh";
  const c = company(),
    p = proposal();
  const scroll = $(".page")?.scrollTop || 0;
  const approved = c.proposals.filter((p) => p.status === "approved").length;
  const waiting = c.proposals.filter((p) => !isClosed(p)).length;
  const reviewing = page === "review" && codeReview.view;
  $("#app").innerHTML = `<div class="shell">
    <aside class="rail"><button class="app-mark" data-action="home" aria-label="Home">${icon("sun")}</button>
      <div class="rail-tools">${smallButton("search", "search", "Find a proposal (Ctrl+K)")}${smallButton("room", "layers", "Rehearsal room")}${smallButton("board", "board", "Kanbun board")}${smallButton("master", "book", "Approved handoff")}</div>
      <div class="rail-bottom">${smallButton("facts", "spark", "Did you know?")}${smallButton("settings", "settings", "Settings")}<span class="user-avatar" title="You, the human">Y</span></div></aside>
    <aside class="sidebar"><div class="brand"><bdi class="wordmark" dir="ltr">${dawkins() ? "YHWH" : "𐤉𐤄𐤅𐤄"}</bdi><span>${dawkins() ? "COMPANY REHEARSAL" : "A LITTLE DIVINE INTERVENTION"}</span></div>
      <label class="company-switch"><span class="company-symbol">${icon("folder")}</span><span><small>COMPANY WORKSPACE</small><select id="company-select" aria-label="Company workspace">${state.companies.map((item) => `<option value="${item.id}" ${item.id === c.id ? "selected" : ""}>${escape(item.name)}</option>`).join("")}</select></span></label>
      <nav><div class="nav-label">WORKSPACE</div>${nav("home", "home", "Overview")}${nav("room", "layers", "Rehearsal room", waiting)}${nav("review", "git", "Code review")}${nav("board", "board", "Kanbun board")}${nav("master", "book", "Approved handoff", approved)}
      <div class="nav-label with-space">THE USUAL PLACES <span title="Local draft destinations">DRAFTS</span></div>${state.destinations.map((d) => nav(d.id, d.icon, d.name, c.proposals.filter((p) => !isClosed(p)).length)).join("")}
      <div class="nav-label with-space">THE COMPANY</div>${nav("company", "people", "People & context")}${nav("facts", "spark", "Did you know?")}
      <div class="branch-note">${icon("git")}<span><b>mistress</b> drafts<br><b>master</b> approved</span></div></nav>
      <div class="sidebar-bottom"><div class="local-note"><span class="online-dot"></span> Local rehearsal workspace</div>${button("new-company", "New company", "plus", "wide ghost")}${dawkins() ? button("settings", "Settings", "", "wide quiet") : ""}</div></aside>
    <section class="workspace"><header class="toolbar"><div class="breadcrumb">${icon("folder")}<span>${escape(reviewing ? reviewing.root.split("/").filter(Boolean).at(-1) : c.name)}</span><b>/</b><span>${escape(pageTitle())}</span></div><div class="toolbar-actions">${smallButton("search", "search", "Search proposals")}${button("export", "Export handoff", "download", "quiet")}</div></header>
      <div class="workspace-body"><main class="page" id="main-content">${pageContent(c, p)}</main>
        <aside class="god-panel"><div class="god-heading"><span class="god-avatar">${icon("sun")}</span><div><strong>Yahweh</strong><small><span class="online-dot"></span> ${state.settings.mode === "codex" ? "Codex · xhigh · full access" : state.settings.mode === "offline" ? "Offline rehearsal" : "Local model · " + escape(state.settings.model)}</small></div>${smallButton("settings", "settings", "Agent settings")}</div>
          <div class="god-intro"><span class="eyebrow">YOUR AGENT, NOT YOUR MANAGER</span><p>${reviewing ? `${escape(reviewing.round?.id || "All rounds accepted")} · ${escape(reviewing.round?.title || "Inspect the finished handoff")}<br>Discuss the displayed hunk and feedback.` : "The company is simulated.<br>The small improvements are real."}</p></div>
          <div class="chat-log" role="log" aria-label="Conversation with Yahweh">${c.messages.length ? c.messages.map((m) => `<div class="chat-message ${m.role}"><div class="message-author">${m.role === "assistant" ? icon("sun") : '<span class="mini-avatar">Y</span>'}<b>${m.role === "assistant" ? "Yahweh" : "You"}</b><time>${new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></div><p>${escape(m.content)}</p></div>`).join("") : `<div class="chat-message assistant"><div class="message-author">${icon("sun")}<b>Yahweh</b></div><p>Where are you? Ah. ${escape(c.name)}. Give me the situation. I will come down and have a look.</p></div>`}${busy ? '<div class="thinking"><i></i> Coming down to inspect the thing…</div>' : ""}</div>
          <div class="chat-bottom"><div class="chat-suggestions">${button("chat-scope", "Make it smaller", "", "chip")}${button("chat-evidence", "What needs evidence?", "", "chip")}</div><form id="chat-form"><textarea id="chat-input" aria-label="Message Yahweh" placeholder="Give Yahweh the situation…" rows="2" ${busy ? "disabled" : ""}>${escape(chatDraft)}</textarea><div class="composer-bottom"><span>${icon("shield")} ${state.settings.mode === "codex" ? "Codex · full access" : "Stays in this workspace"}</span><button class="send-button" aria-label="Send message" ${busy ? "disabled" : ""}>${dawkins() ? "Send" : icon("arrow")}</button></div></form><p class="chat-disclaimer">${state.settings.mode === "offline" ? "Scripted demo · Choose Codex or Ollama in Settings." : "AI rehearsal · People’s reactions are imagined."}</p></div></aside>
      </div><footer class="statusbar"><span><span class="online-dot"></span> ${busy ? "Working…" : codeReview.dirty ? "Unsaved review edits" : "All changes saved locally"}</span><span>${reviewing ? `${reviewing.rounds.length} rounds <i>·</i> ${reviewing.rounds.filter((item) => item.status === "accepted").length} accepted` : `${c.proposals.length} proposals <i>·</i> ${approved} approved`} <i>·</i> ${state.settings.mode === "codex" ? "Codex · full access" : "Nothing posted externally"} ${icon("shield")}</span></footer>
    </section></div>`;
  $(".page").scrollTop = scroll;
  const log = $(".chat-log");
  log.scrollTop = log.scrollHeight;
}
function nav(action, iconName, label, count) {
  return `<button class="nav-item ${page === action ? "active" : ""}" data-action="${action}">${icon(iconName)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ""}</button>`;
}
function pageTitle() {
  return (
    {
      home: "Overview",
      room: "Rehearsal room",
      review: "Code review",
      board: "Kanbun board",
      master: "Approved handoff",
      company: "People & context",
      chat: "Group Chat",
      mail: "Electronic Mail",
      forge: "Code Place",
    }[page] || "Workspace"
  );
}
function heading(kicker, title, description, actions = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>${actions}</div>`;
}
function factCard() {
  const fact = state.facts[state.factIndex];
  return factVisible
    ? `<div class="fact-card"><div class="fact-star">${icon("spark")}</div><div><span class="eyebrow">DID YOU KNOW? <span>FROM WE THE NAMELESS</span></span><h3>${escape(fact.title)}</h3><p>${escape(fact.text)}</p><small>${escape(fact.source)}</small></div><div class="fact-actions">${smallButton("next-fact", "refresh", "Another fact")}${smallButton("hide-fact", "close", "Dismiss fact")}</div></div>`
    : "";
}
function pageContent(c, p) {
  if (page === "home") return home(c, p);
  if (page === "room") return room(c, p);
  if (page === "review") return codeReview.render();
  if (["chat", "mail", "forge"].includes(page)) return destination(c, p);
  if (page === "board") return board(c);
  if (page === "company") return people(c);
  if (page === "master") return master(c);
  return "";
}
function home(c, p) {
  const active = c.proposals.filter((p) => !isClosed(p));
  const approved = c.proposals.filter((p) => p.status === "approved");
  return `${heading("WELCOME TO YHWH", "Learn by doing one small task.", "YHWH helps you review a change, hear simulated colleagues’ concerns, and prepare a handoff you can approve.")}
  ${walkthrough()}
  <div class="section-heading"><h2>Your next small step</h2><span>${active.length} waiting in the wings</span></div>
  ${active.length ? `<article class="next-step"><div class="next-step-top"><span class="round-number">ROUND ${String(c.proposals.indexOf(active[0]) + 1).padStart(2, "0")}</span>${badge(active[0].status)}</div><h2>${escape(active[0].title)}</h2><p>${escape(active[0].summary)}</p><div class="workflow-line"><span class="current">1 <b>Propose</b></span><i></i><span>2 <b>Rehearse</b></span><i></i><span>3 <b>Refine</b></span><i></i><span>4 <b>Approve</b></span></div><div class="next-step-bottom"><span>${icon("git")}${active[0].repoId ? "Real patch · isolated repository" : "Communication proposal"} <b>·</b> ${c.people.length} company voices</span>${button("open-proposal", "Enter the rehearsal", "arrow", "primary", `data-id="${active[0].id}"`)}</div></article>` : `<div class="empty-state">${icon("check")}<h2>${c.proposals.length ? "And the review was good." : "Every company starts somewhere."}</h2><p>${c.proposals.length ? "Your remaining proposals are approved or set aside. Add the next small improvement." : "Add a proposal or import a local repository to begin."}</p>${button("new-proposal", "New proposal", "plus", "primary")}</div>`}
  <div class="section-heading"><h2>The usual places</h2><span>Drafts, ready for your judgment</span></div>
  <div class="destinations">${state.destinations.map((d) => `<button class="destination-card ${d.id}" data-action="${d.id}"><span class="destination-icon">${icon(d.icon)}</span><h3>${d.name}${icon("arrow")}</h3><p>${d.slogan}</p><span class="destination-count">${active.length} suggested ${active.length === 1 ? "draft" : "drafts"} <i></i></span></button>`).join("")}</div>
  <section aria-label="Character tips" ${dawkins() ? "hidden" : ""}><div class="section-heading"><h2>Did you know?</h2>${button("facts", "Browse tips", "spark", "text-button")}</div>${factCard()}</section>
  <div class="section-heading"><h2>A company, one improvement at a time</h2>${button("new-proposal", "Add proposal", "plus", "text-button")}</div>
  <div class="proposal-list">${
    c.proposals
      .slice(0, 6)
      .map(
        (p, index) =>
          `<button class="proposal-row" data-action="open-proposal" data-id="${p.id}"><span class="row-number">${String(index + 1).padStart(2, "0")}</span><div><strong>${escape(p.title)}</strong><small>${p.repoId ? "Code Place" : "Company proposal"} <b>·</b> ${p.rehearsals.length} ${p.rehearsals.length === 1 ? "rehearsal" : "rehearsals"}</small></div>${badge(p.status)}${icon("arrow")}</button>`,
      )
      .join("") ||
    '<p class="muted padded">The next useful idea belongs here.</p>'
  }</div>
  <div class="home-footnote">${icon("shield")} A rehearsal room, with a door to the real world. You decide what leaves.</div>`;
}
function sampleTask() {
  for (const c of state.companies) {
    const repo = c.repositories.find((r) => r.source === "Built-in example");
    const p = repo && c.proposals.find((p) => p.repoId === repo.id);
    if (p) return { company: c, proposal: p };
  }
}
function walkthrough() {
  const sample = sampleTask();
  if (!sample) return "";
  const p = sample.proposal;
  const steps = [
    ["Inspect the sample change", "Open The proposal, then The patch. The first change removes the exact requests and rich version pins in requirements.txt. Keep Include checked.", "room", "brief", false],
    ["Record what you checked", "Return to The proposal. In Verification evidence, describe the patch you read and say that runtime comparisons are still pending.", "room", "brief", !!p.evidence],
    ["Hear the company and respond", "Click Rehearse company. Read the three reactions in The company, add your feedback, then click Revise the handoff.", "room", "company", !!(p.rehearsals.length && p.feedback.length && p.revisions.length)],
    ["Review the sample email and drafts", "Open Electronic Mail in the left sidebar. Check its subject, evidence, and review clarification. Review Group Chat and Code Place too; you can edit all three drafts.", "mail", "brief", false],
    ["Approve and find the result", "Return to The handoff in the Rehearsal room. Click Approve round and confirm. Find the saved messages in Approved handoff and the round in Kanbun’s Approved column.", "room", "drafts", p.status === "approved"],
  ];
  return `<section class="walkthrough" aria-label="Sample walkthrough"><div class="walkthrough-label">${icon("play")} HANDS-ON WALKTHROUGH <span>Sample data only</span></div>
    <h2>Approve your first sample handoff</h2><p>Use <strong>${escape(sample.company.name)}</strong> to review “${escape(p.title)}” and finish with an approved email, team update, and code review description.</p>
    <p class="walkthrough-orientation">Start here in <strong>Overview</strong>. The left sidebar opens your workspace and sample apps. The middle panel is where you review and edit. Yahweh’s conversation is on the right. Return to Overview whenever you need this guide.</p>
    <div class="walkthrough-start">${button("walkthrough", p.status === "approved" ? "View completed handoff" : p.rehearsals.length || p.evidence ? "Continue offline walkthrough" : "Start offline walkthrough", "arrow", "primary")}<small>Starting selects Offline rehearsal in Settings. No model, sign-in, or real account connection is needed.</small></div>
    <ol class="walkthrough-steps">${steps.map(([title, description, target, section, done], index) => `<li><span class="walkthrough-number">${index + 1}</span><div><h3>${escape(title)}${done ? `<span class="walkthrough-recorded">${icon("check")} Saved</span>` : ""}</h3><p>${escape(description)}</p>${button("walkthrough", `Open step ${index + 1}`, "arrow", "text-button", `data-page="${target}" data-tab="${section}"`)}</div></li>`).join("")}</ol>
    <div class="walkthrough-result">${icon("check")}<p><strong>Success looks like:</strong> this round is Approved, its three final messages appear in Approved handoff, and the sample patch has a local approval commit. Runtime checks remain pending. Nothing is sent.</p></div>
    <p class="walkthrough-note">Electronic Mail is a local sample draft surface; this demo has no email account or inbox. Keep this task in the sample apps. Real account connections can wait.</p>
    ${p.status === "approved" ? `<p class="walkthrough-complete">${icon("check")} Sample handoff approved and saved. You can revisit it with the button above.</p>` : ""}</section>`;
}
function walkthroughHint(c, p) {
  const sample = sampleTask();
  if (!sample || c.id !== sample.company.id || p?.id !== sample.proposal.id) return "";
  let instruction;
  let next = "";
  if (p.status === "approved") {
    instruction = "Sample task complete: the final messages and local approval commit are saved. Open Approved handoff to read all three messages, then Kanbun board to find this round in Approved. Nothing has been sent.";
    next = button("master", "View approved handoff", "arrow", "quiet");
  } else if (p.status === "rejected") {
    instruction = "This sample round is set aside. Click Reopen round below to continue the walkthrough.";
  } else if (page === "room" && tab === "brief") {
    instruction = "Read the title and summary below, then click The patch. After inspecting it, return here and enter this in Verification evidence: “Reviewed requirements.txt: exact requests and rich version pins are removed. Runtime comparisons are still pending.” Then click Rehearse company below.";
  } else if (page === "room" && tab === "patch") {
    instruction = "The red lines remove requests==2.32.3 and rich==13.9.4; the green lines keep the package names without exact versions. Leave Include checked. Next click The proposal and record what you inspected in Verification evidence. This patch review does not establish runtime compatibility.";
  } else if (page === "room" && tab === "company") {
    instruction = p.rehearsals.length
      ? "Read Alex, Morgan, and Casey’s reactions below. In Review feedback, enter “Keep this to the dependency pins; runtime comparisons are still pending.” Leave Respond as set to Yourself, click Add feedback, then Revise the handoff. You should see three revised drafts."
      : "Click Run first rehearsal below. In Offline rehearsal, three scripted company reactions appear without needing an account. Then add your own feedback and revise the handoff.";
  } else if (page === "mail") {
    instruction = "This is your sample email draft. Check the Subject, Evidence supplied for review, and Review clarification. It should say runtime comparisons are still pending. Edit the text if needed; edits save locally. Review Group Chat and Code Place from the left sidebar, then return to The handoff to approve.";
    next = button("walkthrough", "Review all drafts & approve", "arrow", "quiet", 'data-page="room" data-tab="drafts"');
  } else if (page === "room" && tab === "drafts") {
    instruction = "Read the Group Chat, Electronic Mail, and Code Place drafts below. Check that your feedback and pending verification are represented accurately. You can edit each draft. Then click Approve round at the bottom and confirm the local sample approval.";
    next = button("walkthrough", "Open sample email", "mail", "quiet", 'data-page="mail"');
  } else if (["chat", "forge"].includes(page)) {
    instruction = "Review this sample draft and edit it if needed. Code Place describes the change, verification, and rollback; Group Chat is the short team update. Return to The handoff to review all three drafts and approve the sample round.";
    next = button("walkthrough", "Return to The handoff", "arrow", "quiet", 'data-page="room" data-tab="drafts"');
  }
  if (!instruction) return "";
  return `<aside class="walkthrough-hint" aria-label="Walkthrough guidance"><strong>${icon("play")} SAMPLE WALKTHROUGH</strong><p>${escape(instruction)}</p>${state.settings.mode !== "offline" && !isClosed(p) ? `<p>Choose <strong>Start offline walkthrough</strong> in Overview to use scripted reactions without a model.</p>${button("walkthrough", "Use offline walkthrough", "play", "quiet")}` : ""}${next}</aside>`;
}
function proposalPicker(c, p) {
  return `<div class="proposal-picker"><label for="proposal-select">CURRENT PROPOSAL</label><select id="proposal-select">${c.proposals.map((item, index) => `<option value="${item.id}" ${item.id === p?.id ? "selected" : ""}>${String(index + 1).padStart(2, "0")} · ${escape(item.title)}</option>`).join("")}</select>${button("new-proposal", "New", "plus", "quiet")}${button("import", "Import Git", "git", "quiet")}</div>`;
}
function room(c, p) {
  if (!p)
    return `${heading("A SMALL BEGINNING", "Rehearsal room", "Give the company something concrete to react to.")}${emptyStart()}`;
  const closed = isClosed(p);
  return `${heading(`ROUND ${String(c.proposals.indexOf(p) + 1).padStart(2, "0")} · ${escape(state.statuses[p.status]).toUpperCase()}`, "The rehearsal room", "A proposal. A few objections. A better way to say it.")}
 ${walkthroughHint(c, p)}${proposalPicker(c, p)}<div class="round-title"><h2>${escape(p.title)}</h2>${badge(p.status)}</div>
 <div class="tabs" role="tablist" aria-label="Review sections">${[
   ["brief", "file", "The proposal"],
   ["patch", "git", "The patch"],
   ["company", "people", "The company"],
   ["drafts", "messages", "The handoff"],
 ]
   .map(
     ([id, name, label]) =>
       `<button role="tab" aria-selected="${tab === id}" class="${tab === id ? "selected" : ""}" data-action="tab" data-tab="${id}">${icon(name)}${label}${id === "company" && p.rehearsals.length ? `<span>${p.rehearsals.length}</span>` : ""}</button>`,
   )
   .join("")}</div>
 <div class="tab-content">${tab === "brief" ? brief(c, p) : tab === "patch" ? patch(p) : tab === "company" ? reactions(c, p) : handoff(p)}</div>
 <div class="review-actions"><div>${closed ? `<span class="muted">${p.status === "approved" ? "Final packet recorded · " + escape(p.approvedCommit?.slice(0, 8) || "communication only") : "Set aside for now"}</span>` : button("reject", "Set aside", "", "quiet")}${p.status === "rejected" ? button("reopen", "Reopen round", "refresh", "quiet") : ""}</div><div>${closed ? "" : `${button("rehearse", "Rehearse company", "play", "secondary")}${button("approve", "Approve round", "check", "primary")}`}</div></div>`;
}
function brief(c, p) {
  const closed = isClosed(p),
    repo = c.repositories.find((r) => r.id === p.repoId);
  return `<div class="callout">${icon("sun")}<p><strong>“Let me come down and see.”</strong> Give the company an observable change. Put the evidence beside it. We can negotiate the rest.</p></div>
 <label class="field">Proposal title<input data-field="title" value="${escape(p.title)}" ${closed ? "readonly" : ""}></label>
 <label class="field">What changes, and why?<textarea rows="5" data-field="summary" ${closed ? "readonly" : ""}>${escape(p.summary)}</textarea></label>
 <label class="field">Verification evidence <span>Commands, results, or remaining gaps. Plans are not results.</span><textarea rows="4" data-field="evidence" placeholder="Not yet verified. What would establish that this change works?" ${closed ? "readonly" : ""}>${escape(p.evidence)}</textarea></label>
 <div class="repository-info">${icon("git")}<div><b>${escape(repo?.name || "Communication-only proposal")}</b><p>${repo ? `Draft: <code>mistress</code> → approved: <code>master</code><br>Source commit: <code>${escape(p.sourceCommit?.slice(0, 12))}</code>` : "No code changes are attached to this round."}</p></div>${repo ? '<span class="badge local">Isolated copy</span>' : ""}</div>
 ${p.dependency ? `<p class="muted dependency">${icon("layers")} Follows “${escape(c.proposals.find((x) => x.id === p.dependency)?.title)}”. Approve that round first.</p>` : ""}`;
}
function patch(p) {
  if (!p.patch)
    return `<div class="empty-state">${icon("messages")}<h2>Words are the change this time.</h2><p>This proposal has no attached patch. Import a local Git repository to rehearse code changes.</p>${button("import", "Import a repository", "git", "secondary")}</div>`;
  const closed = isClosed(p);
  return `<div class="patch-toolbar"><span>${icon("git")} ${patchHunks.length} reviewable ${patchHunks.length === 1 ? "hunk" : "hunks"} <b>·</b> ${p.excludedHunks.length} excluded</span>${closed ? "" : button("toggle-patch", patchEdit ? "View hunks" : "Edit patch", patchEdit ? "layers" : "file", "quiet")}</div>
 ${
   patchEdit && !closed
     ? `<label class="field">Unified diff <span>Edits are checked with git apply before any approval commit.</span><textarea class="patch-editor" data-field="patch" rows="22" spellcheck="false">${escape(p.patch)}</textarea></label>`
     : patchHunks
         .map(
           (h) =>
             `<section class="diff-hunk ${p.excludedHunks.includes(h.id) ? "excluded" : ""}"><header><span>${icon("file")} ${escape(h.label)}</span><label><input type="checkbox" data-hunk="${h.id}" ${p.excludedHunks.includes(h.id) ? "" : "checked"} ${closed ? "disabled" : ""}> Include</label></header><pre>${escape(
               h.whole ? h.text : h.header + h.text,
             )
               .split("\n")
               .map(
                 (line, index) =>
                   `<span class="diff-line ${line.startsWith("+") && !line.startsWith("+++") ? "added" : line.startsWith("-") && !line.startsWith("---") ? "removed" : line.startsWith("@@") ? "range" : ""}"><i>${index + 1}</i>${line || " "}</span>`,
               )
               .join("")}</pre></section>`,
         )
         .join("")
 }
 <p class="muted">Approving applies only the included hunks in the local rehearsal copy. Dependent patches may need editing after a partial approval. Binary changes are reviewed as a whole file.</p>`;
}
function reactions(c, p) {
  return `<div class="section-heading"><div><h2>Let the humans object.</h2><p class="muted">Simulated roles, with the concerns you gave them.</p></div>${!isClosed(p) ? button("rehearse", p.rehearsals.length ? "Rehearse again" : "Run first rehearsal", "play", "secondary") : ""}</div>
 ${
   !p.rehearsals.length
     ? `<div class="cast-preview">${c.people.map((person, index) => `<div class="person-preview"><span class="person-avatar color-${index % 3}">${escape(person.name[0])}</span><div><b>${escape(person.name)}</b><small>${escape(person.role)}</small><p>${escape(person.concern)}</p></div></div>`).join("")}</div>`
     : p.rehearsals
         .slice()
         .reverse()
         .map(
           (round) =>
             `<div class="rehearsal"><div class="rehearsal-label">REHEARSAL ${round.round}<span>${round.mode === "codex" ? "Codex simulation" : round.mode === "offline" ? "Scripted simulation" : "Local model simulation"} · ${new Date(round.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></div>${round.reactions.map((r, index) => `<article class="reaction"><span class="person-avatar color-${index % 3}">${escape(r.name[0])}</span><div><div class="reaction-heading"><b>${escape(r.name)}</b><span>${escape(r.role)}</span><em class="${r.verdict}">${r.verdict === "support" ? "Ready to review" : "Has a concern"}</em></div><p>${escape(r.content)}</p></div></article>`).join("")}</div>`,
         )
         .join("")
 }
 <div class="feedback-section"><div class="section-heading"><h2>You play the company, too.</h2></div>${p.feedback.map((f) => `<div class="feedback"><b>${escape(f.author)}</b><p>${escape(f.content)}</p></div>`).join("")}${!isClosed(p) ? `<form id="feedback-form"><label class="field">Respond as<select name="personId"><option value="">Yourself</option>${c.people.map((person) => `<option value="${person.id}">${escape(person.name)} · ${escape(person.role)}</option>`).join("")}</select></label><label class="field">Review feedback<textarea name="content" rows="3" placeholder="What would this person actually ask? What needs to change?" required></textarea></label><div class="form-actions">${button("revise", "Revise the handoff", "refresh", "secondary")}<button class="button primary" ${busy ? "disabled" : ""}>${icon("plus")} Add feedback</button></div></form>` : ""}</div>`;
}
function handoff(p) {
  return `<div class="section-heading"><div><h2>What you’ll actually share.</h2><p class="muted">Edit each draft. Copy it when you’re ready.</p></div>${!isClosed(p) ? button("revise", "Revise from feedback", "refresh", "quiet") : ""}</div>${state.destinations.map((d) => draftEditor(p, d)).join("")}`;
}
function draftEditor(p, d) {
  return `<section class="draft-editor"><header><div><span class="destination-icon ${d.id}">${icon(d.icon)}</span><div><h3>${d.name}</h3><small>${d.description}</small></div></div>${button("copy-draft", "Copy draft", "copy", "quiet", `data-destination="${d.id}"`)}</header><textarea data-draft="${d.id}" rows="${d.id === "chat" ? 5 : 12}" aria-label="${d.name} draft" ${isClosed(p) ? "readonly" : ""}>${escape((p.final || p.drafts)[d.id])}</textarea><footer><span class="draft-indicator"></span> ${p.status === "approved" ? "Approved packet" : "Suggested by Yahweh"} <span>Local draft · You choose where to post</span></footer></section>`;
}
function destination(c, p) {
  const d = state.destinations.find((d) => d.id === page);
  return `${heading("THE USUAL PLACES", d.name, d.slogan)}${walkthroughHint(c, p)}<div class="callout compact">${icon("shield")}<p>Suggestions for your ${d.id === "chat" ? "team conversation" : d.id === "mail" ? "email app" : "work repository"}. Copy and post them yourself after review.</p></div>${p ? `${proposalPicker(c, p)}${badge(p.status)}<div class="spacer"></div>${draftEditor(p, d)}${button("open-proposal", "Back to the full round", "arrow", "secondary", `data-id="${p.id}"`)}` : emptyStart()}`;
}
function board(c) {
  const columns = ["draft", "review", "changes", "approved", "rejected"];
  return `${heading("KANBUN, NATURALLY", "Good work has somewhere to go.", "Round cards follow review decisions. Drag independent tasks between columns.", button("new-task", "Add task", "plus", "secondary"))}<div class="board">${columns
    .map((status) => {
      const items = [
        ...c.proposals.map((p) => ({ ...p, isProposal: true })),
        ...c.tasks,
      ].filter((p) => p.status === status);
      return `<section class="board-column" data-drop="${status}"><header><span class="column-dot ${status}"></span>${state.statuses[status]}<b>${items.length}</b></header>${items.map((p) => `<article class="board-card" ${!p.isProposal ? 'draggable="true"' : ""} data-task="${p.id}"><span class="eyebrow">${p.isProposal ? "ROUND " + String(c.proposals.findIndex((x) => x.id === p.id) + 1).padStart(2, "0") : "INDEPENDENT TASK"}</span><h3>${escape(p.title)}</h3>${p.isProposal ? `<p>${escape(p.summary.slice(0, 120))}</p><button class="card-link" data-action="open-proposal" data-id="${p.id}">${icon(p.repoId ? "git" : "messages")} Open round ${icon("arrow")}</button>` : `<select class="task-status" data-task-id="${p.id}" aria-label="Move ${escape(p.title)}">${["draft", "review", "approved"].map((s) => `<option value="${s}" ${s === status ? "selected" : ""}>${state.statuses[s]}</option>`).join("")}</select>`}</article>`).join("")}<div class="board-placeholder">${status === "draft" ? "The next useful thing." : status === "approved" ? "A little less chaos." : ""}</div></section>`;
    })
    .join("")}</div>`;
}
function people(c) {
  return `${heading("THE PEOPLE IN THE ROOM", "A company is made of people.", "Give each person a concern worth taking seriously.")}<form id="company-form"><label class="field">Company name<input name="name" value="${escape(c.name)}" required maxlength="120"></label><label class="field">What are you trying to change?<textarea rows="3" name="goal" required>${escape(c.goal)}</textarea></label><label class="field">Context the simulation should know<textarea rows="6" name="context" placeholder="Existing workflow, constraints, interpersonal context, evidence…">${escape(c.context)}</textarea></label><div class="section-heading"><h2>The company voices</h2>${button("add-person", "Add person", "plus", "quiet")}</div><div id="people-fields">${c.people.map((p, i) => personFields(p, i)).join("")}</div><div class="form-actions"><span class="muted">Imagined reactions, never claims about real people.</span><button class="button primary">${icon("check")} Save company</button></div></form><div class="section-heading"><h2>Rehearsal repositories</h2>${button("import", "Import Git range", "git", "quiet")}</div>${c.repositories.map((r) => `<div class="repository-info">${icon("git")}<div><b>${escape(r.name)}</b><p>${escape(r.source)}<br><code>${escape(r.base)}..${escape(r.draft)}</code> → local <code>mistress / master</code></p></div><span class="badge local">Isolated copy</span></div>`).join("") || '<p class="muted">No repository is attached. Communication proposals work on their own.</p>'}`;
}
function personFields(p, index) {
  return `<div class="person-fields" data-person="${escape(p.id || "")}"><span class="person-avatar color-${index % 3}">${index + 1}</span><div><div class="field-row"><label class="field">Name<input data-person-field="name" value="${escape(p.name)}" required></label><label class="field">Role<input data-person-field="role" value="${escape(p.role)}" required></label></div><label class="field">What matters to this person?<textarea data-person-field="concern" rows="2" required>${escape(p.concern)}</textarea></label></div>${smallButton("remove-person", "close", "Remove person")}</div>`;
}
function master(c) {
  const approved = c.proposals.filter((p) => p.status === "approved");
  return `${heading("ONLY WHAT SURVIVED REVIEW", "The approved handoff.", "Final messages and change descriptions. The rehearsal stays backstage.", button("export", "Export MASTER.md", "download", "primary"))}${approved.length ? approved.map((p) => `<article class="final-packet"><div class="section-heading"><h2>${escape(p.title)}</h2>${badge("approved")}</div><p class="muted">${new Date(p.approvedAt).toLocaleString()} ${p.approvedCommit ? "· Commit " + escape(p.approvedCommit.slice(0, 12)) : ""}</p>${state.destinations.map((d) => `<div class="final-draft"><h3>${icon(d.icon)}${d.name}${button("copy-final", "Copy", "copy", "quiet", `data-id="${p.id}" data-destination="${d.id}"`)}</h3><p>${escape(p.final[d.id])}</p></div>`).join("")}</article>`).join("") : `<div class="empty-state">${icon("book")}<h2>No commandments yet.</h2><p>Approve a rehearsed round and its final messages will appear here. Export creates MASTER.md, Kanbun.md, a company snapshot, and approved patches.</p>${button("room", "Go to the rehearsal", "arrow", "secondary")}</div>`}`;
}
function emptyStart() {
  return `<div class="empty-state">${icon("layers")}<h2>Let there be a proposal.</h2><p>Start with one small improvement, or turn an existing local Git range into review rounds.</p><div>${button("new-proposal", "New proposal", "plus", "primary")}${button("import", "Import Git", "git", "secondary")}</div></div>`;
}

async function saveVisible() {
  clearTimeout(saveTimer);
  if (!state) return;
  if (page === "review") {
    await codeReview.save();
    return;
  }
  const p = proposal();
  if (!p || isClosed(p)) return;
  const input = { companyId: company().id, proposalId: p.id };
  let changed = false;
  document.querySelectorAll("[data-field]").forEach((el) => {
    const field = el.dataset.field;
    if (el.value !== p[field]) {
      input[field] = el.value;
      changed = true;
    }
  });
  const draftChanges = {};
  document.querySelectorAll("[data-draft]").forEach((el) => {
    const field = el.dataset.draft;
    if (el.value !== p.drafts[field]) {
      draftChanges[field] = el.value;
      changed = true;
    }
  });
  if (Object.keys(draftChanges).length) input.drafts = draftChanges;
  if (changed) {
    saveStatus("Saving editor…");
    state = await api.act("editProposal", input);
    saveStatus("All changes saved locally");
  }
}
function saveStatus(message) {
  const status = $(".statusbar > span:first-child");
  if (status)
    status.innerHTML = `<span class="online-dot"></span> ${escape(message)}`;
}
async function run(action, input = {}, opts = {}) {
  if (busy) return;
  await saveVisible();
  busy = true;
  render();
  try {
    state = await api.act(action, {
      companyId: company().id,
      proposalId: proposal()?.id,
      ...input,
    });
    if (opts.page) page = opts.page;
    if (opts.tab) tab = opts.tab;
    if (action === "createProposal") proposalId = company().proposals.at(-1).id;
    await refreshHunks();
  } finally {
    busy = false;
    render();
  }
}
async function refreshHunks() {
  patchHunks = proposal()?.patch ? await api.hunks(proposal().patch) : [];
}
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = `visible ${error ? "error" : ""}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ""), error ? 12000 : 4500);
}
function fail(error) {
  toast(
    error.message.replace(/^Error invoking remote method '[^']+': Error: /, ""),
    true,
  );
}
function showDialog(content, title, wide = false) {
  $("#modal-root").innerHTML =
    `<dialog class="modal ${wide ? "wide-modal" : ""}" aria-label="${escape(title)}"><div class="modal-header"><span class="eyebrow">𐤉𐤄𐤅𐤄 · ${escape(title).toUpperCase()}</span>${smallButton("close-dialog", "close", "Close dialog")}</div>${content}</dialog>`;
  $(".modal").showModal();
}
function closeDialog() {
  const dialog = $(".modal");
  if (dialog) {
    dialog.close();
    $("#modal-root").innerHTML = "";
  }
}
function showFacts() {
  const fact = state.facts[state.factIndex];
  showDialog(
    `<div class="startup-fact"><span class="fact-emblem">${icon("sun")}</span><div class="eyebrow">DID YOU KNOW?</div><h2>${escape(fact.title)}</h2><p>${escape(fact.text)}</p><blockquote>“${escape(fact.evidence)}”</blockquote><small>We The Nameless · ${escape(fact.source)}<br>A fact about the literary character, with a workplace interpretation.</small></div><div class="modal-actions fact-dialog-actions">${button("fact-dialog-next", "Another fact", "refresh", "quiet")}${button("disable-facts", "Don’t show this again", "", "quiet")}${button("close-dialog", "Let there be work", "arrow", "primary")}</div>`,
    "A small revelation",
  );
}
function showSettings() {
  showDialog(
    `<h2>${dawkins() ? "Preferences" : "Divine preferences."}</h2><p class="muted">Codex is the default for conversation, company reviews, and handoff revisions. Ollama and the scripted offline rehearsal remain available.</p><form id="settings-form"><label class="field">Interface<select name="theme"><option value="yhwh" ${!dawkins() ? "selected" : ""}>YHWH</option><option value="dawkins" ${dawkins() ? "selected" : ""}>dawkins · DOS / TTY</option></select></label><label class="field">Rehearsal engine<select name="mode"><option value="codex" ${state.settings.mode === "codex" ? "selected" : ""}>Codex · xhigh thinking · full access</option><option value="ollama" ${state.settings.mode === "ollama" ? "selected" : ""}>Local model · Ollama</option><option value="offline" ${state.settings.mode === "offline" ? "selected" : ""}>Offline rehearsal · scripted, no model needed</option></select></label><div data-engine="codex" ${state.settings.mode === "codex" ? "" : "hidden"}><div class="setup-note">Uses your installed Codex CLI, configured model, and sign-in.<br>Run <code>codex login</code> in a terminal first.<br>Matches <code>lordhavemercy -f</code>: xhigh reasoning, full filesystem and network access, no approval prompts.<br>Chat can carry out requested work in the selected review workspace or proposal’s rehearsal repository.</div></div><div data-engine="ollama" ${state.settings.mode === "ollama" ? "" : "hidden"}><label class="field">Ollama model name<input name="model" value="${escape(state.settings.model)}" required></label><div class="setup-note">Local endpoint: <code>127.0.0.1:11434</code><br>Start Ollama, then run <code>ollama pull ${escape(state.settings.model)}</code>.<br>Chat, company reviews, and handoff revisions use this model.</div></div><label class="checkbox-field"><input name="showFacts" type="checkbox" ${state.settings.showFacts ? "checked" : ""}> Show “Did you know?” when the app opens</label><div class="form-actions">${button("open-folder", "Open data folder", "folder", "quiet")}<button class="button primary">Save preferences</button></div></form>`,
    "Settings",
  );
}
function showNewCompany() {
  showDialog(
    `<h2>A new corner of creation.</h2><p class="muted">Any company. One concrete goal. You can edit the people next.</p><form id="new-company-form"><label class="field">Company name<input name="name" placeholder="The Actual Company" required maxlength="120" autofocus></label><label class="field">What should get better?<textarea name="goal" placeholder="Make useful work easier to review and share." required rows="3"></textarea></label><label class="field">Context<textarea name="context" rows="4" placeholder="The situation, the constraints, and what the team needs…"></textarea></label><div class="form-actions"><button class="button primary">${icon("plus")} Create workspace</button></div></form>`,
    "New company",
  );
}
function showNewProposal() {
  showDialog(
    `<h2>One useful thing.</h2><p class="muted">A communication-only proposal to start. Import Git for proposals with real patches.</p><form id="new-proposal-form"><label class="field">Proposal title<input name="title" placeholder="Document the one-command setup" required maxlength="200"></label><label class="field">What changes, and why?<textarea name="summary" rows="6" placeholder="What gets better? What is deliberately kept small?" required></textarea></label><div class="form-actions"><button class="button primary">${icon("plus")} Add proposal</button></div></form>`,
    "New proposal",
  );
}
function showImport() {
  showDialog(
    `<h2>Bring the work you already did.</h2><p class="muted">Choose a local Git repository after entering the references. Each non-merge commit becomes a round, in order. We clone it into this workspace and prepare <code>mistress</code> and <code>master</code>.</p><form id="import-form"><div class="field-row"><label class="field">Base reference<input name="base" value="main" required></label><label class="field">Draft reference<input name="draft" value="HEAD" required></label></div><div class="callout compact">${icon("shield")}<p>Your source branches, working files, index, and hooks are preserved. Rehearsal commits live in a separate copy.</p></div><p class="muted">Committed changes only · up to 100 commits · base must be an ancestor of draft. Repeat to add another repository.</p><div class="form-actions"><button class="button primary">${icon("folder")} Choose repository</button></div></form>`,
    "Import work",
  );
}
function showApprove() {
  const p = proposal();
  showDialog(
    `<span class="approval-emblem">${icon("check")}</span><h2>Make this round a keeper.</h2><p>${escape(p.title)}</p><ul class="approval-list"><li>${icon("check")} Record the three final handoff drafts.</li><li>${icon("check")} Move this round to Approved on Kanbun.</li><li>${icon("git")} ${p.repoId ? "Apply included hunks and commit on the isolated master branch." : "Save a communication-only approval."}</li></ul><p class="muted">No external messages are sent. No source repository is changed.</p><div class="modal-actions">${button("close-dialog", "Keep reviewing", "", "quiet")}${button("confirm-approve", "Approve round", "check", "primary")}</div>`,
    "Approve round",
  );
}
function showSearch() {
  showDialog(
    `<h2>Find the small thing.</h2><label class="field"><input id="search-input" placeholder="Search proposal titles and descriptions…" autofocus></label><div id="search-results"></div>`,
    "Quick switcher",
    true,
  );
  renderSearch("");
  $("#search-input").focus();
}
function renderSearch(search) {
  const results = company().proposals.filter((p) =>
    (p.title + " " + p.summary).toLowerCase().includes(search.toLowerCase()),
  );
  $("#search-results").innerHTML =
    results
      .map(
        (p) =>
          `<button class="search-result" data-action="search-select" data-id="${p.id}">${icon("file")}<span>${escape(p.title)}</span>${badge(p.status)}</button>`,
      )
      .join("") ||
    '<p class="muted">No proposals match. A smaller search, perhaps.</p>';
}

async function action(name, element) {
  if (busy && !["close-dialog"].includes(name)) return;
  if (name.startsWith("code-")) return codeReview.action(name, element);
  if (name === "walkthrough") {
    const sample = sampleTask();
    if (!sample) return;
    await saveVisible();
    if (company().id !== sample.company.id)
      await run("selectCompany", { companyId: sample.company.id });
    proposalId = sample.proposal.id;
    await run("settings", { mode: "offline" }, {
      page: element.dataset.page || (sample.proposal.status === "approved" ? "master" : "room"),
      tab: element.dataset.tab || "brief",
    });
    $(".page").scrollTop = 0;
    return;
  }
  if (
    [
      "home",
      "room",
      "review",
      "board",
      "master",
      "company",
      "chat",
      "mail",
      "forge",
    ].includes(name)
  ) {
    await saveVisible();
    page = name;
    if (page === "review") await codeReview.load();
    await refreshHunks();
    render();
    $(".page").scrollTop = 0;
    return;
  }
  if (name === "open-proposal" || name === "search-select") {
    await saveVisible();
    proposalId = element.dataset.id;
    page = "room";
    tab = "brief";
    patchEdit = false;
    closeDialog();
    await refreshHunks();
    render();
    $(".page").scrollTop = 0;
    return;
  }
  if (name === "tab") {
    await saveVisible();
    tab = element.dataset.tab;
    await refreshHunks();
    render();
    return;
  }
  if (name === "new-company") return showNewCompany();
  if (name === "new-proposal") return showNewProposal();
  if (name === "import") return showImport();
  if (name === "settings") return showSettings();
  if (name === "facts") return showFacts();
  if (name === "disable-facts") {
    await run("settings", { showFacts: false });
    closeDialog();
    toast("Startup tips turned off. Find them in Did you know? in the sidebar or Overview.");
    return;
  }
  if (name === "next-fact" || name === "fact-dialog-next") {
    await run("nextFact");
    if (name === "fact-dialog-next") showFacts();
    return;
  }
  if (name === "hide-fact") {
    factVisible = false;
    render();
    return;
  }
  if (name === "close-dialog") return closeDialog();
  if (name === "search") return showSearch();
  if (name === "toggle-patch") {
    await saveVisible();
    patchEdit = !patchEdit;
    await refreshHunks();
    render();
    return;
  }
  if (name === "rehearse") {
    await run("rehearse", {}, { page: "room", tab: "company" });
    toast("The company has weighed in. These reactions are simulated.");
    return;
  }
  if (name === "revise") {
    await run("revise", {}, { page: "room", tab: "drafts" });
    toast("Handoff revised. Review each draft before sharing.");
    return;
  }
  if (name === "reject") {
    await run("reject");
    toast("Round set aside. You can reopen it later.");
    return;
  }
  if (name === "reopen") return run("reopen");
  if (name === "approve") {
    await saveVisible();
    return showApprove();
  }
  if (name === "confirm-approve") {
    closeDialog();
    await run("approve");
    toast("Round approved. Final packet saved.");
    return;
  }
  if (name === "copy-draft") {
    await saveVisible();
    await api.copy(
      (proposal().final || proposal().drafts)[element.dataset.destination],
    );
    toast("Draft copied. Ready for a human to post.");
    return;
  }
  if (name === "copy-final") {
    await api.copy(
      company().proposals.find((p) => p.id === element.dataset.id).final[
        element.dataset.destination
      ],
    );
    toast("Approved draft copied.");
    return;
  }
  if (name === "export") {
    await saveVisible();
    const target = page === "review" ? await api.reviewExport() : await api.exportCompany(company().id);
    if (target) toast("Handoff exported to " + target);
    return;
  }
  if (name === "open-folder") {
    await api.openFolder();
    return;
  }
  if (name === "chat-scope" || name === "chat-evidence") {
    await run("chat", {
      review: page === "review",
      message:
        name === "chat-scope"
          ? "How can we keep this small?"
          : "What needs evidence here?",
    });
    return;
  }
  if (name === "new-task") {
    showDialog(
      '<h2>Something we can do meanwhile.</h2><form id="task-form"><label class="field">Independent task<input name="title" required placeholder="Compare the current and proposed outputs"></label><div class="form-actions"><button class="button primary">Add to Kanbun</button></div></form>',
      "New task",
    );
    return;
  }
  if (name === "add-person") {
    const count = document.querySelectorAll(".person-fields").length;
    if (count >= 12) throw new Error("The rehearsal supports up to 12 voices.");
    $("#people-fields").insertAdjacentHTML(
      "beforeend",
      personFields({ name: "", role: "", concern: "" }, count),
    );
    return;
  }
  if (name === "remove-person") {
    element.closest(".person-fields").remove();
    return;
  }
}

document.addEventListener("click", (event) => {
  const element = event.target.closest("[data-action]");
  if (element) {
    event.preventDefault();
    action(element.dataset.action, element).catch(fail);
  }
});
document.addEventListener("input", (event) => {
  codeReview.input(event.target);
  if (page === "review" && codeReview.dirty) saveStatus("Unsaved review edits…");
  if (event.target.id === "chat-input") chatDraft = event.target.value;
  if (event.target.id === "search-input") renderSearch(event.target.value);
  if (event.target.dataset.field || event.target.dataset.draft) {
    saveStatus("Unsaved editor changes…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveVisible().catch(fail), 600);
  }
});
document.addEventListener("change", async (event) => {
  if (event.target.matches('#settings-form [name="mode"]')) {
    document.querySelectorAll("#settings-form [data-engine]").forEach((element) => {
      element.hidden = element.dataset.engine !== event.target.value;
    });
    $('#settings-form [name="model"]').required = event.target.value === "ollama";
    return;
  }
  try {
    const target = event.target;
    if (target.id === "code-on-hunk") codeReview.input(target);
    if (target.id === "code-repo") {
      await codeReview.pending(async () => {
        await saveVisible();
        codeReview.repo = target.value;
      });
    }
    if (target.id === "company-select") {
      await saveVisible();
      await run("selectCompany", { companyId: target.value });
      proposalId = null;
      page = "home";
      await refreshHunks();
      render();
    }
    if (target.id === "proposal-select") {
      await saveVisible();
      proposalId = target.value;
      patchEdit = false;
      await refreshHunks();
      render();
    }
    if (target.dataset.hunk) {
      const excluded = new Set(proposal().excludedHunks);
      target.checked
        ? excluded.delete(target.dataset.hunk)
        : excluded.add(target.dataset.hunk);
      await run("editProposal", { excludedHunks: [...excluded] });
    }
    if (target.dataset.taskId)
      await run("moveTask", {
        taskId: target.dataset.taskId,
        status: target.value,
      });
    if (target.dataset.field || target.dataset.draft) await saveVisible();
  } catch (error) {
    fail(error);
  }
});
document.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;
  const form = event.target;
  const input = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "chat-form") {
      const message = chatDraft.trim();
      if (!message) return;
      chatDraft = "";
      try {
        await run("chat", { message, review: page === "review" });
      } catch (error) {
        chatDraft = message;
        render();
        throw error;
      }
      $("#chat-input").focus();
    }
    if (form.id === "new-company-form") {
      closeDialog();
      await run("createCompany", input);
      proposalId = null;
      page = "company";
      render();
      toast("Company workspace created. Make the people your own.");
    }
    if (form.id === "new-proposal-form") {
      closeDialog();
      await run("createProposal", input, { page: "room", tab: "brief" });
      toast("Proposal added. Let there be a review.");
    }
    if (form.id === "feedback-form") {
      await run("feedback", input, { page: "room", tab: "company" });
      toast("Feedback recorded. Revise the handoff when ready.");
    }
    if (form.id === "company-form") {
      input.people = [...document.querySelectorAll(".person-fields")].map(
        (el) => ({
          id: el.dataset.person,
          ...Object.fromEntries(
            [...el.querySelectorAll("[data-person-field]")].map((field) => [
              field.dataset.personField,
              field.value,
            ]),
          ),
        }),
      );
      await run("updateCompany", input);
      toast("People and context saved.");
    }
    if (form.id === "settings-form") {
      input.showFacts = form.elements.showFacts.checked;
      closeDialog();
      await run("settings", input);
      toast("Preferences saved.");
    }
    if (form.id === "task-form") {
      closeDialog();
      await run("addTask", input);
      toast("Independent task added.");
    }
    if (form.id === "import-form") {
      closeDialog();
      busy = true;
      render();
      try {
        const result = await api.importRepository({
          companyId: company().id,
          ...input,
        });
        if (result) {
          state = result;
          proposalId = company().proposals.at(-1)?.id;
          page = "room";
          tab = "brief";
          await refreshHunks();
          toast("Git range imported into an isolated rehearsal copy.");
        }
      } finally {
        busy = false;
        render();
      }
    }
  } catch (error) {
    fail(error);
  }
});
document.addEventListener("keydown", (event) => {
  if (page === "review") codeReview.key(event);
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    showSearch();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    (page === "review" ? codeReview.action("code-save", {}) : saveVisible())
      .then(() => toast("Saved locally."))
      .catch(fail);
  }
  if (
    event.target.id === "chat-input" &&
    event.key === "Enter" &&
    !event.shiftKey
  ) {
    event.preventDefault();
    $("#chat-form").requestSubmit();
  }
});
document.addEventListener("dragstart", (event) => {
  const card = event.target.closest('[draggable="true"]');
  if (card) event.dataTransfer.setData("text/plain", card.dataset.task);
});
document.addEventListener("dragover", (event) => {
  if (event.target.closest("[data-drop]")) event.preventDefault();
});
document.addEventListener("drop", (event) => {
  const column = event.target.closest("[data-drop]");
  if (!column) return;
  event.preventDefault();
  const taskId = event.dataTransfer.getData("text/plain");
  if (!company().tasks.some((t) => t.id === taskId)) return;
  if (!["draft", "review", "approved"].includes(column.dataset.drop)) {
    toast("Independent tasks use Up next, In rehearsal, or Approved.");
    return;
  }
  run("moveTask", { taskId, status: column.dataset.drop }).catch(fail);
});
api.onExport(() => action("export", {}).catch(fail));
api.onBeforeClose(async () => {
  try {
    await saveVisible();
    await api.closeAfterSave();
  } catch (error) {
    fail(error);
  }
});
window.addEventListener("beforeunload", () => {
  saveVisible().catch(() => {});
});
let reviewRefreshing = false;
setInterval(async () => {
  if (page !== "review" || busy || reviewRefreshing || codeReview.dirty || codeReview.commentDraft || $(".modal")) return;
  reviewRefreshing = true;
  try {
    const view = await api.reviewRead();
    if (page === "review" && !busy && !codeReview.dirty && !codeReview.commentDraft && (view.revision !== codeReview.view?.revision || codeReview.error)) {
      codeReview.update(view);
      render();
    }
  } catch (error) {
    if (page === "review" && error.message !== codeReview.error) {
      codeReview.error = error.message;
      render();
    }
  } finally { reviewRefreshing = false; }
}, 4000);
(async () => {
  try {
    state = await api.read();
    if (state.settings.showFacts && !dawkins()) state = await api.act("nextFact");
    await refreshHunks();
    render();
    if (state.settings.showFacts && !dawkins()) showFacts();
  } catch (error) {
    $("#app").innerHTML =
      `<div class="fatal"><h1>The workspace could not open.</h1><p>${escape(error.message)}</p><p>Open Developer Tools from the View menu for details.</p></div>`;
  }
})();
