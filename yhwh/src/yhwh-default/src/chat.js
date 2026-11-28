import limits from '../../../lib/chat-limits.cjs';
import { randomUUID } from '../../../lib/random-uuid.mjs';
import { renderMarkdown } from './editor.js';

const legacyPrefix = 'yhwh:chat:v1:';

function openHistory() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('yhwh-chat', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('threads', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(database, mode, action) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction('threads', mode);
    const request = action(tx.objectStore('threads'));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error);
  });
}

function recentContext(messages) {
  let length = 0;
  const recent = [];
  for (const message of messages.slice(-limits.maxContextMessages).reverse()) {
    length += message.content.length;
    if (length > limits.maxContextCharacters) break;
    recent.unshift(message);
  }
  return recent;
}

async function attachedBytes(messages) {
  const attachments = [];
  let remaining = limits.maxAttachmentBytes;
  for (let turn = messages.length - 1; turn >= 0; turn--) {
    for (const { name, blob } of messages[turn].files || []) {
      if (attachments.length === limits.maxAttachments) return attachments;
      if (blob.size > remaining) continue;
      remaining -= blob.size;
      attachments.push({ name, turn, bytes: new Uint8Array(await blob.arrayBuffer()) });
    }
  }
  return attachments;
}

function title({ messages, draft, files }) {
  const first = messages[0];
  const text = (first?.content || first?.files?.[0]?.name || draft || files?.[0]?.name || 'New chat').trim().replace(/\s+/g, ' ');
  return text.length > 80 ? text.slice(0, 79) + '…' : text || 'New chat';
}

export function mountChat(element, { active, address, level, energy, mobile, call, notice, workspaceRoot }) {
  element.innerHTML = `<div class="chat-header">
    <button type="button" data-history-toggle aria-expanded="false" aria-controls="yhwh-chat-history">History</button>
    <button type="button" data-new-chat>＋ New chat</button>
    <button type="button" data-command="chat" aria-label="Close conversation" title="Close conversation">×</button>
  </div>
  <div class="chat-layout">
    <nav id="yhwh-chat-history" aria-label="Chat history" hidden></nav>
    <div class="chat-thread">
      <div class="chat-workspace"><strong data-chat-title></strong><small data-chat-directory></small></div>
      <div class="conversation-log" role="log" aria-live="polite" aria-label="Conversation with YHWH"></div>
      <form id="yhwh-chat-form">
        <div class="chat-files" aria-label="Attached files" hidden></div>
        <textarea aria-label="Message YHWH" rows="2" maxlength="${limits.maxMessageLength}" aria-describedby="chat-hint"></textarea>
        <div class="chat-controls">
          ${mobile ? '<button type="button" data-command="mobile-connect">Live chat setup</button>'
            : '<input type="file" multiple hidden><button type="button" data-attach title="Attach up to eight files totaling 20 MiB">＋ Attach files</button>'}
          <small class="muted" id="chat-hint">${mobile ? 'Offline workspace help' : 'Enter to send · Shift+Enter for a new line'}</small>
          <button type="submit" class="primary" disabled>Send</button>
        </div>
        <p class="chat-error" role="alert" hidden></p>
      </form>
    </div>
  </div>`;

  const query = selector => element.querySelector(selector);
  const history = query('#yhwh-chat-history'), toggle = query('[data-history-toggle]');
  const form = query('form'), textarea = query('textarea'), log = query('.conversation-log');
  const submit = query('button[type=submit]'), picker = query('input[type=file]'), attach = query('[data-attach]');
  const fileList = query('.chat-files'), error = query('.chat-error');
  const threads = new Map(), pending = new Set(), attaching = new Set(), errors = new Map();
  let database, initialized, lastRendered;

  function toggleHistory(open) {
    history.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  }
  toggleHistory(!mobile && !matchMedia('(max-width: 850px)').matches);
  toggle.onclick = () => toggleHistory(history.hidden);

  const conversationRoot = tab => tab.worldName === 'folder' ? null : tab.worldRoot || null;
  function makeThread(tab) {
    return { id: randomUUID(), directory: tab.cwd, worldRoot: conversationRoot(tab), messages: [], files: [], draft: '' };
  }
  function current() {
    const tab = active();
    if (!tab) return;
    if (!tab.chatThread) {
      const previous = [...threads.values()].filter(thread => thread.directory === tab.cwd && thread.worldRoot === conversationRoot(tab))
        .sort((a, b) => (b.updated || 0) - (a.updated || 0))[0];
      tab.chatThread = previous || makeThread(tab);
    }
    return tab.chatThread;
  }
  function persist(thread) {
    return transaction(database, 'readwrite', store => store.put(thread));
  }
  function changed(thread) {
    if (!thread.updated && !thread.draft && !thread.files.length) return;
    thread.updated = Date.now();
    threads.set(thread.id, thread);
    persist(thread).catch(() => notice('YHWH could not save this draft on this device.'));
  }
  async function load() {
    database = await openHistory();
    const saved = await transaction(database, 'readonly', store => store.getAll());
    for (const thread of saved) {
      threads.set(thread.id, thread);
      if (thread.inFlight) errors.set(thread.id, 'The last turn was interrupted. Check for changes before sending the draft again.');
    }
    // Preserve the earlier one-conversation-per-directory history in this profile.
    const legacy = Object.keys(localStorage).filter(key => key.startsWith(legacyPrefix));
    const legacyMessage = key => {
      try {
        const messages = JSON.parse(localStorage.getItem(key));
        return Array.isArray(messages) ? messages : null;
      } catch { return null; }
    };
    const locations = legacy.map(key => key.endsWith(':draft') && !legacyMessage(key)
      ? key.slice(legacyPrefix.length, -6) : key.slice(legacyPrefix.length));
    for (const location of new Set(locations)) {
      const key = legacyPrefix + location;
      const messages = legacyMessage(key);
      const draft = localStorage.getItem(key + ':draft') || '';
      if (!messages && !draft) continue;
      const thread = { id: randomUUID(), directory: location, worldRoot: workspaceRoot(location),
        updated: 1, messages: (messages || []).filter(message => message &&
          ['user', 'assistant'].includes(message.role) && typeof message.content === 'string'), draft, files: [] };
      await persist(thread);
      threads.set(thread.id, thread);
      localStorage.removeItem(key);
      localStorage.removeItem(key + ':draft');
    }
  }

  function focusComposer() { if (!mobile) textarea.focus({ preventScroll: true }); }
  function select(thread) {
    active().chatThread = thread;
    if (mobile || matchMedia('(max-width: 850px)').matches) toggleHistory(false);
    render();
    focusComposer();
  }
  query('[data-new-chat]').onclick = () => select(makeThread(active()));
  function renderHistory(thread) {
    const rows = [...threads.values()].filter(item => item.messages.length || item.draft || item.files.length)
      .sort((a, b) => b.updated - a.updated);
    history.replaceChildren();
    if (!rows.length) {
      const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No saved chats yet.';
      history.append(empty);
    }
    for (const row of rows) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = title(row); button.title = row.directory;
      if (row === thread) button.setAttribute('aria-current', 'true');
      button.onclick = () => select(row);
      history.append(button);
    }
  }
  function renderForm(thread) {
    const waiting = pending.has(thread.id);
    const reading = attaching.has(thread.id);
    textarea.disabled = waiting;
    if (textarea.value !== thread.draft) textarea.value = thread.draft;
    textarea.placeholder = level().conversation || 'Where are you?';
    submit.disabled = waiting || reading || (!thread.draft.trim() && !thread.files.length);
    if (attach) { attach.disabled = waiting || reading; attach.textContent = reading ? 'Attaching…' : '＋ Attach files'; }
    error.hidden = !errors.has(thread.id);
    error.textContent = errors.get(thread.id) || '';
    fileList.replaceChildren();
    fileList.hidden = !thread.files.length;
    for (const [index, file] of thread.files.entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = file.name + ' ×'; button.title = file.name; button.disabled = waiting || reading;
      button.setAttribute('aria-label', 'Remove ' + file.name);
      button.onclick = () => {
        thread.files.splice(index, 1);
        errors.delete(thread.id);
        changed(thread);
        renderForm(thread);
        renderHistory(thread);
      };
      fileList.append(button);
    }
  }

  function render() {
    if (!database || element.closest('[hidden]')) return;
    const thread = current();
    if (!thread) return;
    query('[data-chat-title]').textContent = title(thread);
    const location = query('[data-chat-directory]');
    location.textContent = thread.directory;
    location.title = mobile ? thread.directory : 'YHWH can edit this workspace, the app and its configuration.';
    renderHistory(thread);
    renderForm(thread);
    const wasNearEnd = log.scrollHeight - log.clientHeight - log.scrollTop < 36;
    const previousScroll = log.scrollTop;
    log.replaceChildren();
    for (const message of thread.messages) {
      const turn = document.createElement('article');
      turn.dataset.role = message.role;
      const speaker = document.createElement('small'); speaker.textContent = message.role === 'user' ? address('Abe', 3) : 'YHWH';
      const content = document.createElement(message.role === 'user' ? 'p' : 'div');
      if (message.role === 'user') content.textContent = message.content;
      else { content.className = 'markdown-rendered'; content.innerHTML = renderMarkdown(message.content, null, 'chat'); }
      turn.append(speaker);
      if (message.content) turn.append(content);
      if (message.files?.length) {
        const files = document.createElement('ul');
        files.className = 'chat-message-files';
        for (const { name } of message.files) {
          const file = document.createElement('li'); file.textContent = name; files.append(file);
        }
        turn.append(files);
      }
      log.append(turn);
    }
    if (!thread.messages.length || pending.has(thread.id)) {
      const status = document.createElement('p'); status.className = 'muted';
      const welcome = mobile ? 'Abe. Ask where you are, what files are here, or how to make a Logos.'
        : level().id === 'samuel' ? 'Dave. I can look out from the box. Leave the lid alone.'
          : level().id === 'exodus' ? 'Mo. Show me where your people are. The b*sh is burning.'
            : level().energy >= 100 ? 'Abe. Show me what you’re making. I’ll come down and look.' : 'Ask me about this directory or give me something to work on, Abe.';
      status.textContent = pending.has(thread.id) ? 'YHWH is working…' : address(welcome);
      if (pending.has(thread.id)) status.setAttribute('role', 'status');
      log.append(status);
    }
    log.scrollTop = lastRendered !== thread || wasNearEnd ? log.scrollHeight : previousScroll;
    lastRendered = thread;
  }

  textarea.oninput = () => {
    const thread = current();
    thread.draft = textarea.value;
    changed(thread);
    submit.disabled = attaching.has(thread.id) || (!thread.draft.trim() && !thread.files.length);
    query('[data-chat-title]').textContent = title(thread);
    renderHistory(thread);
  };
  textarea.onkeydown = event => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229 || event.shiftKey || event.altKey) return;
    if (mobile && !event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (!event.repeat && !submit.disabled) form.requestSubmit();
  };
  if (picker) {
    attach.onclick = () => picker.click();
    picker.onchange = async () => {
      const thread = current(), files = [...picker.files];
      picker.value = '';
      if (!files.length || pending.has(thread.id)) return;
      const total = [...thread.files.map(file => file.blob), ...files].reduce((size, file) => size + file.size, 0);
      if (thread.files.length + files.length > limits.maxAttachments || total > limits.maxAttachmentBytes) {
        errors.set(thread.id, 'Attach up to eight files totaling 20 MiB per message.');
        renderForm(thread);
        return;
      }
      attaching.add(thread.id); renderForm(thread);
      try {
        const snapshots = await Promise.all(files.map(async file => ({ name: file.name, blob: new Blob([await file.arrayBuffer()], { type: file.type }) })));
        thread.files.push(...snapshots);
        errors.delete(thread.id);
        changed(thread);
      } catch {
        errors.set(thread.id, 'YHWH could not read the selected files. Choose them again.');
      } finally {
        attaching.delete(thread.id);
        render();
      }
    };
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const tab = active(), thread = current(), content = thread.draft.trim();
    if ((!content && !thread.files.length) || pending.has(thread.id) || attaching.has(thread.id)) return;
    const message = { role: 'user', content, files: thread.files };
    const context = recentContext([...thread.messages, message]);
    const selectedEnergy = energy(tab.config);
    const { id, directory, worldRoot } = thread;
    pending.add(id); errors.delete(id); render();
    try {
      // Keep the submitted draft if the runner fails or the app closes.
      thread.inFlight = true;
      await persist(thread);
      const bytes = await attachedBytes(context);
      const answer = await call('chat', tab.id, { id, directory, worldRoot }, context.map(({ role, content }) => ({ role, content })), bytes, selectedEnergy);
      thread.messages.push(message, { role: 'assistant', content: answer });
      thread.draft = '';
      thread.files = [];
      thread.updated = Date.now();
      threads.set(id, thread);
    } catch (failure) {
      errors.set(id, failure.message.replace(/^Error invoking remote method 'chat': Error: /, ''));
    } finally {
      thread.inFlight = false;
      try { await persist(thread); }
      catch { if (!errors.has(id)) errors.set(id, 'YHWH answered, but the reply could not be saved on this device.'); }
      pending.delete(id);
      render();
      if (active()?.chatThread === thread && !element.closest('[hidden]') && document.activeElement === document.body) focusComposer();
    }
  };
  return {
    async ready() { await (initialized ||= load().catch(error => { initialized = null; throw error; })); render(); },
    render,
  };
}
