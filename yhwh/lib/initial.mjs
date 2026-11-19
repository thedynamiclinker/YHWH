// The Initial is an in-app shell. It never evaluates JavaScript or spawns a process.
export const alphabets = {
  Latin: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map(letter => [letter, letter.toLowerCase()]),
  Greek: [...'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'].map((letter, i) => [letter, 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega'.split(' ')[i]]),
  Hebrew: [...'אבגדהוזחטיכלמנסעפצקרשת'].map((letter, i) => [letter, 'aleph bet gimel dalet he vav zayin het tet yod kaf lamed mem nun samekh ayin pe tsadi qof resh shin tav'.split(' ')[i]]),
  Paleo: Array.from({ length: 22 }, (_, i) => [String.fromCodePoint(0x10900 + i), 'aleph bet gimel dalet he waw zayin het tet yod kap lamed mem nun semk ayin pe sade qop rosh shin tau'.split(' ')[i]]),
};
export const transliteration = glyph => Object.values(alphabets).flat().find(([letter]) => letter === glyph)?.[1] || ({ 愛: 'ai' })[glyph] || glyph;
export const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
export const asText = value => value?.kind === 'entries' ? value.entries.map(entry => entry.path).join('\n') : value?.text || '';
const text = value => ({ kind: 'text', text: String(value ?? '') });
const nameOK = name => typeof name === 'string' && name.length > 0 && name.length < 100 && !/[\s/\\\0|;<>$'"#]/u.test(name);
export const atomics = [
  ['pwd', 'Where am I?', 'pwd', 'Print the current folder.'],
  ['ls', 'List files', 'ls [folder]', 'Produce a fixed list of files. Pipe to view to browse it.'],
  ['cd', 'Change folder', 'cd [folder]', 'Go to a folder; no argument returns home.'],
  ['mkdir', 'New folder', 'mkdir name', 'Create a folder without replacing anything.'],
  ['touch', 'New file', 'touch name', 'Create an empty file if it does not exist.'],
  ['cat', 'Read text', 'cat [file…]', 'Read saved UTF-8 text or pass input through.'],
  ['echo', 'Say something', 'echo [text…]', 'Produce text.'],
  ['cp', 'Copy', 'cp source destination', 'Copy a file or folder to a new path.'],
  ['mv', 'Move', 'mv source destination', 'Move or rename to a new path.'],
  ['trash', 'Move to Trash', 'trash path', 'Move into recoverable Trash.'],
  ['grep', 'Keep matching lines', 'grep text', 'Filter incoming files by name, or text by line.'],
  ['sort', 'Sort', 'sort', 'Sort incoming files or lines alphabetically.'],
  ['head', 'First few', 'head [count]', 'Keep the first ten files or lines, or choose a count.'],
  ['wc', 'Count', 'wc', 'Count incoming files or nonempty lines.'],
  ['view', 'View output', 'ls | view', 'Open a fixed graphical result in its own tab.'],
  ['fm', 'File manager', 'fm [folder]', 'Open a live file-manager tab that follows folder changes.'],
  ['open', 'Open document', 'open path', 'Open a document in the shared editor or viewer.'],
  ['chroot', 'Make this folder /', 'chroot [folder]', 'Limit this tab’s file navigation to a folder. chroot --leave restores the workspace. This is a view, not OS security.'],
  ['help', 'Command guide', 'help [command]', 'Read a command’s manual. man is the same command.'],
];
export const defaultRC = `# Your Letters. Ordinary text; reload after editing.
# alias NAME 'command'; names NAME 'search name'…; gesture NAME '[[x,y],…]'
alias Γ '/bin/ls'
names Γ 'gamma'
alias Ꞁ '/bin/sort'
names Ꞁ 'dalet'
alias L "/bin/echo 'Logos Demos'"
names L 'ell'
alias ᒧ '/bin/cat'
names ᒧ 'mo' '⅃'
`;
export const firstLogo = { name: 'demos', source: 'Γ | Ꞁ\nL | ⅃', cells: { 0: 'Γ', 1: 'Ꞁ', 5: 'L', 6: '⅃' } };

// Tokens preserve quotes/substitutions until argument expansion. Syntax is deliberately small.
export function tokenize(source) {
  if (source.length > 64000) throw new Error('Keep a Word below 64,000 characters.');
  const tokens = []; let word = '', started = false, quoting = '', depth = 0;
  const flush = () => { if (started) tokens.push({ word }); word = ''; started = false; };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '\\' && quoting !== "'") { if (++i >= source.length) throw new Error('Finish the escaped character.'); word += '\\' + source[i]; started = true; continue; }
    if (quoting) { word += c; if (c === quoting) quoting = ''; continue; }
    if (c === "'" || c === '"') { word += c; started = true; quoting = c; continue; }
    if (c === '$' && source[i+1] === '(') { word += '$('; i++; depth++; started = true; continue; }
    if (depth) { word += c; if (c === '(') depth++; if (c === ')') depth--; continue; }
    if (c === '#' && !started) { while (i < source.length && source[i] !== '\n') i++; flush(); tokens.push(';'); continue; }
    if (/[\n;|<>]/.test(c)) { flush(); if (c === '>' && source[i+1] === '>') { tokens.push('>>'); i++; } else tokens.push(c === '\n' ? ';' : c); }
    else if (/\s/.test(c)) flush();
    else { word += c; started = true; }
  }
  if (quoting || depth) throw new Error('Close the quote or $() first.');
  flush(); return tokens;
}
function literal(raw) {
  let result = '', quoting = '';
  for (let i=0; i<raw.length; i++) {
    const c=raw[i];
    if (c === '\\' && quoting !== "'") result += raw[++i];
    else if (c === quoting) quoting = '';
    else if (!quoting && (c === "'" || c === '"')) quoting = c;
    else result += c;
  }
  return result;
}
export function parseRC(source) {
  const aliases = [];
  for (const [i, line] of source.split('\n').entries()) {
    const tokens = tokenize(line); if (!tokens.length || tokens[0] === ';') continue;
    if (tokens.some(token => typeof token === 'string')) throw new Error(`.initialrc line ${i+1}: use one setting per line.`);
    const [kind, name, ...values] = tokens.map(token => literal(token.word));
    if (!nameOK(name) || !['alias', 'names', 'gesture'].includes(kind)) throw new Error(`.initialrc line ${i+1}: expected alias, names or gesture.`);
    if (kind === 'alias') {
      if (values.length !== 1 || aliases.some(alias => alias.name === name)) throw new Error(`.initialrc line ${i+1}: each alias needs one unique name and a quoted command.`);
      aliases.push({ name, script: values[0], names: [transliteration(name)] });
    } else {
      const alias = aliases.find(alias => alias.name === name); if (!alias) throw new Error(`Define alias ${name} before ${kind}.`);
      if (kind === 'names') alias.names = values;
      else { const points = JSON.parse(values[0]); if (!Array.isArray(points) || points.length < 4 || points.length > 512 || points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(n => !Number.isFinite(n)))) throw new Error('Invalid gesture. Draw it again.'); alias.gesture = points; }
    }
  }
  const used = new Set();
  for (const alias of aliases) for (const name of new Set([alias.name, ...alias.names])) {
    if (!nameOK(name) || used.has(name)) throw new Error(`The name ${name} is already used or contains command punctuation.`);
    used.add(name);
  }
  return aliases;
}
export function printRC(aliases) {
  return '# Your Letters · reload after editing this ordinary text file.\n' + aliases.map(alias => `alias ${quote(alias.name)} ${quote(alias.script)}\nnames ${quote(alias.name)} ${alias.names.map(quote).join(' ')}\n${alias.gesture ? `gesture ${quote(alias.name)} ${quote(JSON.stringify(alias.gesture))}\n` : ''}`).join('');
}
export function resolvePath(input, cwd, home, root) {
  input = input === '~' ? home : input.startsWith('~/') ? home + input.slice(1) : input;
  let path = input.startsWith('/') ? input : `${cwd}/${input}`;
  if (root && input.startsWith('/') && input !== root && !input.startsWith(root + '/')) path = root + input;
  const parts = [];
  for (const piece of path.split('/')) { if (piece === '..') parts.pop(); else if (piece && piece !== '.') parts.push(piece); }
  const result = '/' + parts.join('/');
  if (root && result !== root && !result.startsWith(root + '/')) throw new Error('That path leaves this folder root. Use chroot --leave first.');
  if (result.includes('\0') || result.includes('\\')) throw new Error('Invalid path.');
  return result;
}
export function createInitial(host) {
  let aliases = [], words = [], rcVersion, initialized = false, writing = Promise.resolve();
  const home = host.home, rcPath = `${home.replace(/\/$/, '')}/.initialrc`, bin = `${home.replace(/\/$/, '')}/bin`;
  const requireRun = action => { throw new Error(`Use Run to ${action}.`); };
  const maybeRead = async path => { try { return await host.read(path); } catch (error) { if (/ENOENT|not found|does not exist/i.test(error.message)) return null; throw error; } };
  async function reload() {
    const rc = await maybeRead(rcPath);
    aliases = parseRC(rc?.content ?? defaultRC); rcVersion = rc?.modified;
    try { words = (await host.list(bin)).filter(entry => !entry.directory && !entry.name.startsWith('.')); }
    catch (error) { if (!/ENOENT|not found|does not exist/i.test(error.message)) throw error; words = []; }
    initialized = true;
  }
  const mutation = fn => { const result = writing.then(fn); writing = result.catch(() => {}); return result; };
  async function saveAlias(alias, previous) {
    return mutation(async () => {
      if (!initialized) await reload();
      if (!nameOK(alias.name)) throw new Error('Choose a name without spaces, slashes or command punctuation.');
      const next = aliases.filter(item => item.name !== previous);
      if (next.some(item => item.name === alias.name)) throw new Error('That Letter already exists.');
      next.push({ ...alias, names: alias.names?.filter(Boolean) || [transliteration(alias.name)] });
      const content = printRC(next); parseRC(content);
      if (rcVersion == null) { await host.create(rcPath, false); const file = await host.read(rcPath); rcVersion = file.modified; }
      const result = await host.save(rcPath, content, rcVersion); rcVersion = result.modified; aliases = next;
    });
  }
  async function removeAlias(name) {
    return mutation(async () => { if(rcVersion == null) { await host.create(rcPath,false);rcVersion=(await host.read(rcPath)).modified; } const next = aliases.filter(alias => alias.name !== name); const result = await host.save(rcPath, printRC(next), rcVersion); rcVersion = result.modified; aliases = next; });
  }
  async function saveWord(name, script, modified) {
    if (!nameOK(name)) throw new Error('A Logos name is its file basename. Choose one without spaces or slashes.');
    tokenize(script);
    return mutation(async () => {
      try { const stat = await host.stat(bin); if (!stat.directory) throw new Error('~/bin must be a folder.'); }
      catch (error) { if (!/ENOENT|not found|does not exist/i.test(error.message)) throw error; await host.create(bin, true); }
      const path = `${bin}/${name}`;
      if (modified == null) { await host.create(path, false); modified = (await host.read(path)).modified; }
      await host.save(path, script, modified); await reload(); return path;
    });
  }
  function catalog() {
    return [...aliases.map(alias => ({ ...alias, kind: 'Initials', label: alias.names.join(' · '), detail: alias.script })),
      ...words.map(word => ({ name: word.name, kind: 'Words', label: '~/bin/' + word.name, detail: 'Your reusable script', path: word.path })),
      ...(!words.some(word => word.name === firstLogo.name) ? [{ name: firstLogo.name, kind: 'Words', label: '~/bin/' + firstLogo.name, detail: 'Let there be Logos', sample: true }] : []),
      ...atomics.map(([name, label, usage, detail]) => ({ name, label, usage, detail, kind: 'Atomics' })),
      ...host.builtins().map(item => ({ name: item.id, label: item.name, detail: 'An action already in YHWH', kind: 'Builtins' }))];
  }
  function help(name) {
    const item = catalog().find(item => item.name === name || item.names?.includes(name));
    if (!item) throw new Error(`No command named ${name}. Browse the command shelf.`);
    return `${item.name} · ${item.label}\n${item.usage || item.script || item.path || item.name}\n\n${item.detail}\n${item.kind === 'Initials' ? 'Letter · ~/.initialrc' : item.kind === 'Words' ? 'Logos · ~/bin' : item.kind === 'Atomics' ? 'Atomic · /bin' : 'Builtin · /usr/bin'}`;
  }
  async function run(source, options = {}) {
    if (!initialized) await reload();
    const context = { cwd: host.cwd(), root: host.root?.(), stack: [], budget: { remaining: 200 }, args: [], ...options };
    return execute(source, context);
  }
  async function expand(raw, context) {
    let value = '', quoting = '';
    for (let i=0; i<raw.length; i++) {
      const c=raw[i];
      if (c === '\\' && quoting !== "'") { value += raw[++i]; continue; }
      if (c === quoting) { quoting = ''; continue; }
      if (!quoting && (c === "'" || c === '"')) { quoting = c; continue; }
      if (c === '$' && quoting !== "'") {
        if (raw[i+1] === '(') {
          let end=i+2, depth=1, q='';
          for (; end<raw.length; end++) { const d=raw[end]; if (d === '\\' && q !== "'") { end++; continue; } if (q) { if (d===q) q=''; } else if (d === "'" || d === '"') q=d; else if (d === '(') depth++; else if (d === ')' && --depth===0) break; }
          if (depth) throw new Error('Close $() first.');
          value += asText(await execute(raw.slice(i+2,end), { ...context, depth: (context.depth || 0) + 1, capture: true, args: context.args } )).replace(/\n+$/, ''); i=end; continue;
        }
        const variable=raw.slice(i+1).match(/^(HOME|PWD|PATH|@|[1-9])/);
        if (variable) { const name=variable[0]; value += name==='HOME' ? home : name==='PWD' ? context.cwd : name==='PATH' ? '~/bin:/bin:/usr/bin' : name==='@' ? context.args.join(' ') : context.args[Number(name)-1] || ''; i+=name.length; continue; }
      }
      value += c;
    }
    return value;
  }
  async function execute(source, context, incoming = text('')) {
    if ((context.depth || 0) > 12) throw new Error('Too many nested substitutions.');
    const tokens = tokenize(source), pipelines = []; let pipeline = [], stage = [];
    const finishStage = () => { if (!stage.length) throw new Error('Choose a command on both sides of |.'); pipeline.push(stage); stage=[]; };
    for (const token of tokens) {
      if (token === '|') finishStage();
      else if (token === ';') { if (stage.length) finishStage(); else if (pipeline.length) throw new Error('Choose a command after |.'); if (pipeline.length) pipelines.push(pipeline); pipeline=[]; }
      else stage.push(token);
    }
    if (stage.length) finishStage(); else if (pipeline.length) throw new Error('Choose a command after |.');
    if (pipeline.length) pipelines.push(pipeline);
    let result=text('');
    const output = [];
    for (const chain of pipelines) {
      let input=incoming;
      for (const stage of chain) {
        if (--context.budget.remaining < 0) throw new Error('This Logos ran more than 200 commands. Check for a loop.');
        let outputPath, append=false; const argv=[];
        for (let i=0; i<stage.length; i++) {
          const token=stage[i];
          if (typeof token === 'string') {
            if (!stage[i+1]?.word || ['>', '>>'].includes(token) && outputPath) throw new Error('Choose one file after a redirect.');
            const path=resolvePath(await expand(stage[++i].word, context), context.cwd, home, context.root);
            if (token === '<') { const file=await host.read(path); if (file.kind !== 'text') throw new Error('Read a text file for input.'); input=text(file.content); }
            else { outputPath=path; append=token==='>>'; }
          } else argv.push(await expand(token.word, context));
        }
        if (!argv.length || !argv[0]) throw new Error('Choose a command first.');
        if (context.preview && outputPath) requireRun('write redirected output');
        input=await command(argv, input, context);
        if (outputPath) {
          let file=await maybeRead(outputPath);
          if (!file) { await host.create(outputPath, false); file=await host.read(outputPath); }
          if (file.kind !== 'text') throw new Error('Redirect to a text file.');
          await host.save(outputPath, (append ? file.content : '') + asText(input), file.modified); input=text('');
        }
      }
      result=input;
      if (context.collectOutput && asText(input)) output.push(input);
    }
    if (output.length > 1) return text(output.map(asText).join('\n'));
    return output[0] || result;
  }
  async function command([name, ...args], input, context) {
    const atomicPath=name.startsWith('/bin/');
    if (atomicPath) name=name.slice(5);
    if (name === 'man') name='help';
    if (args.includes('--help')) return text(help(name));
    const path = value => resolvePath(value, context.cwd, home, context.root);
    const matchesAlias = alias => alias.name === name || alias.names.includes(name);
    const alias = !atomicPath && (aliases.find(matchesAlias) || context.tutorialLetters?.find(matchesAlias));
    const namedWord = word => word.name === name || name === `~/bin/${word.name}` || name === `${bin}/${word.name}`;
    const word = !atomicPath && words.find(namedWord);
    const sample = !atomicPath && !word && namedWord(firstLogo);
    if (alias || word || sample) {
      if (context.stack.includes(name) || context.stack.length >= 16) throw new Error(`Recursive Logos or Letter: ${[...context.stack, name].join(' → ')}`);
      const file = word && !alias ? await host.read(word.path) : null;
      const script = alias ? alias.script : sample ? firstLogo.source : file?.content;
      if (typeof script !== 'string') throw new Error('Logos must contain UTF-8 text.');
      if (/^#!(?!initial(?:\s|$))/.test(script)) throw new Error('This file names a native interpreter. Run it in the desktop terminal; Logos use #!initial or plain in-app commands.');
      const nested = { ...context, args, stack: [...context.stack,name] };
      if (sample && !alias) nested.tutorialLetters = parseRC(defaultRC);
      const result = await execute(script + (alias && args.length ? ' ' + args.map(quote).join(' ') : ''), nested, input);
      context.cwd=nested.cwd; context.root=nested.root; return result;
    }
    const requireArgs = count => { if (args.length < count) throw new Error(`Choose ${count} argument${count===1?'':'s'} for ${name}. ${help(name).split('\n')[1]}`); };
    if (context.preview && ['mkdir', 'touch', 'cp', 'mv', 'trash'].includes(name)) requireRun(`execute ${name}`);
    if (name==='pwd') return text(context.root ? context.cwd.slice(context.root.length) || '/' : context.cwd);
    if (name==='echo') return text(args.join(' '));
    if (name==='ls') return { kind: 'entries', entries: await host.list(path(args[0] || '.')) };
    if (name==='cd') { const target=path(args[0] || context.root || home); const stat=await host.stat(target); if (!stat.directory) throw new Error('Choose a folder.'); context.cwd=target; if (!context.capture && !context.preview) await host.navigate(target); return text(target); }
    if (name==='mkdir' || name==='touch') { requireArgs(1); const target=path(args[0]); if (name==='touch') { try { await host.stat(target); return text(target); } catch(error) { if (!/ENOENT|not found|does not exist/i.test(error.message)) throw error; } } await host.create(target,name==='mkdir'); return text(target); }
    if (name==='cat') { if (!args.length) return input; const contents=[]; for (const arg of args) { const file=await host.read(path(arg)); if (file.kind !== 'text') throw new Error('cat reads saved UTF-8 text. Use open for other formats.'); contents.push(file.content); } return text(contents.join('\n')); }
    if (name==='cp' || name==='mv') { requireArgs(2); await host[name==='cp'?'copy':'move'](path(args[0]),path(args[1])); return text(path(args[1])); }
    if (name==='trash') { requireArgs(1); await host.trash(path(args[0])); return text('Moved to Trash.'); }
    if (name==='grep' || name==='sort' || name==='head') {
      if (name==='grep') requireArgs(1);
      const limit=args[0] == null ? 10 : Number(args[0]); if (name==='head' && (!Number.isInteger(limit) || limit<0)) throw new Error('Choose a nonnegative whole count.');
      const filter = rows => name==='grep' ? rows.filter(row => row.toLocaleLowerCase().includes(args[0].toLocaleLowerCase())) : name==='sort' ? [...rows].sort((a,b)=>a.localeCompare(b)) : rows.slice(0,limit);
      if (input.kind==='entries') { const names=filter(input.entries.map(entry=>entry.path)); return { kind:'entries', entries:names.map(name=>input.entries.find(entry=>entry.path===name)) }; }
      return text(filter(asText(input).split('\n')).join('\n'));
    }
    if (name==='wc') return text(input.kind==='entries' ? input.entries.length : asText(input).split('\n').filter(Boolean).length);
    if (name==='view' || name==='fm') { if (context.capture) throw new Error('Choose a command with output inside $(), such as pwd or cat.'); const target=path(args[0] || '.'); if (name==='fm' && !(await host.stat(target)).directory) throw new Error('Choose a folder.'); await (context.display?.view || host.view)(name==='fm' ? { kind:'live', path:target, root:context.root } : { ...input, kind:input.kind==='entries'?'snapshot':'text', root:context.root }); return {kind:'displayed',text:''}; }
    if (name==='open') { requireArgs(1); if (context.capture) throw new Error('open displays a document; use cat inside $().'); await (context.display?.open || host.open)(path(args[0])); return text(''); }
    if (name==='chroot') { if (context.capture) throw new Error('Change the folder root outside $().'); const target=args[0]==='--leave'?null:path(args[0] || '.'); if (target && !(await host.stat(target)).directory) throw new Error('Choose a folder.'); if (!context.preview) await host.chroot(target); context.root=target; context.cwd=target || home; return text(target ? 'This folder is now /. Use chroot --leave to return.' : 'Returned to the workspace.'); }
    if (name==='help') return text(args[0] ? help(args[0]) : 'The Initial · a terminal for fingers.\nTap tiles, type names, or draw your own gestures.\nLetters live in ~/.initialrc. Logos are files in ~/bin.\nPATH: ~/bin → /bin Atomics → /usr/bin Builtins.\nUse | to pass output, a new line to do the next thing, > to save output, and $() to use output as an argument.\n\n' + atomics.map(([name,label])=>`${name} — ${label}`).join('\n'));
    const builtin=host.builtins().find(item=>item.id===name || `/usr/bin/${item.id}`===name);
    if (builtin) { if (context.capture) throw new Error('App actions do not produce text for $().'); if (context.preview) requireRun(`open ${builtin.name}`); await (context.display?.builtin ? context.display.builtin(builtin) : builtin.run()); return text(''); }
    throw new Error(`No command named “${name}”. Browse Atomics, Builtins, Letters or Logos.`);
  }
  return { reload, catalog, run, saveAlias, removeAlias, saveWord, help, home, rcPath, bin, readWord: name => host.read(`${bin}/${name}`) };
}

// Resample normalized paths so gestures are independent of screen size and speed.
export function normalizeGesture(points) {
  if (points.length < 4) throw new Error('Draw a little more of the gesture.');
  const lengths=[0]; for (let i=1;i<points.length;i++) lengths.push(lengths.at(-1)+Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]));
  if (lengths.at(-1)<16) throw new Error('Draw a larger gesture.');
  const sampled=[]; let cursor=1;
  for (let i=0;i<48;i++) { const at=lengths.at(-1)*i/47; while (cursor<points.length-1 && lengths[cursor]<at) cursor++; const factor=(at-lengths[cursor-1])/(lengths[cursor]-lengths[cursor-1] || 1); sampled.push(points[cursor-1].map((n,j)=>n+factor*(points[cursor][j]-n))); }
  const xs=sampled.map(point=>point[0]), ys=sampled.map(point=>point[1]);
  const minX=Math.min(...xs), minY=Math.min(...ys), scale=Math.max(Math.max(...xs)-minX,Math.max(...ys)-minY,1);
  return sampled.map(([x,y])=>[(x-minX)/scale,(y-minY)/scale]);
}
export function matchGesture(points, aliases) {
  const drawn=normalizeGesture(points);
  const scores=aliases.filter(alias=>alias.gesture?.length===48).map(alias=>({alias,score:drawn.reduce((sum,point,i)=>sum+Math.hypot(point[0]-alias.gesture[i][0],point[1]-alias.gesture[i][1]),0)/48})).sort((a,b)=>a.score-b.score);
  if (!scores.length || scores[0].score>0.19) return null;
  // Similar gestures require a deliberate tile choice, never an arbitrary action.
  return { alias:scores[0].alias, ambiguous:scores[1] && scores[1].score-scores[0].score<0.055 };
}
