const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("avatarTools", {
  readConfig: () => ipcRenderer.invoke("avatar:config", { action: "read" }),
  saveConfig: (config) =>
    ipcRenderer.invoke("avatar:config", { ...config, action: "save" }),
  clearConfig: () => ipcRenderer.invoke("avatar:config", { action: "clear" }),
  outputKey: () => ipcRenderer.invoke("avatar:output-key"),
  openSetup: (target) => ipcRenderer.invoke("avatar:open-setup", target),
});
contextBridge.exposeInMainWorld("browserDocks", {
  create: (id, url) => ipcRenderer.invoke("dock:create", { id, url }),
  layout: (rectangles) => ipcRenderer.send("dock:layout", rectangles),
  command: (id, action, url) =>
    ipcRenderer.invoke("dock:command", { id, action, url }),
  remove: (id) => ipcRenderer.invoke("dock:remove", id),
  onStatus: (callback) => {
    const handler = (_, status) => callback(status);
    ipcRenderer.on("dock:status", handler);
    return () => ipcRenderer.removeListener("dock:status", handler);
  },
});
