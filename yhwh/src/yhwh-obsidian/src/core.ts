import defaults from '../../../etc/obsidian/defaults.json';
import copy from '../../../etc/obsidian/copy.json';
export const COPY = copy;
export type CopyKey = keyof typeof COPY;
export interface Settings {
  energy: number;
  accent: string;
  title: string;
  bg: string;
  followActive: boolean;
  autoOpen: boolean;
  folder: string;
  copy: Record<CopyKey, string>;
}
export const DEFAULTS: Settings = { ...defaults, copy: { ...COPY } };
export function settings(data: Partial<Settings> | null): Settings {
  return { ...DEFAULTS, ...data, energy: energy(data?.energy ?? 100),
    copy: Object.fromEntries(Object.entries(COPY).map(([k, v]) =>
      [k, typeof data?.copy?.[k as CopyKey] === 'string' ? data.copy[k as CopyKey] : v])) as Settings['copy'] };
}
export function energy(value: number): number { return value < 25 ? 0 : value < 75 ? 50 : 100; }
export function mode(value: number): string { return value === 0 ? 'dawkins' : value === 50 ? 'nietzsche' : 'yhwh'; }
export function parent(path: string): string { return path.split('/').slice(0, -1).join('/'); }

/** Paths are vault-relative; attempting to leave the vault is an error. */
export function resolvePath(cwd: string, input = ''): string {
  const parts = input.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
  if (input.includes('\\') || /[\x00-\x1f]/.test(input)) throw new Error('Use a vault path with forward slashes.');
  for (const part of input.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (!parts.length) throw new Error('Already at the vault root.');
      parts.pop();
    } else parts.push(part);
  }
  return parts.join('/');
}
export function ancestors(path: string): string[] {
  const out = [''];
  for (const part of path.split('/').filter(Boolean)) out.push([out.at(-1), part].filter(Boolean).join('/'));
  return out;
}
export function within(path: string, scope: string): boolean {
  return !scope || path === scope || path.startsWith(scope + '/');
}

/** A command line, not a shell: quotes group arguments; no code is evaluated. */
export function words(line: string): string[] {
  const out: string[] = [];
  let word = '', quote = '', escaped = false, started = false;
  for (const ch of line.trim()) {
    if (escaped) { word += ch; escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; started = true; continue; }
    if (quote) { if (ch === quote) quote = ''; else word += ch; }
    else if (ch === '"' || ch === "'") { quote = ch; started = true; }
    else if (/\s/.test(ch)) { if (started) out.push(word); word = ''; started = false; }
    else { word += ch; started = true; }
  }
  if (quote || escaped) throw new Error('Unclosed quote or trailing escape.');
  if (started) out.push(word);
  return out;
}
type Overrides = Partial<Pick<Settings, 'energy' | 'accent' | 'title' | 'bg' | 'followActive'>>;
export function config(text: string, directory: string, current: string): { values: Overrides; errors: string[] } {
  const values: Overrides = {}, errors: string[] = [];
  let applies = false, hasScope = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    try {
      if (!/^\s/.test(line)) {
        applies = false; hasScope = false;
        const scope = words(comment(line));
        if (scope.length !== 1 || /[$`;|&<>]/.test(scope[0])) throw new Error('Expected one literal vault path. Quote paths with spaces.');
        applies = within(current, resolvePath(directory, scope[0]));
        hasScope = true;
        return;
      }
      if (!hasScope) throw new Error('Put a vault path before its assignments.');
      const match = comment(line).trim().match(/^([a-zA-Z_]+)=(.*)$/);
      if (!match) throw new Error('Expected an indented key=value assignment.');
      const [, key, raw] = match;
      if (/[$`]/.test(raw)) throw new Error('Shell expansion is unavailable in an Obsidian plugin.');
      const parsed = words(raw);
      if (parsed.length > 1) throw new Error('Quote values containing spaces.');
      const value = parsed[0] ?? '';
      const put = (k: keyof Overrides, v: string | number | boolean) => { if (applies) Object.assign(values, { [k]: v }); };
      if (key === 'energy') {
        if (!['0', '50', '100'].includes(value)) throw new Error('energy must be 0, 50 or 100.');
        put('energy', Number(value));
      } else if (key === 'mode') {
        if (!['yhwh', 'nietzsche', 'dawkins'].includes(value)) throw new Error('Unknown mode.');
        put('energy', value === 'yhwh' ? 100 : value === 'nietzsche' ? 50 : 0);
      } else if (key === 'accent') {
        if (!/^#[\da-f]{6}$/i.test(value)) throw new Error('accent must be a six-digit hex color.');
        put('accent', value);
      } else if (key === 'title') put('title', value);
      else if (key === 'bg') put('bg', value ? resolvePath(directory, value) : '');
      else if (key === 'follow_active') {
        if (!['true', 'false'].includes(value)) throw new Error('follow_active must be true or false.');
        put('followActive', value === 'true');
      } else throw new Error(`Unsupported setting: ${key}`);
    } catch (e) { errors.push(`Line ${i + 1}: ${(e as Error).message}`); }
  });
  return { values, errors };
}

function comment(line: string): string {
  let quote = '', escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ''; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i);
  }
  return line;
}

export const TEXT_EXTENSIONS = new Set('txt json jsonc js mjs cjs ts tsx jsx css html htm xml svg yaml yml toml ini conf cfg csv tsv sh bash zsh fish py rb rs go c h cpp hpp java sql tex bib log diff patch makefile r lua pl php svelte vue'.split(' '));
export function isText(name: string, bytes: ArrayBuffer): boolean {
  if (bytes.byteLength > 2_000_000) return false;
  const data = new Uint8Array(bytes);
  if (data.some(n => n === 0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(data); } catch { return false; }
  if (TEXT_EXTENSIONS.has(name.split('.').at(-1)!.toLowerCase())) return true;
  // Unknown extensions can still contain ordinary text. Don't infer Markdown.
  return !data.some(n => n < 32 && ![9, 10, 12, 13].includes(n));
}

export function circusPair(html: string): { image: string; quote: string; permalink: string } {
  // PageSpeed injects a script before the comic for browser user agents.
  // Removing scripts also keeps them out of extracted quote text.
  html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const image = html.match(/class="comic"[^>]*>\s*<img[^>]+src="(\/img\/\d+\.(?:gif|png|jpg))"/i)?.[1];
  const quote = html.match(/class="quote"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
  const link = html.match(/href="(\/perm\.php\?c=\d+(?:&amp;|&)q=\d+)"/i)?.[1];
  if (!image || !quote || !link) throw new Error('The Circus changed its page format. Open the original site.');
  const decode = (text: string) => text.replace(/<[^>]*>/g, '').replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[\da-f]+);/gi, entity => {
    const named: Record<string, string> = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity]) return named[entity];
    const n = entity.startsWith('&#x') ? parseInt(entity.slice(3), 16) : parseInt(entity.slice(2), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : entity;
  }).trim();
  return { image: 'https://nietzschefamilycircus.com' + image, quote: decode(quote), permalink: 'https://nietzschefamilycircus.com' + decode(link) };
}
