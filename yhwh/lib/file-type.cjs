const { languages } = require('@codemirror/language-data');
const { LanguageDescription } = require('@codemirror/language');
const mimeLanguages = { 'text/markdown': 'markdown', 'text/x-markdown': 'markdown', 'application/json': 'json', 'text/html': 'html', 'text/x-python': 'python', 'application/x-shellscript': 'shell', 'text/x-shellscript': 'shell', 'text/x-tex': 'latex', 'application/xml': 'xml', 'image/svg+xml': 'xml' };
function fileType(filename, prefix, config = {}, mime = '') {
  const name = filename.split(/[/\\]/).at(-1), extension = name.lastIndexOf('.') > 0 ? name.split('.').at(-1).toLowerCase() : '';
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
  return { mime: mime || 'application/octet-stream', language };
}
module.exports = { fileType };
