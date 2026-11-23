import { languages as bundledLanguages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';

const languages = [
  LanguageDescription.of({
    name: 'Makefile', alias: ['make', 'gnumake'], extensions: ['mk', 'mak'],
    filename: /^(?:GNUmakefile|Makefile(?:\..+)?|makefile)$/,
    load: () => import('./makefile-language.mjs').then(module => module.makefile()),
  }),
  ...bundledLanguages,
];
const ruleFile = 'etc/editor/languages';
const feedbackFile = 'var/lib/editor/language-feedback.tsv';
const languageID = item => item.name.toLowerCase();
const description = name => LanguageDescription.matchLanguageName(languages, name, false);
function normalizeLanguage(name) {
  if (typeof name !== 'string') return;
  if (['plain', 'plain text'].includes(name.toLowerCase())) return 'plain';
  return description(name)?.name.toLowerCase();
}
const filenameLanguage = name => LanguageDescription.matchFilename(languages, name)?.name.toLowerCase();
const languageLabel = name => name === 'plain' ? 'Plain Text' : description(name)?.name || name;
const fileExtension = name => name.lastIndexOf('.') > 0 ? name.split('.').at(-1).toLowerCase() : '';
const portablePath = filename => /^(?:[a-z]:\\|\\\\)/i.test(filename) ? filename.replaceAll('\\', '/') : filename;
const fileName = filename => portablePath(filename).split('/').at(-1);
const normalizeMime = mime => mime.split(';', 1)[0].trim().toLowerCase();

const escapes = { '\\': '\\', '\t': 't', '\r': 'r', '\n': 'n' };
const unescapes = Object.fromEntries(Object.entries(escapes).map(([key, value]) => [value, key]));
const fields = line => line.split('\t').map(value => value.replace(/\\([\\trn])/g, (_, key) => unescapes[key]));
const record = (...values) => values.map(value => value.replace(/[\\\t\r\n]/g, char => '\\' + escapes[char])).join('\t') + '\n';

function applyLanguageRules(rules, filename, mime, language) {
  const name = fileName(filename), extension = fileExtension(name);
  const target = portablePath(filename);
  for (const line of rules.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const [kind, pattern, value, directory, ...extra] = fields(line);
    if (!pattern || !value || extra.length) continue;
    if (directory && !target.startsWith(portablePath(directory).replace(/\/$/, '') + '/')) continue;
    const matches = kind === 'filename' && pattern === name
      || kind === 'extension' && pattern.replace(/^\./, '').toLowerCase() === extension
      || kind === 'mime' && normalizeMime(pattern) === mime;
    if (matches) language = normalizeLanguage(value) || language;
  }
  return language;
}

function languageRuleLine(filename, language, scope) {
  const name = fileName(filename), extension = fileExtension(name);
  language = normalizeLanguage(language);
  if (!language || !name || !['filename', 'extension', 'directory'].includes(scope)) throw new Error('Choose a valid language rule.');
  if (scope === 'filename') return record('filename', name, language);
  if (!extension) throw new Error('This file has no extension. Choose the filename rule.');
  if (scope === 'extension') return record('extension', extension, language);
  const directory = portablePath(filename).slice(0, -name.length).replace(/\/$/, '') || '/';
  return record('extension', extension, language, directory);
}

function languageFeedbackLine({ filename, mime, detected, selected, explanation }) {
  if (typeof filename !== 'string' || !filename || typeof mime !== 'string' || !normalizeLanguage(detected) || !normalizeLanguage(selected)) throw new Error('The highlighting choice is invalid.');
  if (typeof explanation !== 'string' || !explanation.trim() || explanation.length > 10000) throw new Error('Enter an explanation between 1 and 10,000 characters.');
  return record(new Date().toISOString(), filename, mime, detected, selected, explanation);
}

export { languages, languageID, description, filenameLanguage, normalizeLanguage, languageLabel, fileExtension, fileName, normalizeMime, applyLanguageRules, languageRuleLine, languageFeedbackLine, ruleFile, feedbackFile };
