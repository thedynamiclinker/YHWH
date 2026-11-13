const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("yhwh", {
  call: (method, input) => ipcRenderer.invoke("call", method, input),
  onTerminal: (callback) => {
    const listener = (_, event) => callback(event);
    ipcRenderer.on("terminal", listener);
    return () => ipcRenderer.removeListener("terminal", listener);
  },
  onDirectory: (callback) => {
    const listener = (_, event) => callback(event);
    ipcRenderer.on("directory", listener);
    return () => ipcRenderer.removeListener("directory", listener);
  },
});
