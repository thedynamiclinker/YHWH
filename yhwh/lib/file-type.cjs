const { filenameLanguage, normalizeLanguage, normalizeMime, fileName, fileExtension, applyLanguageRules } = require('./editor-language.mjs');
const mimeLanguages = {
  'application/x-shellscript': 'shell', 'text/x-shellscript': 'shell',
  'application/x-perl': 'perl', 'application/x-ruby': 'ruby',
  'application/x-php': 'php', 'text/x-php': 'php',
  'application/x-httpd-php': 'php', 'application/x-httpd-php-source': 'php',
  'text/x-c++src': 'c++', 'text/x-c++hdr': 'c++', 'text/x-chdr': 'c',
  'text/x-csrc': 'c', 'text/x-objcsrc': 'objective-c',
  'text/x-tex': 'latex', 'application/x-tex': 'latex',
  'text/x-diff': 'diff', 'text/x-patch': 'diff',
  'application/ld+json': 'json-ld',
  'application/typescript': 'typescript', 'text/x-typescript': 'typescript',
  'text/jsx': 'jsx', 'text/tsx': 'tsx',
  'text/x-java-source': 'java', 'text/x-ini': 'properties files',
  'text/x-systemd-unit': 'properties files', 'application/x-desktop': 'properties files',
};
const extensionMimes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', pdf: 'application/pdf', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', tsv: 'text/tab-separated-values' };
const shellFilename = /^(?:rc|\.?profile|\.?bash(?:rc|_profile|_login|_logout)|\.?zsh(?:rc|env|profile|login|logout)|\.xinitrc|\.xprofile|\.env(?:\..+)?)$/;

function byMime(mime) {
  if (Object.hasOwn(mimeLanguages, mime)) return mimeLanguages[mime];
  if (mime === 'text/plain') return;
  if (mime === 'application/xhtml+xml') return 'html';
  if (mime.endsWith('+xml')) return 'xml';
  if (mime.endsWith('+json')) return 'json';
  return /^(?:text|application)\/(?:x-)?([\w+#.-]+)$/.test(mime) ? normalizeLanguage(mime.split('/')[1].replace(/^x-/, '')) : undefined;
}

function byFilename(name, extension) {
  if (shellFilename.test(name)) return 'shell';
  const match = filenameLanguage(name) || filenameLanguage(name.toLowerCase());
  if (match) return match;
  if (extension === 'zsh' || extension === 'conf') return 'shell';
  if (['ini', 'service', 'timer', 'socket', 'desktop'].includes(extension) || /^\.(?:gitconfig|editorconfig|npmrc|gitattributes)$/.test(name)) return 'properties files';
  if (/^(?:Dockerfile|Containerfile)(?:\..*)?$/i.test(name)) return 'dockerfile';
}

function byContents(prefix) {
  const start = new TextDecoder().decode(prefix.subarray(0, 8192));
  const firstLine = start.split('\n', 1)[0];
  const interpreter = /^#![ \t]*(?:\S+\/)?([^\s/]+)/.exec(firstLine)?.[1];
  const executable = interpreter === 'env'
    ? /^#!\s*\S+\benv\s+(?:(?:-S|--split-string|--|\w+=\S+)\s+)*(?:\S+\/)?([\w.-]+)/.exec(firstLine)?.[1]
    : interpreter;
  if (executable) {
    if (/^python(?:[\d.]+)?$/.test(executable)) return 'python';
    if (['node', 'nodejs', 'bun', 'deno'].includes(executable)) return 'javascript';
    if (['bash', 'sh', 'dash', 'ksh', 'zsh', 'fish', 'ash'].includes(executable)) return 'shell';
    return normalizeLanguage(executable);
  }
  if (/^\s*(?:<!doctype\s+html\b|<html[\s>])/i.test(start)) return 'html';
  if (/^\s*<\?xml[\s?]/i.test(start)) return 'xml';
  if (/^\s*[\[{]/.test(start)) {
    try { JSON.parse(start); return 'json'; } catch {}
  }
}

function fileType(filename, prefix, config = {}, mime = '', languageRules = '') {
  const name = fileName(filename), extension = fileExtension(name);
  mime = normalizeMime(mime);
  if (!mime || mime === 'application/octet-stream') mime = extensionMimes[extension] || mime;
  const nameLanguage = byFilename(name, extension);
  const mimeLanguage = byMime(mime);
  // MIME registries use .ts and .tsx for both source code and XML formats.
  const sharedExtension = ['text/vnd.trolltech.linguist', 'application/x-tiled-tsx'].includes(mime);
  const specificJavaScript = mimeLanguage === 'javascript' && ['jsx', 'tsx', 'typescript'].includes(nameLanguage);
  const detected = (sharedExtension ? byContents(prefix) : undefined)
    || (specificJavaScript ? nameLanguage : mimeLanguage)
    || nameLanguage || byContents(prefix) || 'plain';
  let language = detected;
  let rules = [];
  try { rules = JSON.parse(config.file_types || '[]'); } catch {}
  for (const rule of Array.isArray(rules) ? rules : []) {
    try {
      if ((rule.extension && rule.extension.replace(/^\./, '') === extension) || (rule.filename && new RegExp(rule.filename).test(name))) language = normalizeLanguage(rule.language) || language;
    } catch {}
  }
  language = applyLanguageRules(languageRules, filename, mime || 'application/octet-stream', language);
  const viewer = mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : ['xlsx', 'xls', 'xlsm', 'ods'].includes(extension) || /spreadsheet|ms-excel/.test(mime) ? 'spreadsheet' : ['csv', 'tsv'].includes(extension) || ['text/csv', 'text/tab-separated-values'].includes(mime) ? 'table' : null;
  // Attachments belong to the user's preferred application. PDF is the one
  // optional in-app viewer; known source languages remain editable text.
  const external = viewer ? viewer !== 'pdf' : !!mime && !['application/octet-stream', 'inode/x-empty', 'application/x-empty', 'application/x-zerosize'].includes(mime) && !mime.startsWith('text/') && detected === 'plain';
  return { mime: mime || 'application/octet-stream', language, viewer, external };
}
module.exports = { fileType };
