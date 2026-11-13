const { contextBridge, ipcRenderer } = require('electron');
const channels = new Set(['bootstrap', 'focus:new', 'focus:close', 'navigate', 'list', 'path:stat', 'file:read', 'file:save', 'file:create', 'file:move', 'file:copy', 'file:trash', 'file:external', 'file:reveal', 'clipboard:path', 'choose', 'choose:save', 'settings:save', 'config:open', 'config:reload', 'words:save', 'plugins', 'circus', 'external', 'offering:piece', 'window:close']);
contextBridge.exposeInMainWorld('yhwh', {
  call(channel, ...args) { if (!channels.has(channel)) throw new Error('Unknown operation.'); return ipcRenderer.invoke(channel, ...args); },
  terminal(type, message) { if (['write', 'resize'].includes(type)) ipcRenderer.send(`terminal:${type}`, message); },
  on(channel, callback) {
    if (!['command', 'open', 'terminal', 'navigation', 'directory-changed', 'error'].includes(channel)) throw new Error('Unknown event.');
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
