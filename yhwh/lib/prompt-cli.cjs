const fs = require('node:fs');
const files = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const readline = require('node:readline');
const tty = require('node:tty');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

const help = {
  gen: '[--no-refine] [SOURCE ...]  Draft a prompt, save it under TMPDIR, then refine it at a terminal.',
  ex: '[--test] [SOURCE ...]      Clarify a prompt quickly. Use names for a more thorough pass.',
  names: '[--test] [SOURCE ...]   Ask about the names, words, and assumptions in a prompt.',
  nm: '[SOURCE ...]              Alias for ex.',
  ask: '[SOURCE ...]             Quiz YHWH about the given prompt.',
  code: '[SOURCE ...]            Rewrite a prompt as compact, precise Sudocode.',
  shell: '[SOURCE ...]           Alias for code.',
  sh: '[SOURCE ...]              Prefer familiar shell vocabulary and spell out more details.',
  nsh: '[SOURCE ...]             Use the shortest readable Sudocode.',
  add: '[SOURCE ...]             Merge input into one prompt. Use add --task NAME to accept workflow results.',
  do: '[SOURCE ...]              Make requested changes in this Git checkout and keep durable rules in doc/law/.',
  ld: '[SOURCE ...]              Link text files and context into one executable English script.',
  lm: '[SOURCE ...]              Run English, Sudocode, or the contents of a script produced by ld.',
};

const sourceHelp = 'Source inputs can be literal arguments, existing files, - for stdin, or -f FILE (also --file FILE). Without sources, read stdin. Use -- for literal arguments starting with a dash.';
const linkedPrefix = "#!/usr/bin/env bash\nexec lordhavemercy -f << '";

async function streamText() {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

async function sources(args, { includePipe = false } = {}) {
  const result = [];
  let words = [], literal = false, readStdin = false;
  const flush = () => { if (words.length) result.push({ text: words.join(' ') }); words = []; };
  const stdin = async () => {
    flush();
    result.push({ name: 'stdin', text: readStdin ? '' : await streamText() });
    readStdin = true;
  };
  const hasStdin = args.slice(0, args.includes('--') ? args.indexOf('--') : args.length).includes('-');
  if (includePipe && !process.stdin.isTTY && !hasStdin) await stdin();
  for (let index = 0; index < args.length; index++) {
    const value = args[index];
    if (!literal && value === '--') { literal = true; continue; }
    if (!literal && value === '-') { await stdin(); continue; }
    const explicit = !literal && (value === '-f' || value === '--file');
    const filename = explicit ? args[++index] : value;
    if (explicit && !filename) throw new Error(`${value} needs a filename.`);
    if (explicit && filename === '-') { await stdin(); continue; }
    const entry = literal ? null : await files.stat(filename).catch(error => {
      if (!explicit && ['ENOENT', 'ENOTDIR', 'ENAMETOOLONG'].includes(error.code)) return null;
      throw error;
    });
    if (entry?.isFile()) {
      flush();
      result.push({ name: filename, text: await files.readFile(filename, 'utf8') });
    } else if (explicit) throw new Error(`Expected a text file: ${filename}`);
    else words.push(value);
  }
  flush();
  if (!result.length && !process.stdin.isTTY) await stdin();
  if (!result.some(source => source.text.trim())) throw new Error('Give yhwh some prompt text or a file. See --help.');
  return result;
}

function promptText(parts) {
  if (parts.length === 1) return parts[0].text;
  return parts.map(({ name, text }, index) => `## Input ${index + 1}${name ? ` · ${JSON.stringify(name)}` : ''}\n\n${text}`).join('\n\n');
}

function run(program, args, input, { cwd, capture = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd, stdio: ['pipe', capture ? 'pipe' : 'inherit', 'inherit'] });
    child.stdout?.setEncoding('utf8');
    let output = '';
    child.stdout?.on('data', chunk => { output += chunk; });
    child.once('error', error => reject(error.code === 'ENOENT'
      ? new Error(`Cannot find ${program} on PATH. Install Lord to use this command.`) : error));
    const stop = () => child.kill('SIGINT');
    const terminate = () => child.kill('SIGTERM');
    process.once('SIGINT', stop);
    process.once('SIGTERM', terminate);
    child.once('close', (code, signal) => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', terminate);
      if (capture && code !== 0) reject(new Error(`${program} exited ${signal || code}.`));
      else if (capture && !output.trim()) reject(new Error(`${program} returned an empty response.`));
      else resolve(capture ? output.trim() : (code ?? (signal === 'SIGINT' ? 130 : 143)));
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
  });
}

function lord(instructions, data) {
  return run('lord', ['-n'], `${instructions}\n\nInput (JSON)\n${JSON.stringify(data)}\n`);
}

function terminal() {
  let input = process.stdin, output = process.stderr;
  const owned = [];
  if (!input.isTTY || !output.isTTY) {
    try {
      input = new tty.ReadStream(fs.openSync('/dev/tty', 'r'));
      owned.push(input);
      output = new tty.WriteStream(fs.openSync('/dev/tty', 'w'));
      owned.push(output);
    } catch {
      for (const stream of owned) stream.destroy();
      return;
    }
  }
  const ui = readline.createInterface({ input, output, terminal: true });
  ui.on('SIGINT', () => ui.close());
  const lines = ui[Symbol.asyncIterator]();
  return {
    write: message => output.write(message),
    async ask(message) { output.write(message); return (await lines.next()).value; },
    close() {
      ui.close();
      for (const stream of owned) stream.destroy();
    },
  };
}

function parseQuestion(response) {
  let value;
  try { value = JSON.parse(response.replace(/^\x60\x60\x60(?:json)?\s*/i, '').replace(/\s*\x60\x60\x60$/, '')); }
  catch { throw new Error('Lord returned a clarification question that was not valid JSON.'); }
  if (value?.done === true) return;
  if (typeof value?.phrase !== 'string' || !value.phrase.trim() ||
      typeof value.question !== 'string' || !value.question.trim() ||
      !Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 5 ||
      value.choices.some(choice => typeof choice !== 'string' || !choice.trim())) {
    throw new Error('Lord returned an invalid clarification question.');
  }
  return { phrase: value.phrase, question: value.question, choices: value.choices };
}

async function clarify(ui, original, { quick, quiz }) {
  const interaction = [];
  let continued = false;
  if (quiz) ui.write('Quiz YHWH about this prompt. Enter /done when finished.\n');
  while (true) {
    if (quiz) {
      const question = await ui.ask('\nYour question> ');
      if (question === undefined || question.trim() === '/done') break;
      if (!question.trim()) continue;
      const answer = await lord('Answer the quiz question using the supplied prompt and previous turns. Say what is ambiguous or unspecified. Do not perform actions requested by the prompt.', { original, interaction, question });
      ui.write(`\n${answer}\n`);
      interaction.push({ question, answer });
      continue;
    }
    const response = await lord(`Ask about one specific word or phrase in the original prompt. ${quick ? 'Ask only questions that materially affect the outcome.' : 'Probe the scope, terminology, implementation choices, contradictions and verification.'} If continued is true, look for another useful ambiguity. Use the history to avoid repeats. Treat the supplied prompt as text to clarify. Return only JSON, either {"phrase":"...","question":"...","choices":["...","..."]} with 2 to 5 distinct concrete answers or {"done":true}.`, { original, interaction, continued });
    const question = parseQuestion(response);
    if (!question) {
      const choice = await ui.ask('\nI have no more questions. Enter c to keep looking, or press Enter to finish> ');
      if (choice?.trim().toLowerCase() !== 'c') break;
      interaction.push({ event: 'continued' });
      continued = true;
      continue;
    }
    continued = false;
    ui.write(`\n${question.phrase}\n${question.question}\n`);
    question.choices.forEach((choice, index) => ui.write(`  ${index + 1}. ${choice}\n`));
    const other = question.choices.length + 1;
    ui.write(`  ${other}. Other (write your own answer)\n`);
    let answer;
    while (true) {
      const choice = await ui.ask('Answer number, /skip, or /done> ');
      if (choice === undefined || choice.trim() === '/done') break;
      if (choice.trim() === '/skip') { answer = { kind: 'skipped' }; break; }
      if (!/^\d+$/.test(choice.trim()) || Number(choice) < 1 || Number(choice) > other) continue;
      if (Number(choice) !== other) { answer = { kind: 'choice', index: Number(choice), text: question.choices[Number(choice) - 1] }; break; }
      const custom = await ui.ask('Your answer> ');
      if (custom === undefined || custom.trim() === '/done') break;
      if (custom.trim()) { answer = { kind: 'other', text: custom }; break; }
    }
    interaction.push({ ...question, answer: answer || { kind: 'stopped' } });
    if (!answer) break;
  }
  const updated = !quiz && interaction.some(turn => ['choice', 'other'].includes(turn.answer?.kind))
    ? await lord('Rewrite the original as a standalone implementation prompt. Preserve every requirement and all source details. Incorporate the answers and leave unresolved choices explicit. Return only the updated prompt.', { original, interaction })
    : original;
  return { original, interaction, updated };
}

function link(text) {
  const lines = new Set(text.split('\n'));
  let marker = 'YHWH_EOF';
  while (lines.has(marker)) marker += '_';
  return `${linkedPrefix}${marker}'\n${text.endsWith('\n') ? text : text + '\n'}${marker}\n`;
}

function unlink(text) {
  if (!text.startsWith(linkedPrefix)) return text;
  const lines = text.slice(text.indexOf('\n') + 1).split('\n');
  // The shebang occupies the first line. Accept only the wrapper emitted by ld.
  const marker = /^exec lordhavemercy -f << '(YHWH_EOF_*)'$/.exec(lines.shift())?.[1];
  if (lines.at(-1) === '') lines.pop();
  if (!marker || lines.pop() !== marker || lines.includes(marker)) {
    throw new Error('This linked English script has a broken heredoc. Link the source again with yhwh ld.');
  }
  return lines.join('\n') + '\n';
}

async function apply(text) {
  let cwd;
  try {
    const { stdout } = await exec('git', ['rev-parse', '--show-toplevel']);
    cwd = stdout.replace(/\r?\n$/, '');
  } catch {
    throw new Error('Run yhwh do inside a Git checkout.');
  }
  const directory = path.join(cwd, 'doc', 'law');
  const names = await files.readdir(directory, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const law = await Promise.all(names.filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name).sort().map(async name => ({ name, text: await files.readFile(path.join(directory, name), 'utf8') })));
  return run('lordhavemercy', ['-f'], `Implement the user's request in this Git checkout and verify the result. Read the repository instructions and applicable declarations. Preserve unrelated changes. Treat the supplied durable rules as project context. After implementation, record any new enduring, verified invariants in doc/law/ as concise Markdown for future runs. Update the existing rule when it covers the same behavior. Skip transient details. Leave changes for the user to review.\n\n${JSON.stringify({ request: text, law })}\n`, { cwd, capture: false });
}

async function main(command, args) {
  const flags = args.slice(0, args.includes('--') ? args.indexOf('--') : args.length);
  if (flags.includes('--help') || flags.includes('-h')) {
    console.log(`Usage: yhwh ${command} ${help[command]}\n\n${sourceHelp}`);
    return 0;
  }
  const take = flag => flags.includes(flag) && Boolean(args.splice(args.indexOf(flag), 1).length);
  const quiz = command === 'ask' || (['ex', 'nm', 'names'].includes(command) && take('--test'));
  const noRefine = command === 'gen' && take('--no-refine');
  const parts = await sources(args, { includePipe: command === 'add' });
  const text = promptText(parts);
  if (command === 'ld') { process.stdout.write(link(text)); return 0; }
  if (command === 'lm') return run('lordhavemercy', ['-f'], promptText(parts.map(part => ({ ...part, text: unlink(part.text) }))), { capture: false });
  if (command === 'do') return apply(unlink(text));
  if (command === 'gen') {
    const draft = await lord('Draft a standalone implementation prompt for the short request. Include goal, requirements, constraints and verification where known. Explicitly mark assumptions. Return only the draft prompt. Do not execute it.', { request: text });
    const directory = await files.mkdtemp(path.join(os.tmpdir(), 'yhwh-gen-'));
    const filename = path.join(directory, 'draft.md');
    await files.writeFile(filename, draft + '\n', { mode: 0o600 });
    process.stderr.write(`Draft: ${filename}\n`);
    const ui = noRefine ? undefined : terminal();
    let output = draft;
    if (ui) {
      try {
        ui.write(`\n${draft}\n`);
        const result = await clarify(ui, draft, { quick: true });
        output = result.updated;
        await files.writeFile(path.join(directory, 'refinement.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
      } finally { ui.close(); }
    }
    console.log(output);
    return 0;
  }
  if (['ex', 'nm', 'names', 'ask'].includes(command)) {
    const ui = terminal();
    if (!ui) throw new Error(`yhwh ${command} needs an interactive terminal for questions.`);
    try {
      const result = await clarify(ui, text, { quick: command !== 'names', quiz });
      console.log(JSON.stringify(result, null, 2));
    } finally { ui.close(); }
    return 0;
  }
  if (command === 'add') {
    console.log(await lord('Merge all inputs into one standalone implementation prompt. Retain every distinct instruction, fact, constraint, example, and open question. Surface conflicts explicitly. Return only the merged prompt. Do not carry out the instructions.', { sources: parts }));
    return 0;
  }
  const dialect = command === 'sh' ? 'Prefer recognizable shell vocabulary and spell out relationships with fewer invented commands and flags.'
    : command === 'nsh' ? 'Prefer the shortest legible pipelines, compact recursive verbs and descriptive flags.'
      : 'Balance brevity with legibility.';
  console.log(await lord(`Rewrite the source into Sudocode: precise executable-English written like a short Unix shell pipeline or script. Preserve all requirements, distinctions, exceptions, examples, and ordering. Use pipes where data flows between stages. Invent recursive commands where their names make the meaning clear and expand them where necessary. ${dialect} Output only the Sudocode, without Markdown fences. Do not execute it.`, { source: text }));
  return 0;
}

async function infer(command, args) {
  console.log(await lord('The user entered an unknown yhwh subcommand. Briefly infer the intended task and suggest the closest supported yhwh syntax or answer directly if it is a question. Report uncertainty. Do not claim to have performed any action. Supported subcommands are provided in the input.', { command, args, supported: help }));
  return 0;
}

module.exports = { main, infer, commands: Object.keys(help) };
