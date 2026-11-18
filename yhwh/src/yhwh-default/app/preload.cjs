const { contextBridge, ipcRenderer, webFrame } = require('electron');
const channels = new Set(require('../../../lib/bridge-contract.cjs').callChannels);
contextBridge.exposeInMainWorld('yhwh', {
  call(channel, ...args) { if (!channels.has(channel)) throw new Error('Unknown operation.'); return ipcRenderer.invoke(channel, ...args); },
  setInterfaceZoom(factor) {
    if (typeof factor === 'number' && factor >= 0.5 && factor <= 2) webFrame.setZoomFactor(factor);
  },
  terminal(type, message) { if (['write', 'resize'].includes(type)) ipcRenderer.send(`terminal:${type}`, message); },
  on(channel, callback) {
    if (!['command', 'open', 'terminal', 'navigation', 'directory-changed', 'error'].includes(channel)) throw new Error('Unknown event.');
    const listener = (_event, value) => callback(value);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
