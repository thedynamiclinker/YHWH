const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("yhwh", {
  twhwRead: () => ipcRenderer.invoke("twhw:read"),
  twhwSettings: (input) => ipcRenderer.invoke("twhw:settings", input),
  twhwChat: (message) => ipcRenderer.invoke("twhw:chat", message),
  twhwTerminal: () => ipcRenderer.invoke("twhw:terminal"),
  circus: () => ipcRenderer.invoke("twhw:circus"),
  read: () => ipcRenderer.invoke("workspace:read"),
  reviewRead: () => ipcRenderer.invoke("review:read"),
  reviewAct: (action, input) => ipcRenderer.invoke("review:act", action, input),
  reviewChoose: () => ipcRenderer.invoke("review:choose"),
  reviewExport: () => ipcRenderer.invoke("review:export"),
  act: (action, input) => ipcRenderer.invoke("workspace:act", action, input),
  hunks: (patch) => ipcRenderer.invoke("patch:hunks", patch),
  copy: (content) => ipcRenderer.invoke("clipboard:write", content),
  importRepository: (input) => ipcRenderer.invoke("repository:import", input),
  exportCompany: (companyId) =>
    ipcRenderer.invoke("workspace:export", companyId),
  openFolder: () => ipcRenderer.invoke("workspace:folder"),
  onExport: (callback) => ipcRenderer.on("ui:export", () => callback()),
  onBeforeClose: (callback) =>
    ipcRenderer.on("ui:before-close", () => callback()),
  closeAfterSave: () => ipcRenderer.invoke("window:close"),
});
