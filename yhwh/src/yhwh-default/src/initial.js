import { createInitial, alphabets, transliteration, quote, asText, normalizeGesture, matchGesture, defaultRC } from '../../../lib/initial.mjs';
import './initial.css';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function installInitial(app, { home, mobile, call }) {
  let library, dialog, category='Initials', query='', draft='', wordName='', wordVersion, wordOriginalName, editingAlias, trainedGesture, drawDone, liveTimer;
  const views = new Map();
  try { draft=localStorage.getItem('yhwh:initial:draft') || ''; } catch {}
  const buttons = (items) => items.map(([label, action]) => `<button type="button" data-initial="${action}">${label}</button>`).join('');
  const guarded = fn => async (...args) => { try { return await fn(...args); } catch(error) { showError(error); } };
  function showError(error) {
    const target=dialog?.open && dialog.querySelector('[data-error]');
    if (target) target.textContent=error.message; else app.notice(error.message);
  }
  function modal(title, html) {
    if (!dialog) { dialog=document.createElement('dialog'); dialog.id='initial-dialog'; document.body.append(dialog); }
    if (dialog.open) dialog.close();
    dialog.innerHTML=`<header><div><small class="initial-eyebrow">YHWH · THE INITIAL</small><h2>${escape(title)}</h2></div><button type="button" data-close aria-label="Close Initial">×</button></header>${html}<p role="alert" data-error></p>`;
    dialog.querySelector('[data-close]').onclick=()=>dialog.close();
    dialog.showModal(); return dialog;
  }
  const root = () => app.active()?.initialRoot || app.active()?.worldRoot;
  const host = {
    home, cwd:()=>app.active().cwd, root,
    read: path=>call('file:read',path), save:(...args)=>call('file:save',...args),
    stat:path=>call('path:stat',path), create:(...args)=>call('file:create',...args),
    list:path=>call('directory:list',app.active().id,path),
    copy:(...args)=>call('file:copy',...args), move:(...args)=>call('file:move',...args), trash:path=>call('file:trash',path),
    navigate:path=>app.navigate(path), open:path=>app.openFile(path), view:showView,
    builtins:()=>[...app.commands.values()].filter(item=>!['initial','initial-draw','initial-new','initial-rc'].includes(item.id)),
    chroot:async path=>{
      const tab=app.active();
      tab.initialRoot=mobile?null:path;
      if (mobile) Object.assign(tab,await call(path?'world:enter':'world:leave',tab.id,path || undefined));
      await app.navigate(path || home); tab.history=[tab.cwd]; tab.historyIndex=0;
    },
  };
  library=createInitial(host);
  library.reload().catch(error=>app.notice('Initial: '+error.message));
  async function refreshLibrary() { await library.reload(); }
  function bind(actions) { for (const element of dialog.querySelectorAll('[data-initial]')) if (actions[element.dataset.initial]) element.onclick=guarded(actions[element.dataset.initial]); }
  function rememberDraft() { draft=dialog.querySelector('[data-composer]')?.value ?? draft; try { localStorage.setItem('yhwh:initial:draft',draft); } catch {} }
  async function execute(source=draft) {
    if (!source.trim()) return;
    rememberDraft(); if (dialog.open) dialog.close();
    const result=await library.run(source);
    await app.refresh();
    if (result.kind==='text' && result.text) {
      modal('Output', `<pre class="initial-output">${escape(result.text)}</pre><div class="initial-tools">${buttons([['Back to commands','back'],['View in a tab','view'],['Copy','copy']])}</div>`);
      bind({back:shelf,view:async()=>{dialog.close();await showView(result);},copy:async()=>{await navigator.clipboard.writeText(result.text);app.notice('Copied output.');}});
    } else if (result.kind==='entries' && !/\bview\s*$/.test(source)) await showView({...result,kind:'snapshot'});
  }
  async function shelf() {
    await refreshLibrary();
    modal('Your commands', `<p class="initial-intro">A terminal for fingers. Tap a tile, type its name, or draw your own mark. <span>Abe, these are <em>your</em> words now.</span></p>
      <div class="initial-tools">${buttons([['+ Initial','alias'],['#! New Word','word'],['Draw','draw'],['Guide','guide']])}</div>
      <label class="initial-search"><span>Find a command</span><input type="search" data-search placeholder="Letter, transliteration or action…" value="${escape(query)}" autocomplete="off"></label>
      <nav class="initial-categories" aria-label="Command locations">${['Initials','Words','Atomics','Builtins'].map(kind=>`<button type="button" data-kind="${kind}" aria-pressed="${kind===category}">${kind}<small>${({Initials:'~/.initialrc',Words:'~/bin',Atomics:'/bin',Builtins:'/usr/bin'})[kind]}</small></button>`).join('')}</nav>
      <div class="initial-shelf" aria-label="Commands"></div>
      <section class="initial-composer"><label>Make a little sentence<textarea rows="2" data-composer aria-label="Command" spellcheck="false" autocapitalize="off" placeholder="Tap + on a command to build here">${escape(draft)}</textarea></label>
      <div class="initial-tools">${buttons([['Argument…','arg'],['| Pipe','pipe'],['↵ Then','then'],['$()','sub'],['> Save output','redirect'],['Undo','undo']])}</div>
      <div class="initial-tools"><button type="button" class="primary" data-initial="run">~ $ Run</button>${buttons([['#! Save Word','save-word'],['Clear','clear']])}</div></section>`);
    dialog.querySelector('[data-search]').oninput=event=>{query=event.target.value;renderCatalog();};
    dialog.querySelector('[data-composer]').oninput=rememberDraft;
    for (const button of dialog.querySelectorAll('[data-kind]')) button.onclick=()=>{rememberDraft();category=button.dataset.kind;for(const item of dialog.querySelectorAll('[data-kind]'))item.setAttribute('aria-pressed',String(item===button));renderCatalog();};
    bind({alias:()=>aliasEditor(),word:()=>{rememberDraft();wordName='';wordVersion=undefined;wordOriginalName=undefined;wordEditor();},draw:()=>draw(),guide:guide,
      arg:()=>argument(),pipe:()=>append(' | ',false),then:()=>append('\n',false),sub:()=>substitution(),redirect:()=>argument('redirect'),
      undo:()=>{rememberDraft();draft=draft.replace(/\s*(?:\S+|\n)\s*$/,'');setDraft();},clear:()=>{draft='';setDraft();},run:()=>execute(),
      'save-word':()=>{rememberDraft();wordName='';wordVersion=undefined;wordOriginalName=undefined;wordEditor();}});
    renderCatalog();
  }
  function renderCatalog() {
    const container=dialog.querySelector('.initial-shelf');
    const items=library.catalog().filter(item=>(query || item.kind===category) && `${item.name} ${item.label} ${item.detail} ${item.names?.join(' ') || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    container.innerHTML=items.map((item,i)=>`<article class="initial-command ${item.kind==='Initials'?'':'is-command'}"><button type="button" class="initial-tile" data-run="${i}" title="Run ${escape(item.name)}"><b dir="auto">${escape(item.name)}</b><span>${escape(item.label)}</span>${query?`<small>${item.kind}</small>`:''}</button><div class="initial-command-actions">${buttons([['+','add-'+i],['?','help-'+i],...(item.kind==='Initials'||item.kind==='Words'?[['Edit','edit-'+i]]:[])])}</div></article>`).join('') || '<p class="initial-empty">Nothing here yet. Make a name for something you do often.</p>';
    for(const [i,item] of items.entries()) {
      container.querySelector(`[data-run="${i}"]`).onclick=guarded(()=>prepare(item,true));
      container.querySelector(`[data-initial="add-${i}"]`).onclick=guarded(()=>prepare(item,false));
      container.querySelector(`[data-initial="help-${i}"]`).onclick=guarded(()=>manual(item));
      const edit=container.querySelector(`[data-initial="edit-${i}"]`);
      if(edit)edit.onclick=guarded(async()=>{rememberDraft();if(item.kind==='Initials')aliasEditor(item);else {const file=await library.readWord(item.name);wordName=item.name;wordOriginalName=item.name;wordVersion=file.modified;draft=file.content;wordEditor();}});
    }
  }
  async function prepare(item,run) {
    rememberDraft();
    if(run){draft='';setDraft();}
    const needsArgument={mkdir:'New-folder',touch:'Note.md',cat:null,cd:'.',ls:'.',fm:'.',open:null,cp:null,mv:null,trash:null,grep:'note',head:'10',chroot:'.'};
    if (Object.hasOwn(needsArgument,item.name)) {
      append(quote(item.name));
      if(['cp','mv'].includes(item.name)) return argument('arg',needsArgument[item.name],false,()=>argument('arg','Copy',run));
      return argument('arg',needsArgument[item.name],run);
    }
    if (run) return execute(quote(item.name));
    append(quote(item.name));
  }
  function setDraft() { const input=dialog.querySelector('[data-composer]');if(input){input.value=draft;input.scrollTop=input.scrollHeight;try{localStorage.setItem('yhwh:initial:draft',draft);}catch{}} }
  function append(value,space=true) {rememberDraft();draft+=(space&&draft&&!/[\s|]$/.test(draft)?' ':'')+value;setDraft();}
  async function manual(item) {
    rememberDraft(); let details=library.help(item.name);
    if(item.kind==='Words')details+='\n\n'+(await library.readWord(item.name)).content;
    modal(item.name,`<pre class="initial-output">${escape(details)}</pre><div class="initial-tools">${buttons([['Back','back'],['Use this command','use'],['Make an Initial','alias']])}</div>`);
    bind({back:shelf,use:async()=>{draft+=(draft?'\n':'')+quote(item.name);await shelf();},alias:()=>aliasEditor({script:quote(item.name)})});
  }
  function guide() {
    rememberDraft();modal('Start here, Abe',`<div class="initial-guide"><p><strong>Terminal → Initial.</strong> Same joy, different fingers. Give an action a short name. Tap it whenever you need it.</p><ol><li><strong>Initials</strong> are your aliases. Choose a letter, an action and the names you want to type. A gesture is optional.</li><li><strong>Words</strong> are your little programs in <code>~/bin</code>. Put commands on separate lines to do them in order. Put <code>|</code> between them to pass output along.</li><li><strong>Atomics</strong> do one small job: list, read, make, copy, move. <strong>Builtins</strong> are the actions already in this app. Tap <strong>?</strong> beside any command for its manual.</li></ol><p><code>ls | view</code> keeps a picture of that list. <code>fm .</code> follows the folder as it changes.</p><p><code>$()</code> puts one command’s output into another command’s argument. <code>&gt;</code> saves output to a file. The buttons build the punctuation for you.</p><p>Your search path is <code>~/bin → /bin → /usr/bin</code>; Initials take precedence. Unicode letters and their editable search names work equally. You can also use any keyboard language.</p><p>To draw: hold the little dot and start your mark, or tap Draw. Train a mark in Edit Initial first. A match asks you to tap the resulting tile.</p><p>Folder root makes a folder appear as <code>/</code> in this tab. It changes navigation, never device permissions.</p></div><div class="initial-tools">${buttons([['Let’s go','back'],['Edit ~/.initialrc','rc'],['Gesture dot settings','dot']])}</div>`);
    bind({back:shelf,rc:openRC,dot:dotSettings});
  }
  async function openRC() {
    if(dialog?.open)dialog.close();
    try { await call('path:stat',library.rcPath); }
    catch(error) {
      if(!/ENOENT|not found|does not exist/i.test(error.message))throw error;
      await call('file:create',library.rcPath,false);
      const file=await call('file:read',library.rcPath);
      await call('file:save',library.rcPath,defaultRC,file.modified);
    }
    await app.openFile(library.rcPath,await app.newTab(home));
  }
  function dotSettings() {
    modal('Your little dot',`<p>Keep it where your thumb expects it. Tap opens the shelf; hold and draw opens the sketch pad.</p><label>Position<select data-position><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select></label><label>Visibility<input type="range" min="0.25" max="1" step="0.05" data-opacity value="${dot.style.opacity||0.6}"></label><div class="initial-tools">${buttons([['Save','save']])}</div>`);
    dialog.querySelector('[data-position]').value=dot.dataset.position||'center';
    bind({save:async()=>{const settings={position:dialog.querySelector('[data-position]').value,opacity:dialog.querySelector('[data-opacity]').value};localStorage.setItem('yhwh:initial:dot',JSON.stringify(settings));applyDot(settings);await shelf();}});
  }
  function glyphPicker(onPick) {
    modal('Choose your letter',`<p>One letter fits a tile. Its search name starts with its transliteration. You can change it.</p><nav class="initial-tools">${Object.keys(alphabets).map(name=>`<button type="button" data-alphabet="${name}">${name}</button>`).join('')}</nav><div class="initial-glyphs"></div>`);
    function render(name) {const grid=dialog.querySelector('.initial-glyphs');grid.innerHTML=alphabets[name].map(([glyph,label],i)=>`<button type="button" data-glyph="${i}" title="${label}"><b dir="auto">${glyph}</b><small>${label}</small></button>`).join('');for(const button of grid.querySelectorAll('button'))button.onclick=()=>onPick(alphabets[name][Number(button.dataset.glyph)][0]);}
    for(const button of dialog.querySelectorAll('[data-alphabet]'))button.onclick=()=>render(button.dataset.alphabet);render('Latin');
  }
  function aliasEditor(alias={}) {
    rememberDraft();editingAlias={...alias,names:alias.names?[...alias.names]:[]};trainedGesture=alias.gesture;
    const previous=alias.name;
    function render() {
      const glyph=editingAlias.name||'A';
      modal(previous?'Edit Initial':'A name of your own',`<form data-alias-form><div class="initial-alias-heading"><button type="button" class="initial-big-glyph" data-initial="glyph" dir="auto">${escape(glyph)}</button><p>Tap the letter to choose Latin, Greek, Hebrew or Paleo.<br><small>Or enter any Unicode character below.</small></p></div><label>Tile name<input name="name" aria-label="Initial name" value="${escape(glyph)}" required autocapitalize="off"></label><label>Names you can type <small>separate with commas</small><input name="names" aria-label="Search names" value="${escape((editingAlias.names.length?editingAlias.names:[transliteration(glyph)]).join(', '))}"></label><button type="button" data-initial="reset">Reset transliteration</button><label>Runs<textarea name="script" aria-label="Initial action" rows="2" required spellcheck="false">${escape(editingAlias.script||'fm .')}</textarea></label><div class="initial-tools">${buttons([['Choose action','action'],[trainedGesture?'Retrain gesture ✓':'Train gesture','train'],['Clear gesture','clear-gesture']])}</div><div class="initial-tools"><button class="primary">Save Initial</button>${buttons([['Back','back'],...(previous?[['Remove Initial','remove']]:[])])}</div></form>`);
      const form=dialog.querySelector('form');
      function collect(){editingAlias.name=form.elements.name.value;editingAlias.names=form.elements.names.value.split(',').map(s=>s.trim()).filter(Boolean);editingAlias.script=form.elements.script.value;}
      form.onsubmit=guarded(async event=>{event.preventDefault();collect();await library.saveAlias({...editingAlias,gesture:trainedGesture},previous);category='Initials';query='';await shelf();});
      bind({glyph:()=>{collect();glyphPicker(glyph=>{editingAlias.name=glyph;editingAlias.names=[transliteration(glyph)];render();});},reset:()=>{form.elements.names.value=transliteration(form.elements.name.value);},
        action:()=>{collect();chooseCommand(command=>{editingAlias.script=quote(command.name);render();});},train:()=>{collect();draw(points=>{trainedGesture=normalizeGesture(points);render();});},'clear-gesture':()=>{trainedGesture=undefined;collect();render();},back:shelf,remove:async()=>{await library.removeAlias(previous);await shelf();}});
    }
    render();
  }
  function chooseCommand(done, title='Choose a command') {
    const entries=library.catalog();modal(title,`<input type="search" data-find aria-label="Find command" placeholder="Browse or search…"><div class="initial-choices"></div>`);
    const render=()=>{const search=dialog.querySelector('[data-find]').value.toLocaleLowerCase();const list=entries.filter(item=>`${item.name} ${item.label}`.toLocaleLowerCase().includes(search));const container=dialog.querySelector('.initial-choices');container.innerHTML=list.map((item,i)=>`<button type="button" data-choice="${i}"><b dir="auto">${escape(item.name)}</b><span>${escape(item.label)}<small>${item.kind}</small></span></button>`).join('');for(const button of container.querySelectorAll('button'))button.onclick=guarded(()=>done(list[Number(button.dataset.choice)]));};
    dialog.querySelector('[data-find]').oninput=render;render();
  }
  async function wordEditor() {
    if(!wordName){let index=1;const names=new Set(library.catalog().map(item=>item.name));while(names.has('word-'+index))index++;wordName='word-'+index;}
    modal(wordVersion?'Edit Word':'Make a Word',`<p>A little program in <code>~/bin</code>. One action per line, or join them with a pipe.</p><label>Filename <small>Changing the name saves another Word</small><input data-word-name aria-label="Word name" value="${escape(wordName)}" autocapitalize="off"></label><label>Your program<textarea rows="6" data-composer aria-label="Word script" spellcheck="false" autocapitalize="off">${escape(draft)}</textarea></label><div class="initial-tools">${buttons([['+ Command','command'],['Argument…','arg'],['| Pipe','pipe'],['↵ Then','then'],['$()','sub'],['> Output','redirect']])}</div><div class="initial-tools"><button type="button" class="primary" data-initial="save">#! Save Word</button>${buttons([['~ $ Run','run'],['Back','back']])}</div>`);
    const collect=()=>{rememberDraft();wordName=dialog.querySelector('[data-word-name]').value;};
    dialog.querySelector('[data-composer]').oninput=rememberDraft;
    bind({command:()=>{collect();chooseCommand(command=>{draft+=(draft&&!/[\n|]\s*$/.test(draft)?'\n':'')+quote(command.name);wordEditor();});},
      arg:()=>{collect();argument('arg',undefined,false,wordEditor);},pipe:()=>append(' | ',false),then:()=>append('\n',false),
      sub:()=>{collect();substitution(wordEditor);},redirect:()=>{collect();argument('redirect',undefined,false,wordEditor);},
      save:async()=>{collect();if(!draft.trim())throw new Error('Add a command to your Word first.');await library.saveWord(wordName,draft,wordOriginalName===wordName?wordVersion:undefined);wordVersion=undefined;draft='';category='Words';query='';await shelf();app.notice('Saved ~/bin/'+wordName);},run:()=>execute(),back:()=>{collect();shelf();}});
  }
  async function argument(mode='arg',suggestion,run=false,back=shelf) {
    rememberDraft();let cwd=app.active().cwd;
    async function render() {
      const entries=(await host.list(cwd)).filter(entry=>!entry.name.startsWith('.'));
      modal(mode==='redirect'?'Save output into a file':'Choose an argument',`<p class="initial-path">${escape(cwd)}</p><div class="initial-tools">${buttons([['↑ Parent','parent'],['Use this folder','here']])}</div><div class="initial-paths">${entries.map((entry,i)=>`<div><button type="button" data-path="${i}">${entry.directory?'▱':'≡'} ${escape(entry.name)}</button>${entry.directory?`<button type="button" data-enter="${i}" aria-label="Browse ${escape(entry.name)}">→</button>`:''}</div>`).join('')}</div><form data-argument><label>Text or a new name <small>Optional — use the suggestion or choose a file above</small><input aria-label="Argument" value="${escape(suggestion ?? (mode==='redirect'?'output.txt':'New-folder'))}"></label><button class="primary">Use this</button><button type="button" data-initial="cancel">Back</button></form>`);
      const choose=async value=>{draft+=(draft&&!/\s$/.test(draft)?' ':'')+(mode==='redirect'?'> ':'')+quote(value);await back();if(run)await execute();};
      for(const button of dialog.querySelectorAll('[data-path]'))button.onclick=guarded(()=>choose(entries[Number(button.dataset.path)].path));
      for(const button of dialog.querySelectorAll('[data-enter]'))button.onclick=guarded(()=>{cwd=entries[Number(button.dataset.enter)].path;return render();});
      dialog.querySelector('form').onsubmit=guarded(async event=>{event.preventDefault();await choose(dialog.querySelector('form input').value);});
      bind({parent:()=>{if(cwd!==(root()||home))cwd=cwd.slice(0,cwd.lastIndexOf('/'))||'/';return render();},here:()=>choose(cwd),cancel:back});
    }
    await render();
  }
  function substitution(back=shelf) {
    rememberDraft();chooseCommand(async item=>{draft+=(draft&&!/\s$/.test(draft)?' ':'')+'$('+quote(item.name)+')';await back();},'$() · use command output as an argument');
  }

  async function showView(value) {
    if(dialog?.open)dialog.close();
    const tab=await app.newTab(value.path||app.active().cwd);
    tab.initialRoot=mobile?null:value.root;
    if(mobile&&value.root)Object.assign(tab,await call('world:enter',tab.id,value.root));
    if(value.path)await app.navigate(value.path,tab);
    tab.initialView=value;tab.customTitle=value.kind==='live'?'Files · '+(value.path.split('/').at(-1)||'/'):'Output · '+(value.kind==='snapshot'?'files':'text');
    views.set(tab.id,{tab,value,query:'',grid:true});await renderView(views.get(tab.id));await app.run('focus-document');
  }
  async function renderView(state) {
    const {tab,value}=state;if(!app.tabs.includes(tab)||!tab.initialView){views.delete(tab.id);return;}
    const live=value.kind==='live',entries=live?await call('directory:list',tab.id,tab.cwd):value.entries;
    const rows=entries?.filter(entry=>entry.name.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
    const target=tab.document;
    target.innerHTML=`<section class="initial-file-view"><header><div><small>${live?'LIVE FOLDER':'SAVED OUTPUT · FIXED LIST'}</small><h2>${escape(live?tab.cwd.split('/').at(-1)||'/':'Command output')}</h2><p>${escape(live?((tab.initialRoot||tab.worldRoot)?tab.cwd.slice((tab.initialRoot||tab.worldRoot).length)||'/':tab.cwd):entries?`${entries.length} items when this command ran`:'Text output')}</p></div><div class="initial-tools">${live?buttons([['↑','parent'],['+','new'],['↻','refresh']]):''}${entries?buttons([[state.grid?'☷ List':'▦ Tiles','layout']]):''}${tab.initialRoot||tab.worldRoot?buttons([['Leave /','leave-root']]):''}</div></header>${entries?`<input type="search" data-view-search aria-label="Filter files" placeholder="Find in this ${live?'folder':'output'}…" value="${escape(state.query)}"><div class="initial-file-actions">${buttons([['Copy','copy'],['Cut','cut'],['Paste','paste'],['Rename','rename'],['Trash','trash']])}<span>${tab.selected.size} selected</span></div><div class="initial-file-grid ${state.grid?'':'as-list'}">${rows.map((entry,i)=>`<article><input type="checkbox" aria-label="Select ${escape(entry.name)}" data-select="${i}" ${tab.selected.has(entry.path)?'checked':''}><button type="button" data-open="${i}"><b>${entry.directory?'▱':'≡'}</b><span>${escape(entry.name)}</span><small>${entry.directory?'Folder':`${entry.size||0} bytes`}</small></button></article>`).join('')||'<p class="initial-empty">An empty bit of universe. Make something.</p>'}</div>`:`<pre class="initial-output">${escape(asText(value))}</pre>`}<footer>${live?'A living view. Changes appear here.':'This output stays fixed. Run the command again for a fresh list.'}</footer></section>`;
    const act=(id,fn)=>{const button=target.querySelector(`[data-initial="${id}"]`);if(button)button.onclick=guarded(fn);};
    if(entries){target.querySelector('[data-view-search]').oninput=event=>{state.query=event.target.value;clearTimeout(state.searchTimer);state.searchTimer=setTimeout(()=>{const selection=state.query;renderView(state).then(()=>{const input=target.querySelector('[data-view-search]');if(input)input.focus();}).catch(showError);},220);};
      for(const checkbox of target.querySelectorAll('[data-select]'))checkbox.onchange=()=>{const path=rows[Number(checkbox.dataset.select)].path;if(checkbox.checked)tab.selected.add(path);else tab.selected.delete(path);target.querySelector('.initial-file-actions span').textContent=`${tab.selected.size} selected`;};
      for(const button of target.querySelectorAll('[data-open]'))button.onclick=guarded(async()=>{const entry=rows[Number(button.dataset.open)];if(entry.directory){if(live){await app.navigate(entry.path,tab);await renderView(state);}else await showView({kind:'live',path:entry.path,root:tab.initialRoot||tab.worldRoot});}else await app.openFile(entry.path,tab);});
      for(const [action,id] of [['copy','files-copy'],['cut','files-cut'],['paste','files-paste'],['rename','files-rename'],['trash','files-trash']])act(action,async()=>{await app.run(id);if(tab.initialView)await renderView(state);});
      act('layout',()=>{state.grid=!state.grid;return renderView(state);});
    }
    act('parent',async()=>{const boundary=tab.initialRoot||tab.worldRoot||home;if(tab.cwd!==boundary)await app.navigate(tab.cwd.slice(0,tab.cwd.lastIndexOf('/'))||'/',tab);await renderView(state);});
    act('leave-root',async()=>{await host.chroot(null);await renderView(state);});
    act('refresh',()=>renderView(state));act('new',()=>app.run(mobile?'mobile-create':'new-file'));
  }
  function scheduleViews() {clearTimeout(liveTimer);liveTimer=setTimeout(()=>{for(const state of views.values())if(state.tab===app.active()&&state.value.kind==='live')renderView(state).catch(showError);},150);}
  for(const event of ['focus','navigate','save','refresh'])app.on(event,scheduleViews);
  window.yhwh.on('directory-changed',scheduleViews);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleViews();});

  const dot=document.createElement('button');dot.id='initial-dot';dot.type='button';dot.textContent='·';dot.title='Initial · tap for commands, hold to draw';dot.setAttribute('aria-label','Open Initial');
  const commandButton=document.createElement('button');commandButton.id='initial-commands';commandButton.textContent='⌘';commandButton.type='button';commandButton.setAttribute('aria-label','Your Initial commands');commandButton.title='Your Initial commands';
  document.body.append(dot,commandButton);
  function applyDot(settings={}){dot.dataset.position=['center','left','right'].includes(settings.position)?settings.position:'center';dot.style.opacity=Math.max(0.25,Math.min(1,Number(settings.opacity)||0.6));}
  try{applyDot(JSON.parse(localStorage.getItem('yhwh:initial:dot')||'{}'));}catch{applyDot();}
  let held=false,holdTimer;
  dot.onpointerdown=event=>{held=false;holdTimer=setTimeout(()=>{held=true;draw(undefined,event).catch(showError);},230);};
  for(const event of ['pointerup','pointercancel'])dot.addEventListener(event,()=>clearTimeout(holdTimer));
  dot.onclick=guarded(()=>held?undefined:shelf());commandButton.onclick=guarded(shelf);
  async function draw(done,initialEvent) {
    if(!done)await refreshLibrary();drawDone=done;
    modal(done?'Teach me your mark':'Draw an Initial',`<p>${done?'Draw one continuous mark. It belongs to this Initial, in any alphabet.':'Draw a mark you trained, then tap its tile to run it. You can always use Commands instead.'}</p><canvas aria-label="Gesture sketch pad"></canvas><p data-match role="status"></p><div class="initial-tools">${buttons([['Clear','clear'],[done?'Use this gesture':'Match gesture','match'],['Commands','back']])}</div>`);
    dialog.classList.add('initial-drawing');
    dialog.addEventListener('close',()=>dialog.classList.remove('initial-drawing'),{once:true});
    const canvas=dialog.querySelector('canvas'),context=canvas.getContext('2d');let points=[],drawing=false;
    const box=canvas.getBoundingClientRect();canvas.width=box.width*devicePixelRatio;canvas.height=box.height*devicePixelRatio;context.scale(devicePixelRatio,devicePixelRatio);context.strokeStyle=getComputedStyle(document.documentElement).getPropertyValue('--purple')||'#b7a1ef';context.lineWidth=5;context.lineCap='round';context.lineJoin='round';
    const point=event=>{const rect=canvas.getBoundingClientRect();return[event.clientX-rect.left,event.clientY-rect.top];};
    canvas.onpointerdown=event=>{if(event.isPrimary===false)return;drawing=true;points=[point(event)];context.clearRect(0,0,canvas.width,canvas.height);context.beginPath();context.moveTo(...points[0]);canvas.setPointerCapture(event.pointerId);};
    canvas.onpointermove=event=>{if(!drawing)return;points.push(point(event));context.lineTo(...points.at(-1));context.stroke();};
    canvas.onpointerup=()=>{drawing=false;};canvas.onpointercancel=()=>{drawing=false;points=[];};
    // Holding the dot hands the current pointer to the full-screen sketch pad.
    if(initialEvent){drawing=true;points=[point(initialEvent)];context.beginPath();context.moveTo(...points[0]);try{canvas.setPointerCapture(initialEvent.pointerId);}catch{drawing=false;points=[];}}
    bind({clear:()=>{points=[];context.clearRect(0,0,canvas.width,canvas.height);dialog.querySelector('[data-match]').textContent='';},back:shelf,match:()=>{
      if(drawDone){drawDone(points);return;}
      const result=matchGesture(points,library.catalog().filter(item=>item.kind==='Initials'));
      const output=dialog.querySelector('[data-match]');
      if(!result){output.textContent='No familiar mark yet. Edit an Initial to train its gesture.';return;}
      output.innerHTML=result.ambiguous?'Two marks look alike. Choose from Commands, or retrain one.':`<button type="button" class="initial-match">${escape(result.alias.name)} · ${escape(result.alias.names.join(' · '))} · Run</button>`;
      output.querySelector('button')?.addEventListener('click',guarded(()=>execute(quote(result.alias.name))));
    }});
  }
  app.addCommand({id:'initial',name:'Initial · your mobile shell',run:shelf});
  app.addCommand({id:'initial-draw',name:'Draw an Initial',run:()=>draw()});
  app.addCommand({id:'initial-new',name:'New Initial alias',run:async()=>{await refreshLibrary();aliasEditor();}});
  app.addCommand({id:'initial-rc',name:'Initial · edit aliases file',run:openRC});
  return {...library,open:shelf,draw:()=>draw()};
}
