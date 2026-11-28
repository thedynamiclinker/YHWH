// Every platform adapter must implement these operations, or record a concrete
// platform limitation. Keep IPC allowlists and mobile parity checks in sync.
const callChannels = [
  'bootstrap', 'directory:list', 'chat', 'world:enter', 'world:leave', 'world:books', 'world:quotes',
  'focus:new', 'focus:close', 'navigate', 'list', 'path:stat', 'file:read', 'file:save', 'file:create',
  '@-get', '@-set', 'folder-menu:list', 'folder-menu:run',
  'file:move', 'file:copy', 'file:trash', 'file:external', 'file:reveal', 'clipboard:path', 'choose',
  'editor:language-rule', 'editor:language-feedback',
  'choose:save', 'settings:save', 'config:open', 'config:reload', 'words:save', 'plugins', 'circus',
  'external', 'mail', 'words:read', 'offering:piece', 'window:close', 'verse:catalog', 'verse:chapter', 'verse:get',
  'verse:random', 'verse:commentary', 'keys:run', 'keys:shell', 'keys:save',
  'terminal:open', 'terminal:close',
  'universe:create', 'universe:cancel', 'universe:cd', 'universe:go',
];
module.exports = { callChannels };
