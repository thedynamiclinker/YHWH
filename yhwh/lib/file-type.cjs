const { languages } = require('@codemirror/language-data');
const { LanguageDescription } = require('@codemirror/language');
const mimeLanguages = { 'text/markdown': 'markdown', 'text/x-markdown': 'markdown', 'application/json': 'json', 'text/html': 'html', 'text/x-python': 'python', 'application/x-shellscript': 'shell', 'text/x-shellscript': 'shell', 'text/x-tex': 'latex', 'application/xml': 'xml', 'image/svg+xml': 'xml' };
const extensionMimes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', ico: 'image/x-icon', pdf: 'application/pdf', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel', xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12', ods: 'application/vnd.oasis.opendocument.spreadsheet', csv: 'text/csv', tsv: 'text/tab-separated-values' };
function fileType(filename, prefix, config = {}, mime = '') {
  const name = filename.split(/[/\\]/).at(-1), extension = name.lastIndexOf('.') > 0 ? name.split('.').at(-1).toLowerCase() : '';
  if (!mime || mime === 'application/octet-stream') mime = extensionMimes[extension] || mime;
  let language = mimeLanguages[mime] || LanguageDescription.matchFilename(languages, name)?.name.toLowerCase() || (name === 'rc' || extension === 'conf' ? 'shell' : 'plain');
  if (language === 'plain') {
    const shebang = new TextDecoder().decode(prefix.subarray(0, 200)).split('\n')[0];
    const interpreter = /^#!.*\b(python[\d.]*|node|bash|sh|zsh|fish|ruby|perl)\b/.exec(shebang)?.[1];
    if (interpreter) language = interpreter.startsWith('python') ? 'python' : interpreter === 'node' ? 'javascript' : ['bash', 'sh', 'zsh', 'fish'].includes(interpreter) ? 'shell' : interpreter;
  }
  let rules = [];
  try { rules = JSON.parse(config.file_types || '[]'); } catch {}
  for (const rule of rules) {
    try { if ((rule.extension && rule.extension.replace(/^\./, '') === extension) || (rule.filename && new RegExp(rule.filename).test(name))) language = rule.language; } catch {}
  }
  const viewer = mime === 'application/pdf' ? 'pdf' : mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : ['xlsx', 'xls', 'xlsm', 'ods'].includes(extension) || /spreadsheet|ms-excel/.test(mime) ? 'spreadsheet' : ['csv', 'tsv'].includes(extension) || ['text/csv', 'text/tab-separated-values'].includes(mime) ? 'table' : null;
  // Attachments belong to the user's preferred application. PDF is the one
  // optional in-app viewer; known source languages remain editable text.
  const external = viewer ? viewer !== 'pdf' : !!mime && !['application/octet-stream', 'inode/x-empty', 'application/x-empty'].includes(mime) && !mime.startsWith('text/') && language === 'plain';
  return { mime: mime || 'application/octet-stream', language, viewer, external };
}
module.exports = { fileType };
