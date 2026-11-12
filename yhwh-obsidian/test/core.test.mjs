import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const compiled = await build({ entryPoints: [new URL('../src/core.ts', import.meta.url).pathname], bundle: true, format: 'esm', write: false });
const core = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const { resolvePath, parent, ancestors, config, words, isText, settings } = core;

test('vault paths navigate naturally without escaping the vault', () => {
  assert.equal(resolvePath('Books/Draft', '../Notes/a.md'), 'Books/Notes/a.md');
  assert.equal(resolvePath('Books/Draft', '/Other/./a.md'), 'Other/a.md');
  assert.equal(resolvePath('Books', '..'), '');
  assert.equal(parent(''), '');
  assert.throws(() => resolvePath('', '..'), /vault root/);
  assert.throws(() => resolvePath('', '/a/../../secret'), /vault root/);
  assert.throws(() => resolvePath('', 'a\\b'), /forward slashes/);
  assert.deepEqual(ancestors('Books/Draft'), ['', 'Books', 'Books/Draft']);
});
test('command arguments preserve quoted paths, apostrophes, escapes and empty arguments', () => {
  assert.deepEqual(words('open "some folder/a.md"'), ['open', 'some folder/a.md']);
  assert.deepEqual(words("mv 'a b' c\\ d"), ['mv', 'a b', 'c d']);
  assert.deepEqual(words('new ""'), ['new', '']);
  assert.deepEqual(words('cat "God\'s notes.md"'), ['cat', "God's notes.md"]);
  assert.throws(() => words('open "unfinished'), /Unclosed quote/);
});
test('folder configuration uses path boundaries and source order', () => {
  const rc = '/\n    energy=100\n    title="Default # title" # outside comment\n/Books\n    mode=nietzsche\n/Bookstore\n    mode=dawkins';
  assert.deepEqual(config(rc, '', 'Books/Draft'), { values: { energy: 50, title: 'Default # title' }, errors: [] });
  assert.equal(config(rc, '', 'Bookstore').values.energy, 0);
  assert.equal(config(rc, '', 'Bookshelf').values.energy, 100);
});
test('local configuration resolves scopes and backgrounds from the containing directory', () => {
  const rc = '.\n    accent="#aabbcc"\n    bg="images/sky.png"\nDraft\n    title="Let there be words"\n    follow_active=false';
  const result = config(rc, 'Books', 'Books/Draft');
  assert.deepEqual(result, { values: { accent: '#aabbcc', bg: 'Books/images/sky.png', title: 'Let there be words', followActive: false }, errors: [] });
});
test('configuration reports shell code, traversal and malformed values without executing them', () => {
  const result = config('/\n    title="$(touch /tmp/never-run)"\n    accent=blue\n    energy=72\n    unknown=true\n    follow_active=maybe\n../../etc\n    title=no', '', '');
  assert.equal(result.errors.length, 7);
  assert.deepEqual(result.values, {});
  assert.match(result.errors.join('\n'), /Shell expansion/);
  assert.match(config('    energy=50', '', '').errors[0], /vault path/);
});
test('text sniffing accepts scripts and unusual text extensions, rejecting binary and large files', () => {
  const bytes = s => new TextEncoder().encode(s).buffer;
  assert.equal(isText('boop', bytes('#!/bin/sh\necho hello')), true);
  assert.equal(isText('new.invented', bytes('Hello, world.')), true);
  assert.equal(isText('draft.json', bytes('{"a": 1}')), true);
  assert.equal(isText('looks.txt', new Uint8Array([72, 0, 73]).buffer), false);
  assert.equal(isText('looks.txt', new Uint8Array([255, 254]).buffer), false);
  assert.equal(isText('huge.txt', new ArrayBuffer(2_000_001)), false);
});
test('new character wording inherits defaults while saved edits and energy zero survive', () => {
  const result = settings({ energy: 0, copy: { hello: 'A new hello' } });
  assert.equal(result.energy, 0);
  assert.equal(result.copy.hello, 'A new hello');
  assert.equal(result.copy.about, core.COPY.about);
});
test('Circus parsing preserves the original pairing and discards scripts and markup', () => {
  const page = '<script>bad()</script><div class="comic"><script pagespeed_no_defer>tracking()</script><img src="/img/96.gif"></div><div class="quote">A &amp; B <em>again</em> &#39;yes&#39;</div><a href="/perm.php?c=96&amp;q=131">Share</a>';
  assert.deepEqual(core.circusPair(page), { image: 'https://nietzschefamilycircus.com/img/96.gif', quote: "A & B again 'yes'", permalink: 'https://nietzschefamilycircus.com/perm.php?c=96&q=131' });
  assert.throws(() => core.circusPair('<img src="https://other.example/tracker">'), /changed/);
});
